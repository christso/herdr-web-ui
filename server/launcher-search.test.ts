import { afterEach, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as filesystem from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LauncherSearch } from "./launcher-search.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
it("suggests executable names of any format, deduplicates and bounds prefixes without executing", async () => {
  const home = mkdtempSync(join(tmpdir(), "launcher-search-")); roots.push(home);
  const bin = join(home, "bin"), extra = join(home, ".local/bin");
  mkdirSync(bin); mkdirSync(extra, { recursive: true });
  const marker = join(home, "ran");
  for (const [name, source] of [["research", `#!/bin/sh\ntouch '${marker}'`], ["research.js", "#!/usr/bin/env node\n"], ["research-binary", "binary"], ["other", ""]]) writeFileSync(join(bin, name!), source!, { mode: 0o700 });
  writeFileSync(join(extra, "research"), "duplicate", { mode: 0o700 });
  writeFileSync(join(extra, "research-home"), "", { mode: 0o700 });
  writeFileSync(join(bin, "research-file"), "", { mode: 0o600 });
  mkdirSync(join(bin, "research-directory")); symlinkSync(join(home, "missing"), join(bin, "research-missing"));
  for (let i = 0; i < 30; i++) writeFileSync(join(bin, `many-${i}`), "", { mode: 0o700 });
  const search = new LauncherSearch(); const context = { home, env: { PATH: `${bin}:${extra}:${bin}` } };
  expect(await search.search("research", context)).toEqual(["research", "research-binary", "research-home", "research.js"]);
  expect(await search.search("search", context)).toEqual([]);
  expect(await search.search("", context)).toEqual([]);
  expect(await search.search("many", context)).toHaveLength(20);
  expect(existsSync(marker)).toBeFalse();
});
it("shares refresh work and expires a PC-owned cache keyed by home and PATH", async () => {
  const home = mkdtempSync(join(tmpdir(), "launcher-cache-")); roots.push(home);
  const bin = join(home, "bin"); mkdirSync(bin);
  const search = new LauncherSearch(), context = { home, env: { PATH: bin } };
  const read = spyOn(filesystem, "readdir");
  let now = 1000; const clock = spyOn(Date, "now").mockImplementation(() => now);
  try {
    writeFileSync(join(bin, "first"), "", { mode: 0o700 });
    expect(await Promise.all([search.search("fir", context), search.search("fir", context)])).toEqual([["first"], ["first"]]);
    const reads = read.mock.calls.length;
    expect(reads).toBe(3);
    rmSync(join(bin, "first")); writeFileSync(join(bin, "fresh"), "", { mode: 0o700 });
    expect(await search.search("f", context)).toEqual(["first"]);
    expect(read.mock.calls.length).toBe(reads);
    now += 10_001;
    expect(await search.search("f", context)).toEqual(["fresh"]);
    expect(read.mock.calls.length).toBe(reads * 2);
    const other = join(home, "other"); mkdirSync(other); writeFileSync(join(other, "foreign"), "", { mode: 0o700 });
    expect(await search.search("f", { home: other, env: { PATH: other } })).toEqual(["foreign"]);
    expect(await new LauncherSearch().search("f", context)).toEqual(["fresh"]);
  } finally { clock.mockRestore(); read.mockRestore(); }
});
