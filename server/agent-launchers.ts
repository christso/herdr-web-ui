import { accessSync, closeSync, constants, openSync, readSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { HerdrError } from "./herdr/client.ts";

export interface AgentLauncher { kind: string; id: string; command: string; args?: string[] }
export function executableSearchPaths(home: string, env: NodeJS.ProcessEnv): string[] {
  const paths = [...(env["PATH"] ?? "").split(":"), join(home, ".local/bin"), join(home, ".bun/bin"), join(home, "bin")];
  return [...new Set(paths.filter(isAbsolute))];
}
export function agentExecutable(kind: string, home = homedir(), env = process.env): string | null {
  const path = process.platform !== "win32" && KINDS.includes(kind) ? executableSearchPaths(home, env).join(":") : env["PATH"] ?? "";
  return Bun.which(kind, { PATH: path });
}
const KINDS = ["codex", "omp", "pi", "claude"];
function names(path: string): string[] {
  try { return readdirSync(path).sort(); }
  catch (error) { if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return []; throw new HerdrError("agent_discovery_failed", "Cannot read agent choices on this PC"); }
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

/** Resolve old wrapper IDs only for explicit launcher requests, never for the catalog. */
export function discoverLegacyLaunchers({ home = homedir(), env = process.env, platform = process.platform }: { home?: string; env?: NodeJS.ProcessEnv; platform?: string } = {}): AgentLauncher[] {
  if (platform !== "linux" && platform !== "darwin") return [];
  const launchers: AgentLauncher[] = [];
  const seen = new Set<string>();
  for (const path of executableSearchPaths(home, env)) {
    let entries: string[];
    try { entries = names(path); }
    catch (error) {
      if (!(error instanceof HerdrError) || error.code !== "agent_discovery_failed") throw error;
      continue;
    }
    for (const id of entries) {
      const kind = KINDS.find((kind) => id.startsWith(`${kind}-`));
      if (!kind || !/^[a-z]+-[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(id) || seen.has(id)) continue;
      // Executable search precedence includes binary helpers: never substitute a later same-name script.
      try { accessSync(join(path, id), constants.X_OK); if (!statSync(join(path, id)).isFile()) continue; } catch { continue; }
      seen.add(id);
      const command = executableShell(join(path, id));
      if (command) launchers.push({ kind, id, command });
    }
  }
  return launchers;
}
export function selectedLegacyLauncher(choices: readonly AgentLauncher[], kind: string, launcher: string): AgentLauncher {
  const selected = choices.find((entry) => entry.kind === kind && entry.id === launcher);
  if (!selected) throw new HerdrError("invalid_agent_launcher", "The selected launcher is unavailable on this PC. Choose Default or reload the agent list.");
  return selected;
}
