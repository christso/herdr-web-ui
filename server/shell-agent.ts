/**
 * Agents herdr's agent.start cannot launch (`herdr agent start --kind` lists its
 * kinds; omo and gjc are not among them). The pane's shell runs the command
 * instead, and the pane's process tree, not the prompt, says when it is up.
 *
 * A Windows pane differs in three ways, each live-verified on a Windows PC (herdr 0.9.3):
 * - its shell is PowerShell or cmd: a quoted path alone is a string there, not a call;
 * - a newline in sent text is a line break in PowerShell's editor (it waits at `>>`): the
 *   command is run by the Enter key;
 * - process_info names only the shell, so the shell's children say whether the agent runs.
 */
import type { AgentLauncher } from "./agent-profiles.ts";
import { isAgentName } from "../shared/agent-name.ts";
import { freeAgentName } from "./agent-name.ts";
import { agentGet, agentRename, HerdrError, paneProcessInfo, paneSendText, sessionSnapshot, type ProcessInfo as NativeProcessInfo } from "./herdr/client.ts";
import { herdrRpc } from "./herdr/client.ts";
import { isGjcProcess } from "./gjc-runtime.ts";
import { isOmoProcess, omoProcessIdentity } from "./omo.ts";
import { psQuote } from "./powershell.ts";
import { descendantArgv, windowsProcessTable } from "./windows-processes.ts";

/** kind -> the foreground-process test that proves the agent is running in the pane. */
export const SHELL_AGENTS: Record<string, (argv: readonly string[]) => boolean> = {
  omo: isOmoProcess,
  gjc: isGjcProcess,
};
/** The shell-started agents known to start on Windows; the others are not offered there. */
const WINDOWS_SHELL_AGENTS = new Set(["omo", "gjc"]);

export function isShellAgentKind(kind: string): boolean { return Object.hasOwn(SHELL_AGENTS, kind); }

/** Where this server finds `kind`; the pane's shell is herdr's child and may carry another PATH. */
export function shellAgentExecutable(kind: string, platform: string = process.platform): string | null {
  if (platform === "win32" && !WINDOWS_SHELL_AGENTS.has(kind)) return null;
  return Bun.which(kind, { PATH: process.env["PATH"] ?? "" });
}

const quote = (word: string) => `'${word.replaceAll("'", `'\\''`)}'`;
/** cmd.exe has no escape for a quote inside quotes, and expands %NAME%. */
function cmdQuote(word: string): string {
  if (/["%\r\n]/.test(word)) throw new Error("this argument cannot be typed into cmd.exe");
  // a backslash right before the closing quote would escape it for the program's own parser
  return `"${word.replace(/\\+$/, (run) => run + run)}"`;
}

export type PaneShell = "posix" | "powershell" | "cmd";
/** Which shell a pane runs, from the program herdr reports in front of it. */
export function paneShell(argv0: string): PaneShell {
  const name = argv0.split(/[\\/]/).pop()!.toLowerCase();
  if (name === "powershell.exe" || name === "pwsh.exe" || name === "powershell" || name === "pwsh") return "powershell";
  if (name === "cmd.exe") return "cmd";
  return "posix";
}

/** The line that runs `executable` with `args` in that shell. */
export function shellCommandLine(shell: PaneShell, executable: string, args: readonly string[]): string {
  if (shell === "powershell") return ["&", psQuote(executable), ...args.map(psQuote)].join(" ");
  if (shell === "cmd") return [executable, ...args].map(cmdQuote).join(" ");
  return [executable, ...args].map(quote).join(" ");
}

interface ProcessInfo { process_info?: { shell_pid?: number; foreground_processes?: { pid: number; argv?: string[]; cwd?: string }[] } }
const processInfo = (paneId: string) => herdrRpc<ProcessInfo>("pane.process_info", { pane_id: paneId }).catch(() => null);

/**
 * Types the agent's absolute path and args into the pane's shell and resolves once
 * `kind` is its foreground process. The path is the one `/api/agents` discovered,
 * so the offer and the start agree whatever the pane shell's PATH says.
 */
export async function startShellAgent(kind: string, paneId: string, args: string[] = [], options: { command?: string; timeoutMs?: number } = {}): Promise<void> {
  const isProcess = SHELL_AGENTS[kind];
  if (!isProcess) throw new Error(`${kind} is not a shell-started agent`);
  const windows = process.platform === "win32";
  if (options.command !== undefined || !windows) {
    let command = options.command;
    if (command === undefined) {
      const executable = shellAgentExecutable(kind);
      if (!executable) throw new Error(`${kind} is not on this server's PATH`);
      command = quote(executable);
    }
    await herdrRpc("pane.send_text", { pane_id: paneId, text: `${[command, ...args.map(quote)].join(" ")}\n` });
  } else {
    const executable = shellAgentExecutable(kind);
    if (!executable) throw new Error(`${kind} is not on this server's PATH`);
    const shell = paneShell((await processInfo(paneId))?.process_info?.foreground_processes?.[0]?.argv?.[0] ?? "powershell.exe");
    await herdrRpc("pane.send_text", { pane_id: paneId, text: shellCommandLine(shell, executable, args) });
    await herdrRpc("pane.send_keys", { pane_id: paneId, keys: ["Enter"] });
  }
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  while (Date.now() < deadline) {
    const info = await processInfo(paneId);
    if (info?.process_info?.foreground_processes?.some((entry) => kind === "omo" ? omoProcessIdentity(entry, "", process.env["HOME"] ?? "") !== null : isProcess(entry.argv ?? []))) return;
    const shellPid = info?.process_info?.shell_pid;
    // the table query never outlasts what is left of the start's own time
    if (windows && typeof shellPid === "number" && descendantArgv(await windowsProcessTable(Math.max(500, Math.min(10_000, deadline - Date.now()))), shellPid).some(isProcess)) return;
    await Bun.sleep(250);
  }
  throw new Error(`${kind} did not start in the pane`);
}

/** Same foreground ownership evidence as native agent.start; an unreadable job is never safe. */
export function availableLauncherShell(info: NativeProcessInfo | undefined): PaneShell | null {
  const pid = info?.shell_pid;
  const processes = info?.foreground_processes;
  if (!pid || info?.foreground_process_group_id !== pid || !processes?.length || processes.some((entry) => entry.pid !== pid)) return null;
  const name = processes[0]!.name.split(/[\\/]/).pop()!.replace(/^-+/, "").replace(/\.exe$/, "").toLowerCase();
  if (["sh", "bash", "dash", "zsh", "fish", "ksh", "mksh"].includes(name)) return "posix";
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
