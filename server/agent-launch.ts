/**
 * Starting the agent a create request names in the pane herdr just made: the request's own check
 * of `agent`, then the start, which retries a pane whose shell is not up yet and a name another
 * agent took. Workspace, tab and worktree creation share it.
 */
import { codexEmptyComposer } from "./start-screen.ts";
import { type AgentLaunch } from "./agent-profiles.ts";
import { freeAgentName } from "./agent-name.ts";
import { launchedAgents } from "./launched-agents.ts";
import { isShellAgentKind, startShellAgent, startAgentLauncher } from "./shell-agent.ts";
import { agentStart, HerdrError, paneRead, sessionSnapshot } from "./herdr/client.ts";

export type AgentPayload = { kind?: unknown; name?: unknown; args?: unknown; profile?: unknown; launcher?: unknown };

/** What is wrong with a request's `agent`, in the API's words; null when it can be started. */
export function agentFault(agent: AgentPayload | undefined): string | null {
  if (agent === undefined) return null;
  if (agent === null || typeof agent !== "object" || typeof agent.kind !== "string" || agent.kind.length === 0) return "agent.kind is required";
  if ((agent.name !== undefined && typeof agent.name !== "string")
    || (agent.args !== undefined && (!Array.isArray(agent.args) || !agent.args.every((arg) => typeof arg === "string")))) {
    return "agent.name must be a string and agent.args must be an array of strings";
  }
  if (agent.profile !== undefined && (typeof agent.profile !== "string" || agent.profile.length === 0)) return "agent.profile must be a nonempty string";
  if (agent.launcher !== undefined && (typeof agent.launcher !== "string" || agent.launcher.length === 0)) return "agent.launcher must be a nonempty string";
  if (agent.profile !== undefined && agent.launcher !== undefined) return "Choose a native profile or a launcher, not both";
  if ((agent.profile !== undefined || agent.launcher !== undefined) && (agent.args !== undefined || Object.keys(agent).some((key) => !["kind", "name", "profile", "launcher"].includes(key)))) return "Profiles and launchers accept only kind, name and their discovered selection";
  return null;
}

/**
 * Starts a checked `agent` in a pane herdr just made. A failure is answered, not thrown: the
 * workspace, tab or worktree around the pane is there either way.
 */
export async function agentLaunch(paneId: string, agent: AgentPayload, resolveLaunch?: () => AgentLaunch | undefined): Promise<{ agent_started: true } | { agent_started: false; error: { code: string; message: string } }> {
  try {
    // Re-read a saved definition after checkout creation, before any launch input. A removal
    // or missing executable now returns the existing partial-creation result with its pane.
    const launch = resolveLaunch?.();
    const kind = agent.kind as string;
    const args = launch && "profile" in launch ? ["--profile", launch.profile] : agent.args as string[] | undefined;
    if (launch && "command" in launch) await startAgentLauncher(launch, paneId, typeof agent.name === "string" ? agent.name : undefined);
    else if (isShellAgentKind(kind)) await startShellAgent(kind, paneId, args);
    else {
      const given = typeof agent.name === "string" && agent.name.length > 0 ? agent.name : null;
      // herdr refuses a name another agent holds. Two creations at once can pick the same
      // free one: the refused one picks again. It also refuses a pane whose shell is not up
      // yet (`agent_pane_busy`, herdr 0.9.3), which a pane made a moment ago can be.
      const shellDeadline = Date.now() + 10_000;
      for (let attempt = 1; ; ) {
        try {
          await agentStart({
            name: given ?? freeAgentName(kind, (await sessionSnapshot()).agents.map((running) => running.name)),
            kind,
            paneId,
            ...(args === undefined ? {} : { args }),
            timeoutMs: 60_000,
          });
          break;
        } catch (error) {
          if (!(error instanceof HerdrError)) throw error;
          if (error.code === "agent_pane_busy" && Date.now() < shellDeadline) {
            await Bun.sleep(100);
            continue;
          }
          if (given !== null || attempt === 3 || error.code !== "agent_name_taken") throw error;
          attempt += 1;
        }
      }
    }
    const emptyLauncher = launch && "command" in launch && kind === "codex"
      && await paneRead({ paneId, source: "visible", format: "text" }).then((read) => codexEmptyComposer(read.text), () => false);
    if (!launch || "profile" in launch || emptyLauncher) launchedAgents.launched(paneId, kind);
    return { agent_started: true };
  } catch (error) {
    return {
      agent_started: false,
      error: {
        code: error instanceof HerdrError ? error.code : "agent_start_failed",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
