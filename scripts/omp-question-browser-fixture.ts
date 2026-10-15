import assert from "node:assert/strict";
import { createServer as createNetServer, type Socket } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";

const paneId = "omp-question-fixture-pane";
const workspaceId = "omp-question-fixture-workspace";
const tabId = "omp-question-fixture-tab";
const terminalId = "omp-question-fixture-terminal";
const rootArg = process.argv.indexOf("--root");
const built = process.argv.includes("--built");
const root = resolve(rootArg >= 0 ? process.argv[rootArg + 1]! : process.cwd());
const scratch = mkdtempSync(join(tmpdir(), "herdr-omp-question-fixture-"));
const socketPath = join(scratch, "herdr.sock");
const stateDir = join(scratch, "state");
let selected = 0;
let answered = false;
let typingCustomAnswer = false;
let typedAnswer = "";
const originalHome = process.env.HOME;
const sessionPath = join(scratch, ".omp", "agent", "sessions", "2026-10-16T00-00-00-000Z_omp-fixture.jsonl");
mkdirSync(join(scratch, ".omp", "agent", "sessions"), { recursive: true });
writeFileSync(sessionPath, [
  { type: "session", version: 3, id: "omp-fixture", timestamp: "2026-10-16T00:00:00.000Z", cwd: root },
  { type: "message", id: "u1", parentId: null, timestamp: "2026-10-16T00:00:01.000Z", message: { role: "user", content: [{ type: "text", text: "Choose a fictional deployment target for the fixture." }] } },
  { type: "message", id: "a1", parentId: "u1", timestamp: "2026-10-16T00:00:02.000Z", message: { role: "assistant", content: [{ type: "text", text: "I found two fictional runners. Which one should run the sample build?" }] } },
].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
const screen = () => answered ? "Fictional OMP answer received.\n" : [
  "",
  "╭─ Ask ─────────────────────────────────────────────────────╮",
  "│ Which deployment target should run the fictional build?   │",
  "├───────────────────────────────────────────────────────────┤",
  (selected === 0 ? "│ ❯ ○ ARM server" : "│   ○ ARM server"),
  "│       Runs on the lab machine in the fictional workshop.",
  (selected === 1 ? "│ ❯ ○ x86 runner" : "│   ○ x86 runner"),
  "│       Uses the hosted runner for fictional Linux builds.",
  (selected === 2 ? "│ ❯ ○ Other (type your own)" : "│   ○ Other (type your own)"),
  "├───────────────────────────────────────────────────────────┤",
  "│ ⏎ select · n note · ↑/↓ move · ⎋ cancel · Alt+H hide",
  "╰───────────────────────────────────────────────────────────╯",
  "",
].join("\n");

const fakeHerdr = createNetServer((socket: Socket) => {
  let input = "";
  socket.on("error", () => undefined);
  socket.on("data", (chunk) => {
    input += chunk.toString();
    while (input.includes("\n")) {
      const newline = input.indexOf("\n");
      const line = input.slice(0, newline);
      input = input.slice(newline + 1);
      if (!line) continue;
      const request = JSON.parse(line) as { id: string; method: string; params: Record<string, unknown> };
      const respond = (result: unknown) => socket.write(JSON.stringify({ id: request.id, result }) + "\n");
      if (request.method === "events.subscribe") {
        respond({ subscribed: true });
      } else if (request.method === "ping") {
        respond({ version: "0.9.3", protocol: 22, capabilities: {} });
      } else if (request.method === "session.snapshot") {
        const pane = {
          pane_id: paneId, workspace_id: workspaceId, tab_id: tabId, terminal_id: terminalId,
          agent: "omp", agent_status: answered ? "done" : "idle", cwd: root,
          focused: true, revision: answered ? 2 : 1,
        };
        respond({ snapshot: {
          protocol: 22, version: "0.9.3", panes: [pane], agents: [],
          focused_pane_id: paneId, focused_tab_id: tabId, focused_workspace_id: workspaceId,
          tabs: [{ tab_id: tabId, workspace_id: workspaceId, label: "Fixture", number: 1, pane_count: 1, agent_status: pane.agent_status, focused: true }],
          workspaces: [{ workspace_id: workspaceId, active_tab_id: tabId, label: "Fictional OMP question", number: 1, pane_count: 1, tab_count: 1, agent_status: pane.agent_status, focused: true }],
          layouts: [{ workspace_id: workspaceId, tab_id: tabId, focused_pane_id: paneId, zoomed: false, area: { x: 0, y: 0, width: 120, height: 36 }, splits: [], panes: [{ pane_id: paneId, focused: true, rect: { x: 0, y: 0, width: 120, height: 36 } }] }],
        } });
      } else if (request.method === "pane.read") {
        respond({ read: { text: screen(), format: request.params.format ?? "text", revision: answered ? 2 : 1 } });
      } else if (request.method === "pane.process_info") {
        respond({ process_info: { pane_id: paneId, foreground_processes: [] } });
      } else if (request.method === "pane.send_keys") {
        const keys = Array.isArray(request.params.keys) ? request.params.keys as string[] : [];
        for (const key of keys) {
          if (key === "up") selected = Math.max(0, selected - 1);
          else if (key === "down") selected = Math.min(2, selected + 1);
          else if (key === "enter" && selected === 2 && !typingCustomAnswer) typingCustomAnswer = true;
          else if (key === "enter" && typingCustomAnswer && typedAnswer.trim()) {
            answered = true;
            typingCustomAnswer = false;
            console.log("fixture accepted the fictional custom answer");
          } else if (key === "enter") answered = true;
        }
        if (keys.length > 0) console.log("fixture received " + keys.join(", "));
        respond({});
      } else if (request.method === "pane.send_text") {
        if (typingCustomAnswer && typeof request.params.text === "string") typedAnswer += request.params.text;
        else console.error("fixture rejected text sent before selecting Other");
        console.log("fixture received fictional typed answer");
        respond({});
      } else if (request.method === "agent.get") {
        respond({ agent: { agent_session: { agent: "omp", kind: "path", source: "fixture", value: sessionPath } } });
      } else if (request.method === "server.agent_manifests") {
        respond({ manifests: [] });
      } else {
        socket.end(JSON.stringify({ id: request.id, error: { code: "unsupported_fixture_rpc", message: request.method } }) + "\n");
      }
      if (request.method !== "events.subscribe") socket.end();
    }
  });
});

let app: { stop: () => void } | undefined;
let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
const sockets = new Set<Socket>();
fakeHerdr.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});

