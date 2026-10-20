/** Saved definitions are owned by the selected PC's web bridge, never by a browser. */
export interface SavedAgentLauncherInput {
  kind: string;
  label: string;
  executable: string;
  args?: string[];
}
export interface SavedAgentLauncher extends SavedAgentLauncherInput {
  /** The selected PC assigns this stable identifier. */
  id: string;
  args: string[];
}

export const SAVED_LAUNCHER_KINDS: readonly string[] = ["codex", "omp", "pi", "claude"];

/** Arguments are individual values; the bridge never interprets them as shell syntax. */
export function savedLauncherInput(value: unknown): SavedAgentLauncherInput | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const text = (word: unknown): word is string => typeof word === "string" && !/\p{Cc}/u.test(word);
  if (typeof body["kind"] !== "string" || !SAVED_LAUNCHER_KINDS.includes(body["kind"])
    || !text(body["label"]) || !body["label"].trim()
    || !text(body["executable"]) || !body["executable"].trim()
    || (body["args"] !== undefined && (!Array.isArray(body["args"]) || !body["args"].every(text)))
    || Object.keys(body).some((key) => !["kind", "label", "executable", "args"].includes(key))) return null;
  return { kind: body["kind"], label: body["label"].trim(), executable: body["executable"].trim(), args: (body["args"] as string[] | undefined) ?? [] };
}
