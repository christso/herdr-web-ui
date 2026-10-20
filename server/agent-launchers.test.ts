import { afterEach, expect, it } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentExecutable, discoverLegacyLaunchers, selectedLegacyLauncher } from "./agent-launchers.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "herdr-discovery-")); roots.push(home);
  const bin = join(home, ".local/bin"); mkdirSync(bin, { recursive: true });
  const env = { PATH: bin };
  writeFileSync(join(bin, "codex"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const wrapper = (id: string, source = "#!/bin/sh\nexit 0\n") => { const path = join(bin, id); writeFileSync(path, source, { mode: 0o755 }); return path; };
  return { home, bin, env, wrapper, discover: () => discoverLegacyLaunchers({ home, env, platform: "linux" }) };
}
it("discovers installed shell wrappers without a catalog, respecting precedence and excluding helpers", () => {
  const f = fixture();
  const chosen = f.wrapper("codex-compound");
  f.wrapper("pi-compound", "#!/usr/bin/env bash\nexit 0\n");
  f.wrapper("omp-review", "#!/usr/bin/env -S zsh -f\nexit 0\n");
  f.wrapper("codex-binary", "\x7fELFbinary"); f.wrapper("codex-js", "#!/usr/bin/env node\n");
  f.wrapper("codex-unavailable"); chmodSync(join(f.bin, "codex-unavailable"), 0o644);
  f.wrapper("codex-bad;name"); mkdirSync(join(f.bin, "pi-directory"));
  mkdirSync(join(f.home, "bin")); writeFileSync(join(f.home, "bin/codex-compound"), "#!/bin/sh\nexit 1", { mode: 0o755 });
  symlinkSync(join(f.home, "missing"), join(f.bin, "codex-missing"));
  const found = f.discover();
  expect(found.filter((entry) => entry.kind === "codex").map(({ id }) => id)).toEqual(["codex-compound"]);
  expect(found.filter((entry) => entry.kind === "pi").map(({ id }) => id)).toEqual(["pi-compound"]);
  expect(found.filter((entry) => entry.kind === "omp").map(({ id }) => id)).toEqual(["omp-review"]);
  expect(selectedLegacyLauncher(found, "codex", "codex-compound")).toMatchObject({ command: chosen });
  expect(() => selectedLegacyLauncher(found, "pi", "codex-compound")).toThrow("unavailable");
  rmSync(join(f.home, "bin/codex-compound"));
  chmodSync(chosen, 0o644);
  expect(() => selectedLegacyLauncher(f.discover(), "codex", "codex-compound")).toThrow("unavailable");
  expect(discoverLegacyLaunchers({ home: f.home, env: f.env, platform: "win32" })).toEqual([]);
});

it("discovers Claude configuration launchers", () => {
  const f = fixture();
  const command = f.wrapper("claude-work");
  const found = f.discover();
  expect(found.filter((entry) => entry.kind === "claude").map(({ id }) => id)).toEqual(["claude-work"]);
  expect(selectedLegacyLauncher(found, "claude", "claude-work")).toEqual({ kind: "claude", id: "claude-work", command });
});

it("canonical installed availability uses the same trusted user bins for Codex, OMP and Pi", () => {
  const f = fixture();
  const nonlogin = join(f.home, "nonlogin"); mkdirSync(nonlogin); f.env.PATH = nonlogin;
  mkdirSync(join(f.home, ".bun/bin"), { recursive: true });
  writeFileSync(join(f.home, ".bun/bin/omp"), "#!/bin/sh\n", { mode: 0o755 });
  const pi = f.wrapper("pi");
  expect(agentExecutable("codex", f.home, f.env)).toBe(join(f.bin, "codex"));
  expect(agentExecutable("omp", f.home, f.env)).toBe(join(f.home, ".bun/bin/omp"));
  expect(agentExecutable("pi", f.home, f.env)).toBe(pi);
  chmodSync(pi, 0o644); expect(agentExecutable("pi", f.home, f.env)).toBeNull();
  writeFileSync(join(nonlogin, "codex"), "#!/bin/sh\n", { mode: 0o755 });
  expect(agentExecutable("codex", f.home, f.env)).toBe(join(nonlogin, "codex"));
});
