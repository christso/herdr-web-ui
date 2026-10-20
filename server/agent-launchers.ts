import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

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
