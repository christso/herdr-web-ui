import { afterAll, expect, it } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "./index.ts";
import { launchedAgents } from "./launched-agents.ts";
import type { WorkspaceCreated } from "../shared/protocol.ts";
import { agentGet, herdrRpc, sessionSnapshot, workspaceClose, workspaceCreate } from "./herdr/client.ts";

const stateDir = mkdtempSync(join(tmpdir(), "herdr-web-profile-contract-"));
const launcher = join(stateDir, "fixture-launcher");
writeFileSync(launcher, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
writeFileSync(join(stateDir, "agent-profiles.json"), JSON.stringify({ profiles: [{ id: "private", label: "Private profile", kind: "codex", command: launcher, args: ["secret-fixed-argument"] }] }));
const server = createServer({ port: 0, hostname: "127.0.0.1", token: "", stateDir });
const base = `http://127.0.0.1:${server.port}`;
afterAll(() => { server.stop(); rmSync(stateDir, { recursive: true, force: true }); });
it.skipIf(process.platform === "win32")("HTTP catalog only exposes profile identity and label", async () => {
  const response = await fetch(`${base}/api/agents`);
  const text = await response.text();
  expect(response.status).toBe(200);
  expect(text).not.toContain(launcher);
  expect(text).not.toContain("secret-fixed-argument");
  expect(JSON.parse(text).agents.find((agent: { kind: string }) => agent.kind === "codex").profiles).toEqual([{ id: "private", label: "Private profile" }]);
});
it.skipIf(process.platform === "win32")("keeps canonical installed availability separate from valid wrapper availability", async () => {
  const path = process.env["PATH"];
  try {
    process.env["PATH"] = stateDir;
    const response = await fetch(`${base}/api/agents`);
    const catalog = await response.json();
    expect(catalog.agents.find((agent: { kind: string }) => agent.kind === "codex")).toMatchObject({ installed: false, profiles: [{ id: "private", label: "Private profile" }] });
  } finally { process.env["PATH"] = path; }
});
it.skipIf(process.platform === "win32")("refuses unknown, mismatched and request-argument profiles before any creation", async () => {
  const before = (await sessionSnapshot()).workspaces.map((workspace) => workspace.workspace_id);
  for (const route of ["workspace", "tab", "worktree"]) {
    for (const agent of [{ kind: "codex", profile: "unknown" }, { kind: "pi", profile: "private" }, { kind: "codex", profile: "private", args: [] }, { kind: "codex", profile: "private", command: launcher }]) {
      const response = await fetch(`${base}/api/${route}/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace_id: "fixture-must-not-be-used", branch: "must-not-be-created", agent }) });
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toMatch(/^invalid_agent/);
    }
  }
  expect((await sessionSnapshot()).workspaces.map((workspace) => workspace.workspace_id)).toEqual(before);
});


it.skipIf(process.platform !== "linux" && process.platform !== "darwin")("executes selected wrappers in all creation flows and tracks freshness only when declared", async () => {
  const root = mkdtempSync(join(tmpdir(), "herdr-profile-launch-"));
  const owned: string[] = [];
  let checkout: string | null = null;
  const marker = join(root, "executed.json");
  const recorder = join(root, "record.cjs");
  const command = join(root, "wrapper with ' quote");
  const executable = join(root, "codex");
  copyFileSync(process.execPath, executable); chmodSync(executable, 0o755);
  writeFileSync(recorder, `require("node:fs").writeFileSync(process.argv[2], JSON.stringify({ args: process.argv.slice(3), cwd: process.cwd() })); process.stdin.resume(); setInterval(() => {}, 1000);`);
  writeFileSync(command, `#!/bin/sh\nexec '${executable}' '${recorder}' '${marker}' "$@"\n`, { mode: 0o755 });
  const argument = "a ' quote; $(not-a-command)";
  writeFileSync(join(stateDir, "agent-profiles.json"), JSON.stringify({ profiles: [
    { id: "chosen", label: "Chosen", kind: "codex", command, args: [argument] },
    { id: "fresh", label: "Fresh", kind: "codex", command, args: [argument], fresh: true },
  ] }));
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", "-C", root, ...args], { env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" } });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  };
  try {
    git("init"); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "Fixture");
    const source = await workspaceCreate({ cwd: root, label: "herdr-web-ui-test-profile-source" });
    owned.push(source.workspace.workspace_id);
    for (const [route, profile] of [["workspace", "chosen"], ["tab", "fresh"], ["worktree", "chosen"]] as const) {
      rmSync(marker, { force: true });
      const label = `herdr-web-ui-test-profile-${route}`;
      const path = join(root, "checkout");
      const request = fetch(`${base}/api/${route}/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cwd: root, workspace_id: source.workspace.workspace_id, label, branch: "profile-fixture", path, agent: { kind: "codex", profile } }) });
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
      expect(JSON.parse(readFileSync(marker, "utf8"))).toEqual({ args: [argument], cwd: route === "worktree" ? path : root });
      expect((await agentGet(created.pane_id)).agent).toBe("codex");
      expect(launchedAgents.notBegun(created.pane_id, "idle") !== null).toBe(profile === "fresh");
    }
    const plain = await fetch(`${base}/api/tab/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace_id: source.workspace.workspace_id, agent: null }) });
    expect((await plain.json() as WorkspaceCreated).agent_started).toBeFalse();
    const ordinary = await fetch(`${base}/api/tab/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace_id: source.workspace.workspace_id, agent: { kind: "muse", args: [] } }) });
    expect((await ordinary.json() as WorkspaceCreated).agent_started).toBeTrue();
  } finally {
    if (checkout) await herdrRpc("worktree.remove", { workspace_id: checkout, force: true }).catch(() => undefined);
    for (const workspace of owned.reverse()) await workspaceClose(workspace).catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);

it.skipIf(process.platform !== "linux" && process.platform !== "darwin")("preserves a created pane when the selected launcher blocks during startup", async () => {
  const root = mkdtempSync(join(tmpdir(), "herdr-profile-blocked-"));
  const executable = join(root, "codex");
  const marker = join(root, "started");
  const script = join(root, "record.cjs");
  const command = join(root, "launcher");
  copyFileSync(process.execPath, executable); chmodSync(executable, 0o755);
  writeFileSync(script, `require("node:fs").writeFileSync(process.argv[2], "started"); process.stdin.resume(); setInterval(() => {}, 1000);`);
  writeFileSync(command, `#!/bin/sh\nexec '${executable}' '${script}' '${marker}'\n`, { mode: 0o755 });
  writeFileSync(join(stateDir, "agent-profiles.json"), JSON.stringify({ profiles: [{ id: "blocked", label: "Blocked", kind: "codex", command, fresh: true }] }));
  const label = "herdr-web-ui-test-profile-blocked";
  let workspaceId: string | undefined;
  try {
    const request = fetch(`${base}/api/workspace/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cwd: root, label, agent: { kind: "codex", profile: "blocked" } }) });
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
    if (workspaceId) await workspaceClose(workspaceId).catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  }
}, 25_000);
