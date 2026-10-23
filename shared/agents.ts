/** GET /api/agents: one agent kind herdr can start (`agent.start` kind), with a display label. */
export interface AgentKind {
  kind: string;
  label: string;
  /** whether the server finds the agent's command (its kind) on its PATH or in a supported client's ordinary user-bin directories; absent from an older bridge */
  installed?: boolean;
  /** Saved definitions; command details are never catalog data. */
  launchers?: { id: string; label: string }[];
  /** This PC supports saving and running custom launchers; absent on older bridges. */
  saved_launchers?: boolean;
  /** This PC supports on-demand executable name search; independent of saved-launcher support. */
  launcher_search?: boolean;
}