async function stop(): Promise<void> {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolveStop) => fakeHerdr.close(() => resolveStop()));
  if (vite?.httpServer) await new Promise<void>((resolveStop) => vite!.httpServer!.close(() => resolveStop()));
  app?.stop();
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  rmSync(scratch, { recursive: true, force: true });
}

process.on("SIGINT", () => { void stop().finally(() => process.exit(0)); });
process.on("SIGTERM", () => { void stop().finally(() => process.exit(0)); });

try {
  await new Promise<void>((resolveListen, reject) => {
    fakeHerdr.once("error", reject);
    fakeHerdr.listen(socketPath, resolveListen);
  });
  process.env.HERDR_SOCKET = socketPath;
  process.env.HOME = scratch;
  const { createServer } = await import(pathToFileURL(join(root, "server/index.ts")).href);
  app = createServer({ port: 0, hostname: "127.0.0.1", stateDir, tailscaleOwner: null, sidecar: false });
  const apiTarget = "http://127.0.0.1:" + app.port;
  if (!built) {
    vite = await createViteServer({
      root,
      configFile: join(root, "vite.config.ts"),
      server: {
        host: "127.0.0.1", port: 0, strictPort: false,
        proxy: {
          "/api": { target: apiTarget, changeOrigin: false },
          "/ws": { target: apiTarget.replace("http:", "ws:"), ws: true, changeOrigin: false },
        },
      },
    });
    await vite.listen();
    const address = vite.httpServer?.address();
    assert(address && typeof address === "object", "Vite did not open its fixture listener");
    console.log("fixture ready at http://127.0.0.1:" + address.port + "/?pane=" + paneId);
    console.log("Frontend: Vite dev server; backend: real app server with fake Herdr RPC socket.");
  } else {
    console.log("fixture ready at " + apiTarget + "/?pane=" + paneId);
    console.log("Frontend and backend: production build served by the real app server with fake Herdr RPC socket.");
  }
  console.log("Uses a temporary app state directory and a fictional OMP transcript binding.");
  console.log("Press Ctrl+C to stop the fixture and remove its temporary state.");
} catch (error) {
  await stop();
  throw error;
}

await new Promise(() => {});
