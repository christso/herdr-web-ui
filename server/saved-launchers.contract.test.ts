import { afterEach, beforeEach, expect, it, spyOn } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import type { AgentKind, SavedAgentLauncher } from "../shared/protocol.ts";
import { DEVICE_COOKIE } from "./auth.ts";
import { descriptorPath } from "./bridge.ts";
import { DeviceStore } from "./devices.ts";
import { createServer, type ServerInstance } from "./index.ts";
import { MachineManager } from "./machines.ts";
import { SavedLauncherStore } from "./saved-launchers.ts";
import * as herdr from "./herdr/client.ts";
import { UsageService } from "./usage.ts";

let root: string;
const servers: ServerInstance[] = [];
let restoreHome: () => void;
let previousEnv: { PATH?: string; CODEX_HOME?: string };
const nativeFetch = globalThis.fetch;
const header = { "x-herdr-machine": "1", "content-type": "application/json" };
const id = "saved:00000000-0000-4000-8000-000000000001";
const input = { kind: "codex", label: "Research", executable: process.execPath, args: ["resume", "two words", ""] };
beforeEach(() => {
  root = mkdtempSync(join(os.tmpdir(), "saved-contract-"));
  const home = spyOn(os, "homedir").mockReturnValue(root);
  restoreHome = () => home.mockRestore();
  previousEnv = { PATH: process.env["PATH"], CODEX_HOME: process.env["CODEX_HOME"] };
  process.env["CODEX_HOME"] = join(root, "codex-home");
  mkdirSync(process.env["CODEX_HOME"]!);
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin/codex"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  writeFileSync(join(root, "bin/codex-discovered"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  process.env["PATH"] = `${join(root, "bin")}:${previousEnv.PATH ?? ""}`;
});
afterEach(() => {
  for (const server of servers.splice(0)) server.stop();
  restoreHome();
  for (const key of ["PATH", "CODEX_HOME"] as const) {
    if (previousEnv[key] === undefined) delete process.env[key]; else process.env[key] = previousEnv[key];
  }
  rmSync(root, { recursive: true, force: true });
});
function server(dir: string, options: { machines?: boolean; registerBridge?: boolean } = {}) {
  const instance = createServer({ port: 0, hostname: "127.0.0.1", stateDir: dir, token: "fixture-controller", tailscaleOwner: null, sidecar: false, usage: new UsageService(undefined, []), ...options });
  servers.push(instance);
  return `http://127.0.0.1:${instance.port}`;
}
function watch(dir: string): string {
  const devices = new DeviceStore(dir), paired = devices.pair(devices.startPairing().code, "Watching fixture", "watch")!;
  devices.match(paired.token);
  return `${DEVICE_COOKIE}=${paired.token}`;
}
function request(base: string, path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return nativeFetch(base + path, { method, headers: { ...header, authorization: "Bearer fixture-controller", origin: base, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

it.skipIf(process.platform !== "linux" && process.platform !== "darwin")("denies watch definition paths before forwarding, and refuses noncanonical paths before forwarding", async () => {
  const localDir = join(root, "local"), remoteDir = join(root, "remote"), cookie = watch(localDir);
  mkdirSync(remoteDir);
  writeFileSync(join(remoteDir, "agent-launchers.json"), JSON.stringify({ version: 1, launchers: [{ ...input, id, label: "Remote only" }] }));
  const remote = server(remoteDir, { machines: false, registerBridge: true });
  const bridgeToken = JSON.parse(readFileSync(descriptorPath(), "utf8")).token as string;
  const endpoint = spyOn(MachineManager.prototype, "endpoint").mockReturnValue({ url: remote, token: bridgeToken });
  let forwarded = 0;
  const trackedFetch = async (url: RequestInfo | URL, init?: RequestInit) => { if (String(url).startsWith(remote)) forwarded++; return nativeFetch(url, init); };
  const tracking = spyOn(globalThis, "fetch").mockImplementation(Object.assign(trackedFetch, { preconnect: nativeFetch.preconnect }));
  const local = server(localDir);
  try {
    for (const path of ["/api/agents/launchers", "/api/machines/local/agents/launchers", "/api/machines/remote/agents/launchers"]) {
      const control = await request(local, path);
      expect(control.status).toBe(200);
      const before = forwarded;
      const denied = await request(local, path, "GET", undefined, { authorization: "", cookie });
      expect(denied.status).toBe(403);
      expect((await denied.json()).error.code).toBe("read_only");
      expect(forwarded).toBe(before);
      for (const method of ["POST", "PUT", "DELETE"]) {
        const mutation = await request(local, `${path}?id=${encodeURIComponent(id)}`, method, input, { authorization: "", cookie });
        expect(mutation.status).toBe(403);
        expect((await mutation.json()).error.code).toBe("read_only");
        expect(forwarded).toBe(before);
      }
    }
    for (const path of ["/api/agents/launchers/", "/api/machines/local/agents/launchers/", "/api/machines/remote/agents/launchers/"]) {
      const denied = await request(local, path, "GET", undefined, { authorization: "", cookie });
      expect(denied.status).toBe(404);
      expect((await denied.json()).error.code).toBe("not_found");
    }
    const catalog = await request(local, "/api/machines/remote/agents", "GET", undefined, { authorization: "", cookie });
    expect(catalog.status).toBe(200);
    const summary = await catalog.text();
    expect(summary).toContain("Remote only");
    expect(summary).not.toContain(input.executable);
    expect(summary).not.toContain("two words");
  } finally { tracking.mockRestore(); endpoint.mockRestore(); }
}, 30_000);

it.skipIf(process.platform !== "linux" && process.platform !== "darwin")("keeps the ordinary catalog when optional saved state cannot be read, while saved operations fail closed", async () => {
  for (const bytes of ["{broken", JSON.stringify({ version: 2, launchers: [] }), JSON.stringify({ version: 1, launchers: [{ ...input, id }, { ...input, id }] })]) {
    const dir = mkdtempSync(join(root, "bad-")), path = join(dir, "agent-launchers.json");
    writeFileSync(path, bytes);
    const base = server(dir, { machines: false });
    const catalog = await request(base, "/api/agents");
    expect(catalog.status).toBe(200);
    const codex = (await catalog.json() as { agents: AgentKind[] }).agents.find((entry) => entry.kind === "codex")!;
    expect(codex.installed).toBeTrue();
    expect(codex).not.toHaveProperty("profiles");
    expect(codex.launchers).toBeUndefined();
    expect(codex.launcher_search).toBeTrue();
    const management = await request(base, "/api/agents/launchers");
    expect((await management.json()).error.code).toBe("launcher_store_unavailable");
    for (const route of ["workspace", "tab", "worktree"]) {
      const selected = await request(base, `/api/${route}/create`, "POST", { cwd: root, workspace_id: "fixture-only", branch: "fixture-only", agent: { kind: "codex", launcher: id } });
      expect((await selected.json()).error.code).toBe("launcher_store_unavailable");
    }
    expect((await request(base, "/api/agents/launchers", "POST", input)).ok).toBeFalse();
    expect(readFileSync(path, "utf8")).toBe(bytes);
  }
}, 30_000);

it.skipIf(process.platform !== "linux" && process.platform !== "darwin")("shares CRUD across clients and restart, enforces origin, and keeps same IDs on their owning PC", async () => {
  const localDir = join(root, "local"), remoteDir = join(root, "remote");
  for (const [dir, label] of [[localDir, "Local only"], [remoteDir, "Remote only"]]) {
    mkdirSync(dir!);
    writeFileSync(join(dir!, "agent-launchers.json"), JSON.stringify({ version: 1, launchers: [{ ...input, id, label }] }));
  }
  const remote = server(remoteDir, { machines: false });
  const endpoint = spyOn(MachineManager.prototype, "endpoint").mockReturnValue({ url: remote, token: "fixture-controller" });
  let local = server(localDir);
  try {
    const list = async (path: string) => (await (await request(local, path)).json()).launchers as SavedAgentLauncher[];
    expect((await list("/api/agents/launchers"))[0]!.label).toBe("Local only");
    expect((await list("/api/machines/remote/agents/launchers"))[0]!.label).toBe("Remote only");
    const basePath = "/api/machines/remote/agents/launchers";
    const created = await request(local, basePath, "POST", { ...input, label: "Shared" });
    expect(created.status).toBe(200);
    const next = (await created.json()).launchers.at(-1) as SavedAgentLauncher;
    expect((await list(basePath)).at(-1)).toEqual(next);
    expect(new SavedLauncherStore(localDir).get()).toHaveLength(1);
    expect(new SavedLauncherStore(remoteDir).get()).toHaveLength(2);
    const edited = await request(local, `${basePath}?id=${encodeURIComponent(next.id)}`, "PUT", { ...input, label: "Edited" });
    expect(edited.status).toBe(200);
    expect(new SavedLauncherStore(remoteDir).get().at(-1)!.label).toBe("Edited");
    expect((await request(local, `/api/machines/local/agents/launchers?id=${encodeURIComponent(id)}`, "PUT", { ...input, label: "Local only" })).status).toBe(200);
    const malformed = await nativeFetch(`${local}/api/agents/launchers`, { method: "POST", headers: { ...header, authorization: "Bearer fixture-controller", origin: local }, body: "{broken" });
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe("invalid_json");
    for (const path of ["/api/agents/launchers", "/api/machines/local/agents/launchers", basePath]) {
      const cross = await request(local, path, "POST", input, { origin: "https://other.invalid" });
      expect(cross.status).toBe(403);
      expect((await cross.json()).error.code).toBe("invalid_origin");
      for (const bad of [{ ...input, id }, { ...input, args: ["bad\n"] }, { ...input, kind: "unsupported" }]) expect((await request(local, path, "POST", bad)).status).toBe(400);
    }
    expect((await request(local, `${basePath}?id=${encodeURIComponent(next.id)}`, "DELETE", {})).status).toBe(200);
    expect(new SavedLauncherStore(remoteDir).get()).toHaveLength(1);
    const lastLocal = servers.at(-1)!; lastLocal.stop(); servers.pop();
    local = server(localDir);
    expect((await list("/api/machines/local/agents/launchers"))[0]!.label).toBe("Local only");
    expect((await list(basePath))[0]!.label).toBe("Remote only");
  } finally { endpoint.mockRestore(); }
}, 30_000);

function repository(dir: string) {
  for (const args of [["init"], ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "Fixture"]]) {
    const result = Bun.spawnSync(["git", "-C", dir, ...args], { env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" } });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  }
}

it.skipIf(process.platform !== "linux" && process.platform !== "darwin")("runs persisted executable argv literally through workspace, tab and worktree creation", async () => {
  const executable = join(root, "codex"), recorder = join(root, "recorder.cjs"), marker = join(root, "argv.json"), sentinel = join(root, "injected");
  copyFileSync(process.execPath, executable); chmodSync(executable, 0o700);
  writeFileSync(recorder, 'require("node:fs").writeFileSync(process.argv[2], JSON.stringify({args:process.argv.slice(3),cwd:process.cwd()}));process.stdin.resume();setInterval(()=>{},1000);');
  const args = ["two words", "a'quote", `$(touch ${sentinel}); *`, "", 'a"quote'];
  const stateDir = join(root, "state"), [entry] = new SavedLauncherStore(stateDir).save({ ...input, executable, args: [recorder, marker, ...args] });
  expect(existsSync(marker)).toBeFalse();
  repository(root);
  const base = server(stateDir, { machines: false });
  const source = await herdr.workspaceCreate({ cwd: root, label: "herdr-web-ui-test-saved-source" });
  const owned: string[] = [source.workspace.workspace_id], worktrees: string[] = [];
  try {
    for (const route of ["workspace", "tab", "worktree"]) {
      rmSync(marker, { force: true });
      const label = `herdr-web-ui-test-saved-${route}`, path = join(root, "checkout");
      const response = request(base, `/api/${route}/create`, "POST", { cwd: root, workspace_id: source.workspace.workspace_id, label, branch: "saved-fixture", path, agent: { kind: "codex", launcher: entry!.id } });
      let paneId: string | undefined;
      const deadline = Date.now() + 15_000;
      while (!paneId) {
        const snapshot = await herdr.sessionSnapshot();
        const workspace = snapshot.workspaces.find((entry) => entry.label === label);
        const pane = snapshot.panes.find((entry) => (route === "tab" ? entry.workspace_id === source.workspace.workspace_id && entry.pane_id !== source.root_pane.pane_id : entry.workspace_id === workspace?.workspace_id) && entry.agent === "codex");
        if (existsSync(marker) && pane) paneId = pane.pane_id;
        else { if (Date.now() > deadline) throw new Error(`Saved ${route} fixture did not execute`); await Bun.sleep(50); }
      }
      await herdr.herdrRpc("pane.report_agent", { pane_id: paneId, source: "manual", agent: "codex", state: "idle" });
      const answer = await response, created = await answer.json();
      if (route === "worktree") worktrees.push(created.workspace_id); else if (route === "workspace") owned.push(created.workspace_id);
      expect(answer.status).toBe(200);
      expect(created.agent_started).toBeTrue();
      expect(created.pane_id).toBe(paneId);
      expect(JSON.parse(readFileSync(marker, "utf8"))).toEqual({ args, cwd: route === "worktree" ? path : root });
      expect(existsSync(sentinel)).toBeFalse();
    }
  } finally {
    for (const workspace of worktrees) await herdr.herdrRpc("worktree.remove", { workspace_id: workspace, force: true }).catch(() => undefined);
    for (const workspace of owned.reverse()) await herdr.workspaceClose(workspace).catch(() => undefined);
  }
}, 60_000);

it.skipIf(process.platform !== "linux" && process.platform !== "darwin")("preserves a created worktree pane without sending input if its saved selection disappears during checkout", async () => {
  repository(root);
  const executable = join(root, "never-run"), marker = join(root, "ran");
  const base = server(join(root, "state"), { machines: false });
  const source = await herdr.workspaceCreate({ cwd: root, label: "herdr-web-ui-test-saved-race-source" });
  const original = herdr.worktreeCreate, originalSend = herdr.paneSendText;
  const owned: string[] = [];
  let inputWrites = 0;
  const inputSpy = spyOn(herdr, "paneSendText").mockImplementation(async (...args) => { inputWrites++; return originalSend(...args); });
  try {
    for (const mutation of ["removed", "missing-executable"]) {
      writeFileSync(executable, `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o700 });
      const response = await request(base, "/api/agents/launchers", "POST", { ...input, executable });
      const entry = (await response.json()).launchers.at(-1) as SavedAgentLauncher;
      const checkout = spyOn(herdr, "worktreeCreate").mockImplementationOnce(async (...args) => {
        const made = await original(...args);
        owned.push(made.workspace.workspace_id);
        if (mutation === "removed") expect((await request(base, `/api/agents/launchers?id=${encodeURIComponent(entry.id)}`, "DELETE", {})).status).toBe(200);
        else rmSync(executable);
        return made;
      });
      try {
        const answer = await request(base, "/api/worktree/create", "POST", { workspace_id: source.workspace.workspace_id, branch: `saved-${mutation}`, path: join(root, mutation), agent: { kind: "codex", launcher: entry.id } });
        const created = await answer.json();
        expect(answer.status).toBe(200);
        expect(created.agent_started).toBeFalse();
        expect(created.error.code).toBe("invalid_agent_launcher");
        expect(created.pane_id).toBeString();
        expect((await herdr.sessionSnapshot()).panes.some((pane) => pane.pane_id === created.pane_id)).toBeTrue();
        expect(inputWrites).toBe(0);
        expect(existsSync(marker)).toBeFalse();
      } finally { checkout.mockRestore(); }
    }
  } finally {
    inputSpy.mockRestore();
    for (const workspace of owned) await herdr.herdrRpc("worktree.remove", { workspace_id: workspace, force: true }).catch(() => undefined);
    await herdr.workspaceClose(source.workspace.workspace_id).catch(() => undefined);
  }
}, 30_000);

it.skipIf(process.platform !== "linux" && process.platform !== "darwin")("authorizes executable search before direct, alias and remote forwarding and rejects noncanonical paths", async () => {
  const localDir = join(root, "search-local"), remoteDir = join(root, "search-remote"), cookie = watch(localDir);
  const marker = join(root, "must-not-run");
  writeFileSync(join(root, "bin/research.js"), `#!/bin/sh\ntouch '${marker}'`, { mode: 0o700 });
  const remote = server(remoteDir, { machines: false, registerBridge: true });
  const bridgeToken = JSON.parse(readFileSync(descriptorPath(), "utf8")).token as string;
  const endpoint = spyOn(MachineManager.prototype, "endpoint").mockReturnValue({ url: remote, token: bridgeToken });
  let forwarded = 0;
  const tracking = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).startsWith(remote)) { forwarded++; expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${bridgeToken}`); }
    return nativeFetch(url, init);
  }, { preconnect: nativeFetch.preconnect }));
  const local = server(localDir);
  try {
    for (const route of ["/api/agents/launchers/search", "/api/machines/local/agents/launchers/search", "/api/machines/remote/agents/launchers/search"]) {
      for (const slash of ["", "/"]) {
        const path = `${route}${slash}?q=research`;
        if (slash) {
          const before = forwarded;
          const refusedHeaders: Record<string, string>[] = [{}, { authorization: "", cookie }, { origin: "https://other.invalid" }];
          for (const headers of refusedHeaders) {
            expect((await request(local, path, "GET", undefined, headers)).status).toBe(404);
          }
          expect(forwarded).toBe(before);
          continue;
        }
        const success = await request(local, path);
        expect(success.status).toBe(200);
        expect(await success.json()).toEqual({ names: ["research.js"] });
        const before = forwarded;
        const denied = await request(local, path, "GET", undefined, { authorization: "", cookie });
        expect(denied.status).toBe(403); expect((await denied.json()).error.code).toBe("read_only");
        const cross = await request(local, path, "GET", undefined, { origin: "https://other.invalid" });
        expect(cross.status).toBe(403); expect((await cross.json()).error.code).toBe("invalid_origin");
        expect(forwarded).toBe(before);
      }
    }
    expect(forwarded).toBe(1);
    expect(existsSync(marker)).toBeFalse();
    expect(new SavedLauncherStore(localDir).get()).toEqual([]);
    expect(new SavedLauncherStore(remoteDir).get()).toEqual([]);
  } finally { tracking.mockRestore(); endpoint.mockRestore(); }
}, 30_000);
