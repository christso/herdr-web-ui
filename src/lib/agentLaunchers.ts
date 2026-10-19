import type { AgentKind, SavedAgentLauncher } from "../../shared/protocol.ts";

/** A management response refreshes summaries without exposing command details to the picker catalog. */
export function withSavedLaunchers(agents: AgentKind[], definitions: SavedAgentLauncher[]): AgentKind[] {
  return agents.map((agent) => ({ ...agent, launchers: [
    ...(agent.launchers ?? []).filter((entry) => !entry.saved),
    ...definitions.filter((entry) => entry.kind === agent.kind).map(({ id, label }) => ({ id, label, saved: true })),
  ] }));
}
