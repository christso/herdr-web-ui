/**
 * OMP sessions from the pane's own process when Herdr supplies no usable session path.
 * Herdr deliberately omits recognized agents' argv on WSL to avoid blocking procfs reads.
 * Recover process identity outside the bridge, then use the open transcript or breadcrumb.
 */
import nodePath, { join, type PlatformPath } from "node:path";

import { paneProcessInfo } from "./herdr/client.ts";
import { heldTranscript, runsAgent } from "./gjc-runtime.ts";
import { processEnviron } from "./omo.ts";
import { ompProcessMemory } from "./omp-process.ts";

const OMP_EXECUTABLE = /(^|[\\/])omp(?:\.exe|\.[cm]?js)?$/i;

export function isOmpProcess(argv: readonly string[]): boolean {
  return runsAgent(argv, OMP_EXECUTABLE);
}

export function ompConfigRoot(home: string, configDir = process.env["PI_CONFIG_DIR"] || ".omp", paths: PlatformPath = nodePath): string {
  return paths.join(home, configDir || ".omp");
}

/**
 * The agent directory one omp process keeps its sessions and terminal breadcrumbs in:
 * <config root>/agent, or <config root>/profiles/<name>/agent under `--profile <name>` or
 * OMP_PROFILE (the flag wins). PI_CONFIG_DIR chooses the native root under home, defaulting to
 * .omp. null when `--session-dir` moved its sessions anywhere at all, or the name leaves profiles.
 */
export function ompAgentDir(argv: readonly string[], environ: readonly string[] | null, home: string): string | null {
  let profile = environ?.find((word) => word.startsWith("OMP_PROFILE="))?.slice(12) || null;
  for (let at = 1; at < argv.length; at++) {
    const word = argv[at]!;
    if (word === "--session-dir" || word.startsWith("--session-dir=")) return null;
    if (word === "--profile") profile = argv[at + 1] ?? "";
    else if (word.startsWith("--profile=")) profile = word.slice(10);
  }
  const configDir = environ === null ? process.env["PI_CONFIG_DIR"] : environ.find((word) => word.startsWith("PI_CONFIG_DIR="))?.slice(14);
  const root = ompConfigRoot(home, configDir || ".omp");
  if (profile === null) return join(root, "agent");
  return /^[\w.-]+$/.test(profile) && profile !== "." && profile !== ".." ? join(root, "profiles", profile, "agent") : null;
}

/** The transcript the pane's omp process holds open or last pointed its terminal breadcrumb at, or null. */
export async function ompHeldTranscript(paneId: string, cwd: string, home = process.env["HOME"] ?? ""): Promise<string | null> {
  const info = await paneProcessInfo(paneId).catch(() => null);
  let agentDir: string | null = null;
  const pids: number[] = [];
  for (const foreground of info?.foreground_processes ?? []) {
    if (typeof foreground.pid !== "number") continue;
    let argv = Array.isArray(foreground.argv) ? foreground.argv.map(String) : [];
    if (argv.length > 0 && !isOmpProcess(argv)) continue;
    const memory = process.platform === "linux" ? await ompProcessMemory(foreground.pid, argv.length === 0) : null;
    if (process.platform === "linux" && memory === null) continue;
    if (argv.length === 0) argv = memory?.argv ?? [];
    if (!isOmpProcess(argv)) continue;
    const dir = ompAgentDir(argv, memory?.environ ?? processEnviron(foreground.pid), home);
    // a moved store, or two omp processes keeping different ones: nothing says which the pane shows
    if (dir === null || agentDir !== null && dir !== agentDir) return null;
    agentDir = dir;
    pids.push(foreground.pid);
  }
  return agentDir === null ? null : heldTranscript(agentDir, cwd, pids).path;
}
