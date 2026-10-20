/** Startup and fresh-session evidence for saved executables resolved on this PC. */
import type { AgentLauncher } from "./agent-launchers.ts";
import { isAgentName } from "../shared/agent-name.ts";
import { freeAgentName } from "./agent-name.ts";
import { agentGet, agentRename, HerdrError, paneProcessInfo, paneRead, paneSendText, sessionSnapshot, type ProcessInfo as NativeProcessInfo } from "./herdr/client.ts";
import { shellCommandLine, type PaneShell } from "./shell-agent.ts";
import { codexEmptyComposer } from "./start-screen.ts";

/** Same foreground ownership evidence as native agent.start; an unreadable job is never safe. */
export function availableLauncherShell(info: NativeProcessInfo | undefined): PaneShell | null {
  const pid = info?.shell_pid;
  const processes = info?.foreground_processes;
  if (!pid || info?.foreground_process_group_id !== pid || !processes?.length || processes.some((entry) => entry.pid !== pid)) return null;
  const name = processes[0]!.name.split(/[\\/]/).pop()!.replace(/^-+/, "").replace(/\.exe$/, "").toLowerCase();
  if (["sh", "bash", "dash", "zsh", "ksh", "mksh"].includes(name)) return "posix";
  // Other native shells have different quoting rules; offer launchers only where we can quote safely.
  return null;
}

/** A launcher starts only in the root pane just created by its request, from a validated host definition. */
export async function startAgentLauncher(launcher: AgentLauncher, paneId: string, name?: string, timeoutMs = 60_000): Promise<void> {
  if (process.platform !== "linux" && process.platform !== "darwin") throw new Error("Custom launchers are available on Linux and macOS only");
  if (name && !isAgentName(name)) throw new HerdrError("invalid_agent_name", "Invalid agent name");
  if (name && (await sessionSnapshot()).agents.some((entry) => entry.name === name)) throw new HerdrError("agent_name_taken", "That agent name is already in use");
  const deadline = Date.now() + timeoutMs;
  const shellDeadline = Math.min(deadline, Date.now() + 10_000);
  const shell = async (): Promise<PaneShell | null> => {
    const agent = await agentGet(paneId).catch((error: unknown) => {
      if (error instanceof HerdrError && error.code === "agent_not_found") return null;
      throw error;
    });
    if (agent && (agent.agent || agent.name || agent.launch_pending)) throw new HerdrError("agent_pane_busy", "The created pane is already running an agent. Open its terminal to continue.");
    return availableLauncherShell(await paneProcessInfo(paneId));
  };
  let ready: PaneShell | null = null;
  while (Date.now() < shellDeadline) {
    ready = await shell();
    if (ready !== null) break;
    await Bun.sleep(100);
  }
  // A second observation immediately before writing protects a shell that changed during startup.
  if (ready === null || await shell() !== ready) throw new HerdrError("agent_pane_busy", "The created pane has no available interactive shell. Open its terminal to continue.");
  await paneSendText(paneId, shellCommandLine(ready, launcher.command, launcher.args ?? []) + "\n");
  while (Date.now() < deadline) {
    const agent = await agentGet(paneId).catch((error: unknown) => {
      if (error instanceof HerdrError && error.code === "agent_not_found") return null;
      throw error;
    });
    if (agent?.agent === launcher.kind && (agent.agent_status === "idle" || agent.agent_status === "done")) {
      for (let attempt = 0; ; attempt += 1) {
        try { await agentRename(paneId, name || freeAgentName(launcher.kind, (await sessionSnapshot()).agents.filter((entry) => entry.pane_id !== paneId).map((entry) => entry.name))); break; }
        catch (error) { if (name || attempt >= 2 || !(error instanceof HerdrError) || error.code !== "agent_name_taken") throw error; }
      }
      return;
    }
    if (agent?.agent && agent.agent !== launcher.kind) throw new Error("The launcher started a different agent. Open the created pane's terminal to continue.");
    if (agent?.agent_status === "blocked") throw new Error("The launcher needs attention during startup. Open the created pane's terminal to continue.");
    await Bun.sleep(250);
  }
  throw new Error("The launcher did not become ready within 60 seconds. Open the created pane's terminal to inspect startup, then choose Default or check the launcher on this PC.");
}

/** Only an untouched Codex composer proves a saved launcher started a fresh session. */
export async function savedLauncherIsFresh(kind: string, paneId: string): Promise<boolean> {
  return kind === "codex"
    && await paneRead({ paneId, source: "visible", format: "text" }).then((read) => codexEmptyComposer(read.text), () => false);
}
