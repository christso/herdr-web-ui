import type { AgentKind, SavedAgentLauncher } from "../../shared/protocol.ts";

/** A management response refreshes summaries without exposing command details to the picker catalog. */
export function withSavedLaunchers(agents: AgentKind[], definitions: SavedAgentLauncher[]): AgentKind[] {
  return agents.map((agent) => ({ ...agent, launchers: [
    ...definitions.filter((entry) => entry.kind === agent.kind).map(({ id, label }) => ({ id, label })),
  ] }));
}
