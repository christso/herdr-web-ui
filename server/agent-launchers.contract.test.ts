import { afterAll, expect, it, spyOn } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "./index.ts";
import { launchedAgents } from "./launched-agents.ts";
import type { WorkspaceCreated } from "../shared/protocol.ts";
import { agentGet, herdrRpc, sessionSnapshot, workspaceClose, workspaceCreate } from "./herdr/client.ts";

const stateDir = mkdtempSync(join(tmpdir(), "herdr-web-launcher's-contract-"));
const home = spyOn(os, "homedir").mockReturnValue(stateDir);
const previousPath = process.env["PATH"];
const previousCodexHome = process.env["CODEX_HOME"];
process.env["PATH"] = `${stateDir}:/usr/bin:/bin`;
process.env["CODEX_HOME"] = join(stateDir, "codex-home");
mkdirSync(process.env["CODEX_HOME"]!);
writeFileSync(join(stateDir, "codex"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
writeFileSync(join(process.env["CODEX_HOME"]!, "private.config.toml"), 'model = "secret-fixed-argument"');
const launcher = join(stateDir, "codex-private");
writeFileSync(launcher, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

const server = createServer({ port: 0, hostname: "127.0.0.1", token: "", stateDir });
const base = `http://127.0.0.1:${server.port}`;
async function saveLauncher(kind: string, executable: string): Promise<string> {
  const response = await fetch(`${base}/api/agents/launchers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, label: "Fixture", executable, args: [] }) });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()).launchers.at(-1).id;
}
const deleteLauncher = (id: string) => fetch(`${base}/api/agents/launchers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
afterAll(() => {
  home.mockRestore();
  if (previousPath === undefined) delete process.env["PATH"]; else process.env["PATH"] = previousPath;
  if (previousCodexHome === undefined) delete process.env["CODEX_HOME"]; else process.env["CODEX_HOME"] = previousCodexHome;
  server.stop(); rmSync(stateDir, { recursive: true, force: true }); });
it.skipIf(process.platform === "win32")("HTTP catalog omits native profiles and automatic wrapper choices", async () => {
  const response = await fetch(`${base}/api/agents`);
  const text = await response.text();
  expect(response.status).toBe(200);
  expect(text).not.toContain(launcher);
  expect(text).not.toContain("secret-fixed-argument");
  const codex = JSON.parse(text).agents.find((agent: { kind: string }) => agent.kind === "codex");
  expect(codex).not.toHaveProperty("profiles");
  expect(codex.launchers).toBeUndefined();
  expect(codex.launcher_search).toBeTrue();
});
it.skipIf(process.platform === "win32")("keeps canonical installed availability separate from valid wrapper availability", async () => {
  const path = process.env["PATH"];
  try {
    process.env["PATH"] = stateDir;
    chmodSync(join(stateDir, "codex"), 0o644);
    const response = await fetch(`${base}/api/agents`);
    const catalog = await response.json();
    expect(catalog.agents.find((agent: { kind: string }) => agent.kind === "codex")).toMatchObject({ installed: false, saved_launchers: true, launcher_search: true });
  } finally { chmodSync(join(stateDir, "codex"), 0o755); process.env["PATH"] = path; }
});
it.skipIf(process.platform === "win32")("refuses invalid saved launcher selections before any creation", async () => {
  const launcherId = await saveLauncher("codex", launcher);
  try {
    const before = (await sessionSnapshot()).workspaces.map((workspace) => workspace.workspace_id);
    for (const route of ["workspace", "tab", "worktree"]) {
      for (const agent of [{ kind: "codex", launcher: "unknown" }, { kind: "pi", launcher: launcherId }, { kind: "codex", launcher: launcherId, args: [] }, { kind: "codex", launcher: "/bin/sh" }]) {
        const response = await fetch(`${base}/api/${route}/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace_id: "fixture-must-not-be-used", branch: "must-not-be-created", agent }) });
        expect(response.status).toBe(400);
        expect((await response.json()).error.code).toMatch(/^invalid_agent/);
      }
    }
    expect((await sessionSnapshot()).workspaces.map((workspace) => workspace.workspace_id)).toEqual(before);
  } finally { await deleteLauncher(launcherId); }
});


it.skipIf(process.platform !== "linux" && process.platform !== "darwin")("executes saved launchers in all creation flows without assuming an opaque launcher starts fresh", async () => {
  const root = mkdtempSync(join(tmpdir(), "herdr-launcher's-"));
  const owned: string[] = [];
  let checkout: string | null = null;
  let launcherId = "", resumeLauncherId = "";
  const marker = join(root, "executed.json");
  const recorder = join(root, "record.cjs");
  const command = join(stateDir, "codex-chosen");
  const resumeCommand = join(stateDir, "codex-resume");
  const executable = join(root, "codex");
  copyFileSync(process.execPath, executable); chmodSync(executable, 0o755);
  writeFileSync(recorder, `require("node:fs").writeFileSync(process.argv[2], JSON.stringify({ args: process.argv.slice(3), cwd: process.cwd() })); process.stdin.resume(); setInterval(() => {}, 1000);`);
  const argument = "a ' quote; $(not-a-command)";
  const quote = (word: string) => "'" + word.replaceAll("'", "'\\''") + "'";
  writeFileSync(command, `#!/bin/sh\nexec ${[executable, recorder, marker, argument].map(quote).join(" ")} "$@"\n`, { mode: 0o755 });
  writeFileSync(resumeCommand, `#!/bin/sh\nexec ${[executable, recorder, marker, "resume", argument].map(quote).join(" ")} "$@"\n`, { mode: 0o755 });
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", "-C", root, ...args], { env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" } });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  };
  try {
    launcherId = await saveLauncher("codex", command);
    resumeLauncherId = await saveLauncher("codex", resumeCommand);
    git("init"); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "Fixture");
    const source = await workspaceCreate({ cwd: root, label: "herdr-web-ui-test-profile-source" });
    owned.push(source.workspace.workspace_id);
    for (const route of ["workspace", "tab", "worktree"] as const) {
      rmSync(marker, { force: true });
      const label = `herdr-web-ui-test-profile-${route}`;
      const path = join(root, "checkout");
      const request = fetch(`${base}/api/${route}/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cwd: root, workspace_id: source.workspace.workspace_id, label, branch: "profile-fixture", path, agent: { kind: "codex", launcher: route === "tab" ? resumeLauncherId : launcherId } }) });
      // The wrapper owns the marker; no real agent binary or model call is involved. Report idle
      // only after native process detection has identified the stand-in as the requested kind.
      let paneId: string | undefined;
      for (const deadline = Date.now() + 15_000;;) {
        const snapshot = await sessionSnapshot();
        const workspace = snapshot.workspaces.find((entry) => entry.label === label);
        const pane = route === "tab" ? snapshot.panes.find((entry) => entry.workspace_id === source.workspace.workspace_id && entry.pane_id !== source.root_pane.pane_id && entry.agent === "codex") : snapshot.panes.find((entry) => entry.workspace_id === workspace?.workspace_id);
        if (existsSync(marker) && pane?.agent === "codex") { paneId = pane.pane_id; break; }
        if (Date.now() > deadline) throw new Error(`fixture ${route} profile did not execute: ${JSON.stringify(snapshot.panes)}`);
        await Bun.sleep(50);
      }
      await herdrRpc("pane.report_agent", { pane_id: paneId, source: "manual", agent: "codex", state: "idle" });
      const response = await request;
      expect(response.status).toBe(200);
      const created = await response.json() as WorkspaceCreated;
      if (route === "worktree") checkout = created.workspace_id;
      else if (route === "workspace") owned.push(created.workspace_id);
      expect(created.agent_started).toBeTrue();
      expect(created.error).toBeUndefined();
      expect(created.pane_id).toBe(paneId!);
      expect(JSON.parse(readFileSync(marker, "utf8"))).toEqual({ args: route === "tab" ? ["resume", argument] : [argument], cwd: route === "worktree" ? path : root });
      expect((await agentGet(created.pane_id)).agent).toBe("codex");
      expect(launchedAgents.notBegun(created.pane_id, "idle") !== null).toBeFalse();
    }
    const plain = await fetch(`${base}/api/tab/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace_id: source.workspace.workspace_id, agent: null }) });
    expect((await plain.json() as WorkspaceCreated).agent_started).toBeFalse();
    const ordinary = await fetch(`${base}/api/tab/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace_id: source.workspace.workspace_id, agent: { kind: "muse", args: [] } }) });
    const defaultCreated = await ordinary.json() as WorkspaceCreated;
    expect(defaultCreated.agent_started).toBeTrue();
  } finally {
    if (launcherId) await deleteLauncher(launcherId);
    if (resumeLauncherId) await deleteLauncher(resumeLauncherId);
    rmSync(command, { force: true });
    rmSync(resumeCommand, { force: true });
    if (checkout) await herdrRpc("worktree.remove", { workspace_id: checkout, force: true }).catch(() => undefined);
    for (const workspace of owned.reverse()) await workspaceClose(workspace).catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);

it.skipIf(process.platform !== "linux" && process.platform !== "darwin")("runs a saved Claude launcher with its own configuration directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "herdr-claude-launcher-"));
  const executable = join(root, "claude"), marker = join(root, "executed.json"), recorder = join(root, "record.cjs");
  const command = join(stateDir, "claude-work"), label = "herdr-web-ui-test-claude-launcher";
  copyFileSync(process.execPath, executable); chmodSync(executable, 0o755);
  writeFileSync(recorder, `require("node:fs").writeFileSync(process.argv[2], JSON.stringify({config:process.env.CLAUDE_CONFIG_DIR,args:process.argv.slice(3)}));process.stdin.resume();setInterval(()=>{},1000);`);
  writeFileSync(command, `#!/bin/sh\nexport CLAUDE_CONFIG_DIR='${root}/work-config'\nexec '${executable}' '${recorder}' '${marker}'\n`, { mode: 0o755 });
  let workspaceId: string | undefined;
  let launcherId = "";
  try {
    launcherId = await saveLauncher("claude", command);
    const request = fetch(`${base}/api/workspace/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cwd: root, label, agent: { kind: "claude", launcher: launcherId } }) });
    let paneId: string | undefined;
    for (const deadline = Date.now() + 15_000;;) {
      const snapshot = await sessionSnapshot();
      workspaceId = snapshot.workspaces.find((entry) => entry.label === label)?.workspace_id;
      const pane = snapshot.panes.find((entry) => entry.workspace_id === workspaceId && entry.agent === "claude");
      if (existsSync(marker) && pane) { paneId = pane.pane_id; break; }
      if (Date.now() > deadline) throw new Error("Claude fixture launcher did not execute");
      await Bun.sleep(50);
    }
    await herdrRpc("pane.report_agent", { pane_id: paneId, source: "manual", agent: "claude", state: "idle" });
    const response = await request;
    const created = await response.json() as WorkspaceCreated;
    expect(response.status).toBe(200);
    expect(created.agent_started).toBeTrue();
    expect((await agentGet(created.pane_id)).agent).toBe("claude");
    expect(JSON.parse(readFileSync(marker, "utf8"))).toEqual({ config: join(root, "work-config"), args: [] });
    expect(launchedAgents.notBegun(created.pane_id, "idle")).toBeNull();
  } finally {
    if (launcherId) await deleteLauncher(launcherId);
    rmSync(command, { force: true });
    if (workspaceId) await workspaceClose(workspaceId).catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

it.skipIf(process.platform !== "linux" && process.platform !== "darwin")("preserves a created pane when the selected launcher blocks during startup", async () => {
  const root = mkdtempSync(join(tmpdir(), "herdr-profile-blocked-"));
  const executable = join(root, "codex");
  const marker = join(root, "started");
  const script = join(root, "record.cjs");
  const command = join(stateDir, "codex-blocked");
  copyFileSync(process.execPath, executable); chmodSync(executable, 0o755);
  writeFileSync(script, `require("node:fs").writeFileSync(process.argv[2], "started"); process.stdin.resume(); setInterval(() => {}, 1000);`);
  writeFileSync(command, `#!/bin/sh\nexec '${executable}' '${script}' '${marker}'\n`, { mode: 0o755 });

  const label = "herdr-web-ui-test-profile-blocked";
  let workspaceId: string | undefined;
  let launcherId = "";
  try {
    launcherId = await saveLauncher("codex", command);
    const request = fetch(`${base}/api/workspace/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cwd: root, label, agent: { kind: "codex", launcher: launcherId } }) });
    let paneId: string | undefined;
    for (const deadline = Date.now() + 15_000;;) {
      const snapshot = await sessionSnapshot();
      workspaceId = snapshot.workspaces.find((entry) => entry.label === label)?.workspace_id;
      const pane = snapshot.panes.find((entry) => entry.workspace_id === workspaceId);
      if (existsSync(marker) && pane?.agent === "codex") { paneId = pane.pane_id; break; }
      if (Date.now() > deadline) throw new Error("fixture blocked profile did not execute");
      await Bun.sleep(50);
    }
    await herdrRpc("pane.report_agent", { pane_id: paneId, source: "manual", agent: "codex", state: "blocked" });
    const response = await request;
    const created = await response.json() as WorkspaceCreated;
    expect(response.status).toBe(200);
    expect(created.agent_started).toBeFalse();
    expect(created.error?.message).toContain("Open the created pane's terminal");
    expect((await sessionSnapshot()).panes.some((entry) => entry.pane_id === created.pane_id)).toBeTrue();
    expect(launchedAgents.notBegun(created.pane_id, "blocked")).toBeNull();
  } finally {
    if (launcherId) await deleteLauncher(launcherId);
    rmSync(command, { force: true });
    if (workspaceId) await workspaceClose(workspaceId).catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  }
}, 25_000);

it.skipIf(process.platform !== "linux" && process.platform !== "darwin")("shows an empty Codex conversation for a web-started launcher at its untouched composer", async () => {
  const root = mkdtempSync(join(tmpdir(), "herdr-fresh-codex-launcher-"));
  const executable = join(root, "codex"), marker = join(root, "ready.json"), recorder = join(root, "screen.cjs");
  const command = join(stateDir, "codex-empty");
  copyFileSync(process.execPath, executable); chmodSync(executable, 0o755);
  writeFileSync(recorder, `process.stdout.write("OpenAI Codex (v0.163.0)\\n› Ask Codex to do anything\\n");require("node:fs").writeFileSync(process.argv[2],"ready");process.stdin.resume();`);
  writeFileSync(command, `#!/bin/sh\nexec '${executable}' '${recorder}' '${marker}'\n`, { mode: 0o755 });
  let workspaceId: string | undefined;
  let launcherId = "";
  try {
    launcherId = await saveLauncher("codex", command);
    const request = fetch(`${base}/api/workspace/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cwd: root, label: "herdr-web-ui-test-empty-codex-launcher", agent: { kind: "codex", launcher: launcherId } }) });
    let paneId: string | undefined;
    for (const deadline = Date.now() + 15_000;;) {
      const snapshot = await sessionSnapshot();
      workspaceId = snapshot.workspaces.find((entry) => entry.label === "herdr-web-ui-test-empty-codex-launcher")?.workspace_id;
      paneId = snapshot.panes.find((entry) => entry.workspace_id === workspaceId)?.pane_id;
      if (paneId && existsSync(marker)) {
        await herdrRpc("pane.report_agent", { pane_id: paneId, source: "fixture", agent: "codex", state: "idle" });
        break;
      }
      if (Date.now() > deadline) throw new Error("launcher did not print its initial screen");
      await Bun.sleep(50);
    }
    const created = await (await request).json() as WorkspaceCreated;
    expect(created.agent_started).toBeTrue();
    expect(launchedAgents.notBegun(created.pane_id, "idle")).not.toBeNull();
    const conversation = await (await fetch(`${base}/api/pane/conversation?pane_id=${encodeURIComponent(created.pane_id)}`)).json();
    expect(conversation.source).toBe("codex-transcript");
    expect(conversation.turns).toEqual([]);
  } finally {
    if (launcherId) await deleteLauncher(launcherId);
    rmSync(command, { force: true });
    if (workspaceId) await workspaceClose(workspaceId).catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
