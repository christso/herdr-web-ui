import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LauncherSearchResponse } from "../shared/protocol.ts";
import { executableSearchPaths } from "./agent-launchers.ts";
import { badRequest, jsonResponse } from "./http.ts";

export class LauncherSearch {
  private cache: { key: string; expires: number; names: Promise<string[]> } | undefined;

  async search(query: string, { home = homedir(), env = process.env }: { home?: string; env?: NodeJS.ProcessEnv } = {}): Promise<string[]> {
    if (!query) return [];
    const paths = executableSearchPaths(home, env), key = JSON.stringify([home, paths]);
    if (!this.cache || this.cache.key !== key || this.cache.expires <= Date.now()) {
      const names = this.scan(paths);
      const entry = { key, expires: Infinity, names };
      this.cache = entry;
      void names.then(() => { entry.expires = Date.now() + 10_000; });
    }
    return (await this.cache.names).filter((name) => name.startsWith(query)).slice(0, 20);
  }

  private async scan(paths: string[]): Promise<string[]> {
    const candidates: { name: string; path: string }[] = [];
    for (const path of paths) {
      try {
        for (const name of await readdir(path)) {
          if (!/[\\/\p{Cc}]/u.test(name)) candidates.push({ name, path: join(path, name) });
        }
      } catch {}
    }
    const names = new Set<string>();
    let index = 0;
    await Promise.all(Array.from({ length: 16 }, async () => {
      for (;;) {
        const candidate = candidates[index++];
        if (!candidate) return;
        try {
          await access(candidate.path, constants.X_OK);
          if ((await stat(candidate.path)).isFile()) names.add(candidate.name);
        } catch {}
      }
    }));
    return [...names].sort();
  }
}

export async function handleLauncherSearchRequest(request: Request, url: URL, search: LauncherSearch): Promise<Response> {
  if (request.method !== "GET") return badRequest("method_not_allowed", "use GET");
  const query = url.searchParams.get("q") ?? "";
  if (query.length > 256 || /\p{Cc}/u.test(query)) return badRequest("invalid_query", "Use a command prefix without control characters");
  return jsonResponse({ names: await search.search(query) } satisfies LauncherSearchResponse);
}
