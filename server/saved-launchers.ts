import { randomUUID } from "node:crypto";
import { accessSync, constants, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { savedLauncherInput, type SavedAgentLauncher, type SavedAgentLauncherInput } from "../shared/agent-launchers.ts";
import { executableSearchPaths, type AgentLauncher } from "./agent-profiles.ts";
import { HerdrError } from "./herdr/client.ts";
import { badRequest, errorResponse, isJsonObject, jsonResponse } from "./http.ts";

export const savedLaunchersSupported = () => process.platform === "linux" || process.platform === "darwin";

function launcherCommand(executable: string): string {
  const expanded = executable.startsWith("~/") ? join(homedir(), executable.slice(2)) : executable;
  const path = isAbsolute(expanded) ? expanded : !expanded.includes("/") && !expanded.includes("\\")
    ? Bun.which(expanded, { PATH: executableSearchPaths(homedir(), process.env).join(":") }) : null;
  try {
    if (path) {
      accessSync(path, constants.X_OK);
      // Keep an executable symlink's name (e.g. a virtual environment's interpreter).
      if (statSync(path).isFile()) return path;
    }
  } catch {}
  throw new HerdrError("invalid_agent_launcher", "The saved launcher's executable is unavailable on this PC. Edit its executable, install it on this PC, or choose Default.");
}

/** One store per bridge's stateDir, so the remote proxy never resolves a local same-ID selection. */
export class SavedLauncherStore {
  private readonly path: string;
  private current: SavedAgentLauncher[] = [];
  private unreadable = false;

  constructor(stateDir: string) {
    this.path = join(stateDir, "agent-launchers.json");
    try {
      const body: unknown = JSON.parse(readFileSync(this.path, "utf8"));
      if (!isJsonObject(body) || body["version"] !== 1 || !Array.isArray(body["launchers"])) throw new Error("Invalid launcher document");
      const ids = new Set<string>();
      this.current = body["launchers"].map((entry: unknown) => {
        if (!isJsonObject(entry)) throw new Error("Invalid launcher");
        const { id, ...fields } = entry;
        const input = savedLauncherInput(fields);
        if (typeof id !== "string" || !/^saved:[0-9a-f-]{36}$/.test(id) || ids.has(id) || !input) throw new Error("Invalid launcher");
        ids.add(id);
        return { ...input, id, args: input.args ?? [] };
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.unreadable = true;
        console.error("Cannot read saved launcher definitions; the existing document is preserved");
      }
    }
  }

  get(): SavedAgentLauncher[] {
    if (this.unreadable) throw new HerdrError("launcher_store_unavailable", "Cannot read this PC's saved launchers. Repair agent-launchers.json in the web server's state directory and restart the server.");
    return structuredClone(this.current);
  }

  private write(next: SavedAgentLauncher[]): SavedAgentLauncher[] {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 1, launchers: next }, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, this.path);
    this.current = next;
    return this.get();
  }

  save(input: SavedAgentLauncherInput, id?: string): SavedAgentLauncher[] {
    const next = this.get();
    const index = id === undefined ? -1 : next.findIndex((entry) => entry.id === id);
    if (id !== undefined && index < 0) throw missingLauncher();
    launcherCommand(input.executable);
    const entry = { ...input, id: id ?? `saved:${randomUUID()}`, args: input.args ?? [] };
    if (index < 0) next.push(entry); else next[index] = entry;
    return this.write(next);
  }

  remove(id: string): SavedAgentLauncher[] {
    const next = this.get();
    if (!next.some((entry) => entry.id === id)) throw missingLauncher();
    return this.write(next.filter((entry) => entry.id !== id));
  }

  select(kind: string, id: string): AgentLauncher {
    if (!savedLaunchersSupported()) throw new HerdrError("invalid_agent_launcher", "Saved launchers require a Linux or macOS PC with a POSIX interactive shell.");
    const entry = this.get().find((entry) => entry.id === id && entry.kind === kind);
    if (!entry) throw missingLauncher();
    return { kind, id, command: launcherCommand(entry.executable), args: entry.args };
  }
}

const missingLauncher = () => new HerdrError("invalid_agent_launcher", "This saved launcher was removed or changed on this PC. Reload the agent list, add it again, or choose Default.");

/** The dispatcher authorizes management reads as well as writes before entering this handler. */
export async function handleSavedLaunchersRequest(request: Request, url: URL, store: SavedLauncherStore): Promise<Response> {
  if (!savedLaunchersSupported()) return badRequest("launchers_unsupported", "Saved launchers require a Linux or macOS PC with a POSIX interactive shell.");
  try {
    if (request.method === "GET") return jsonResponse({ launchers: store.get() }, 200, { "cache-control": "no-store" });
    const id = url.searchParams.get("id");
    if (request.method === "DELETE") {
      if (!id) return badRequest("invalid_agent_launcher", "A saved launcher id is required");
      return jsonResponse({ launchers: store.remove(id) });
    }
    if (request.method !== "POST" && request.method !== "PUT") return badRequest("method_not_allowed", "Use GET, POST, PUT or DELETE");
    if (request.method === "PUT" && !id) return badRequest("invalid_agent_launcher", "A saved launcher id is required");
    let body: unknown;
    try { body = await request.json(); } catch { return badRequest("invalid_json", "request body must be JSON"); }
    const input = savedLauncherInput(body);
    if (!input) return badRequest("invalid_agent_launcher", "Send a supported kind, display label, executable and optional array of argument strings, without control characters");
    return jsonResponse({ launchers: store.save(input, request.method === "PUT" ? id! : undefined) });
  } catch (error) {
    if (error instanceof HerdrError) return badRequest(error.code, error.message);
    return errorResponse(error);
  }
}
