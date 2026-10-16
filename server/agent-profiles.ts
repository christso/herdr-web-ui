import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { HerdrError } from "./herdr/client.ts";

/** Host configuration only: never include commands or arguments in a browser response. */
export interface AgentProfile {
  id: string;
  label: string;
  kind: string;
  command: string;
  args?: string[];
  fresh?: boolean;
}
const KINDS = new Set(["codex", "omp", "pi"]);
const validText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && !/\p{Cc}/u.test(value);
const invalid = () => new HerdrError("invalid_agent_profiles", "Invalid agent profiles configuration; check agent-profiles.json on this PC");

export function readAgentProfiles(stateDir: string, platform: string = process.platform): AgentProfile[] {
  if (platform !== "linux" && platform !== "darwin") return [];
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(join(stateDir, "agent-profiles.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw invalid(); }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some((key) => key !== "profiles")) throw invalid();
  const entries = (raw as { profiles?: unknown }).profiles;
  if (!Array.isArray(entries)) throw invalid();
  const seen = new Set<string>();
  const profiles: AgentProfile[] = [];
  for (const entry of entries) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).some((key) => !["id", "label", "kind", "command", "args", "fresh"].includes(key))) throw invalid();
    const profile = entry as AgentProfile;
    if (!validText(profile.id) || !validText(profile.label) || !KINDS.has(profile.kind)
      || !validText(profile.command) || !isAbsolute(profile.command)
      || (profile.args !== undefined && (!Array.isArray(profile.args) || !profile.args.every((arg) => typeof arg === "string" && !/\p{Cc}/u.test(arg))))
      || (profile.fresh !== undefined && typeof profile.fresh !== "boolean")) throw invalid();
    const key = `${profile.kind}:${profile.id}`;
    if (seen.has(key)) throw invalid();
    seen.add(key);
    profiles.push(profile);
  }
  return profiles.filter((profile) => {
    try { accessSync(profile.command, constants.X_OK); return statSync(profile.command).isFile(); }
    catch { return false; }
  });
}

export function profileSummaries(profiles: readonly AgentProfile[], kind: string): { id: string; label: string }[] {
  return profiles.filter((profile) => profile.kind === kind).map(({ id, label }) => ({ id, label }));
}
export function selectedAgentProfile(profiles: readonly AgentProfile[], kind: string, id: string): AgentProfile {
  const profile = profiles.find((profile) => profile.kind === kind && profile.id === id);
  if (!profile) throw new HerdrError("invalid_agent_profile", "The selected agent profile is unavailable on this PC. Choose Default or reload the agent list.");
  return profile;
}
