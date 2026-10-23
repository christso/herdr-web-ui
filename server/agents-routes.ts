/**
 * GET /api/agents: the agent kinds this PC can start, with display labels: herdr's agent manifests,
 * Oh My Pi and Claude Code always, and the shell-started agents this server finds (shell-agent.ts).
 * The dispatcher in index.ts runs the access gate first.
 */
import { SAVED_LAUNCHER_KINDS, type SavedAgentLauncher } from "../shared/agent-launchers.ts";
import { agentExecutable } from "./agent-launchers.ts";
import { savedLaunchersSupported, type SavedLauncherStore } from "./saved-launchers.ts";
import { HerdrError } from "./herdr/client.ts";
import type { AgentKind } from "../shared/agents.ts";
import { agentManifests } from "./herdr/client.ts";
import { badRequest, errorResponse, jsonResponse, setRequestRoute } from "./http.ts";
import { SHELL_AGENTS, type ShellAgentLocator } from "./shell-agent.ts";

const AGENT_LABELS: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  omp: "Oh My Pi",
  omo: "OmO",
  gjc: "Gajae Code",
  pi: "pi",
  gemini: "Gemini CLI",
  cursor: "Cursor",
  opencode: "OpenCode",
  copilot: "GitHub Copilot",
  kimi: "Kimi",
  amp: "Amp",
  hermes: "Hermes",
  grok: "Grok",
  agy: "Antigravity",
  devin: "Devin",
  cmd: "Command Code",
};

/** The answer for the agent catalog route, or null when the path is not it. `shellAgents`: the server's own locator, which starts them too. */
export async function handleAgentsRequest(request: Request, pathname: string, shellAgents: Pick<ShellAgentLocator, "executable">, savedLaunchers?: SavedLauncherStore): Promise<Response | null> {
  if (pathname === "/api/agents") {
    setRequestRoute(pathname);
    if (request.method !== "GET") return badRequest("method_not_allowed", "use GET");
    try {
      const canSaveLaunchers = savedLaunchers !== undefined && savedLaunchersSupported();
      let saved: SavedAgentLauncher[] = [];
      try { if (canSaveLaunchers) saved = savedLaunchers.get(); }
      catch (error) { if (!(error instanceof HerdrError) || error.code !== "launcher_store_unavailable") throw error; }
      const kinds = new Set((await agentManifests()).manifests.map((manifest) => manifest.agent));
      if (canSaveLaunchers) for (const kind of SAVED_LAUNCHER_KINDS) kinds.add(kind);
      kinds.add("omp");
      kinds.add("claude");
      // not herdr kinds: offered where this server can run them (see shell-agent.ts)
      // the locator the start asks too, so what is offered is what starts
      const shellStarted = new Set<string>();
      for (const kind of Object.keys(SHELL_AGENTS)) if (await shellAgents.executable(kind)) shellStarted.add(kind);
      for (const kind of shellStarted) kinds.add(kind);
      const agents: AgentKind[] = [...kinds]
        // an agent's command is its kind; herdr starts the others in its own environment, so only this server's PATH speaks for them
        .map((kind) => {
          const launchers = saved.filter((entry) => entry.kind === kind).map(({ id, label }) => ({ id, label }));
          return { kind, label: AGENT_LABELS[kind] ?? kind, installed: shellStarted.has(kind) || agentExecutable(kind) !== null,
            ...(canSaveLaunchers && SAVED_LAUNCHER_KINDS.includes(kind) ? { saved_launchers: true, launcher_search: true } : {}),
            ...(launchers.length > 0 ? { launchers } : {}) };
        })
        .sort((left, right) => left.label.localeCompare(right.label) || left.kind.localeCompare(right.kind));
      return jsonResponse({ agents });
    } catch (error) {
      return errorResponse(error);
    }
  }
  return null;
}
