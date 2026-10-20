import { accessSync, closeSync, constants, openSync, readFileSync, readSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { HerdrError } from "./herdr/client.ts";
import { ompConfigRoot } from "./omp.ts";

interface NativeProfile { kind: string; id: string }
export interface AgentLauncher { kind: string; id: string; command: string; args?: string[] }
export interface AgentLaunches { profiles: NativeProfile[]; launchers: AgentLauncher[] }
export type AgentLaunch = { kind: string; profile: string } | AgentLauncher;
export function executableSearchPaths(home: string, env: NodeJS.ProcessEnv): string[] {
  const paths = [...(env["PATH"] ?? "").split(":"), join(home, ".local/bin"), join(home, ".bun/bin"), join(home, "bin")];
  return [...new Set(paths.filter(isAbsolute))];
}
export function agentExecutable(kind: string, home = homedir(), env = process.env): string | null {
  const path = process.platform !== "win32" && KINDS.includes(kind) ? executableSearchPaths(home, env).join(":") : env["PATH"] ?? "";
  return Bun.which(kind, { PATH: path });
}
const codexCapabilities = new Map<string, { stamp: string; format: "legacy" | "v2" | null }>();
function codexProfileFormat(home: string, env: NodeJS.ProcessEnv): "legacy" | "v2" | null {
  const executable = agentExecutable("codex", home, env);
  if (!executable) return null;
  try {
    const command = realpathSync(executable);
    const stat = statSync(command);
    const stamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
    const cached = codexCapabilities.get(command);
    if (cached?.stamp === stamp) return cached.format;
    // Only the canonical CLI is probed, never a discovered wrapper. New Codex rejects
    // legacy [profiles.ID] even when ID.config.toml exists (codex config loader).
    const help = Bun.spawnSync([command, "--help"], { env, timeout: 2000, maxBuffer: 256 * 1024 });
    const text = help.stdout.toString();
    let format: "legacy" | "v2" | null = null;
    if (help.exitCode === 0) {
      if (/--profile\s+<CONFIG_PROFILE_V2>/.test(text)) format = "v2";
      else if (/--profile\s+<CONFIG_PROFILE>/.test(text)) format = "legacy";
    }
    codexCapabilities.set(command, { stamp, format });
    return format;
  } catch { return null; }
}
const KINDS = ["codex", "omp", "pi", "claude"];
const nativeId = (id: string) => id.length > 0 && id !== "." && id !== ".." && !/[\\/\p{Cc}]/u.test(id);
const ompId = (id: string) => /^[a-z0-9][a-z0-9._-]{0,63}$/.test(id) && id !== "default" && !id.endsWith(".") && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i.test(id);
function names(path: string): string[] {
  try { return readdirSync(path).sort(); }
  catch (error) { if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return []; throw new HerdrError("agent_discovery_failed", "Cannot read agent choices on this PC"); }
}
function directory(path: string): boolean { try { return statSync(path).isDirectory(); } catch { return false; } }
function toml(path: string): Record<string, unknown> | null {
  try { return Bun.TOML.parse(readFileSync(path, "utf8")) as Record<string, unknown>; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new HerdrError("agent_discovery_failed", "Cannot read native Codex profiles on this PC"); }
}
function executableShell(path: string): string | null {
  let fd: number | undefined;
  try {
    accessSync(path, constants.X_OK);
    if (!statSync(path).isFile()) return null;
    fd = openSync(path, "r");
    const buffer = Buffer.alloc(512);
    const line = buffer.subarray(0, readSync(fd, buffer, 0, buffer.length, 0)).toString("utf8").split("\n")[0] ?? "";
    if (!/^#!\s*\/(?:[^\s/]+\/)*(?:sh|bash|dash|zsh|ksh|mksh)(?:\s|$)/.test(line)
      && !/^#!\s*\/usr\/bin\/env\s+(?:-S\s+)?(?:sh|bash|dash|zsh|ksh|mksh)(?:\s|$)/.test(line)) return null;
    return realpathSync(path);
  } catch { return null; }
  finally { if (fd !== undefined) closeSync(fd); }
}

export function discoverAgentLaunches({ home = homedir(), env = process.env, platform = process.platform, legacyLaunchers = false }: { home?: string; env?: NodeJS.ProcessEnv; platform?: string; legacyLaunchers?: boolean } = {}): AgentLaunches {
  if (platform !== "linux" && platform !== "darwin") return { profiles: [], launchers: [] };
  const profiles: NativeProfile[] = [];
  // Native profiles are optional; a broken provider must not remove independent choices.
  try {
    const codexHome = env["CODEX_HOME"] ? resolve(env["CODEX_HOME"]) : join(home, ".codex");
    const codexIds = new Set<string>();
    const config = toml(join(codexHome, "config.toml"));
    const legacy = config?.["profiles"];
    const legacyIds = legacy && typeof legacy === "object" && !Array.isArray(legacy) ? Object.keys(legacy).filter(nativeId) : [];
    const files = names(codexHome).filter((name) => name.endsWith(".config.toml") && nativeId(name.slice(0, -".config.toml".length)));
    const format = legacyIds.length || files.length ? codexProfileFormat(home, env) : null;
    if (format === "legacy") for (const id of legacyIds) codexIds.add(id);
    if (format === "v2") for (const file of files) {
      const id = file.slice(0, -".config.toml".length);
      try {
        if (!legacyIds.includes(id) && config?.["profile"] !== id && toml(join(codexHome, file))) codexIds.add(id);
      } catch (error) {
        if (!(error instanceof HerdrError) || error.code !== "agent_discovery_failed") throw error;
        // One bad profile file does not hide the other compatible native profiles.
      }
    }
    for (const id of [...codexIds].sort()) profiles.push({ kind: "codex", id });
  } catch (error) {
    if (!(error instanceof HerdrError) || error.code !== "agent_discovery_failed") throw error;
  }
  try {
    // OMP joins the native config dirname under home; PI_CODING_AGENT_DIR affects Default only.
    const ompProfiles = join(ompConfigRoot(home, env["PI_CONFIG_DIR"] || ".omp"), "profiles");
    for (const id of names(ompProfiles)) if (ompId(id) && directory(join(ompProfiles, id, "agent"))) profiles.push({ kind: "omp", id });
  } catch (error) {
    if (!(error instanceof HerdrError) || error.code !== "agent_discovery_failed") throw error;
  }
  const launchers: AgentLauncher[] = [];
  const seen = new Set<string>();
  for (const path of legacyLaunchers ? executableSearchPaths(home, env) : []) {
    for (const id of names(path)) {
      const kind = KINDS.find((kind) => id.startsWith(`${kind}-`));
      if (!kind || !/^[a-z]+-[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(id) || seen.has(id)) continue;
      // Executable search precedence includes binary helpers: never substitute a later same-name script.
      try { accessSync(join(path, id), constants.X_OK); if (!statSync(join(path, id)).isFile()) continue; } catch { continue; }
      seen.add(id);
      const command = executableShell(join(path, id));
      if (command) launchers.push({ kind, id, command });
    }
  }
  return { profiles, launchers };
}
export function launchSummaries(choices: readonly { kind: string; id: string }[], kind: string): { id: string; label: string }[] {
  return choices.filter((choice) => choice.kind === kind).map(({ id }) => ({ id, label: id }));
}
export function selectedAgentLaunch(choices: AgentLaunches, kind: string, profile?: string, launcher?: string): AgentLaunch | undefined {
  if (profile !== undefined && launcher !== undefined) throw new HerdrError("invalid_agent", "Choose a native profile or a launcher, not both");
  if (launcher !== undefined) {
    const selected = choices.launchers.find((entry) => entry.kind === kind && entry.id === launcher);
    if (!selected) throw new HerdrError("invalid_agent_launcher", "The selected launcher is unavailable on this PC. Choose Default or reload the agent list.");
    return selected;
  }
  if (profile !== undefined) {
    if (!choices.profiles.some((entry) => entry.kind === kind && entry.id === profile)) throw new HerdrError("invalid_agent_profile", "The selected agent profile is unavailable on this PC. Choose Default or reload the agent list.");
    return { kind, profile };
  }
  return undefined;
}
