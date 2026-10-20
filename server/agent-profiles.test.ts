import { afterEach, expect, it } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentExecutable, discoverAgentLaunches, launchSummaries, selectedAgentLaunch } from "./agent-profiles.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "herdr-discovery-")); roots.push(home);
  const bin = join(home, ".local/bin"); mkdirSync(bin, { recursive: true });
  const env = { PATH: bin, CODEX_HOME: join(home, "codex-home"), PI_CONFIG_DIR: ".custom-omp" };
  mkdirSync(env.CODEX_HOME);
  writeFileSync(join(bin, "codex"), "#!/bin/sh\nprintf '%s\\n' '-p, --profile <CONFIG_PROFILE>'\n", { mode: 0o755 });
  const wrapper = (id: string, source = "#!/bin/sh\nexit 0\n") => { const path = join(bin, id); writeFileSync(path, source, { mode: 0o755 }); return path; };
  return { home, bin, env, wrapper, discover: (legacyLaunchers = false) => discoverAgentLaunches({ home, env, platform: "linux", legacyLaunchers }) };
}
it("discovers exact native IDs using native roots without exposing configuration contents", () => {
  const f = fixture();
  writeFileSync(join(f.env.CODEX_HOME, "config.toml"), '[profiles.legacy]\nmodel = "private-model"\n[profiles."compound-engineering"]\n');
  writeFileSync(join(f.env.CODEX_HOME, "review.config.toml"), 'model = "another-private-model"\n');
  mkdirSync(join(f.home, ".custom-omp/profiles/compound-engineering/agent"), { recursive: true });
  mkdirSync(join(f.home, ".custom-omp/profiles/not-a-profile"), { recursive: true });
  mkdirSync(join(f.home, ".custom-omp/profiles/default/agent"), { recursive: true });
  mkdirSync(join(f.home, ".pi/profiles/invented/agent"), { recursive: true });
  const found = f.discover();
  expect(launchSummaries(found.profiles, "codex")).toEqual([{ id: "compound-engineering", label: "compound-engineering" }, { id: "legacy", label: "legacy" }]);
  expect(launchSummaries(found.profiles, "omp")).toEqual([{ id: "compound-engineering", label: "compound-engineering" }]);
  expect(launchSummaries(found.profiles, "pi")).toEqual([]);
  expect(JSON.stringify(found)).not.toContain("private-model");
});
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
  const found = f.discover(true);
  expect(launchSummaries(found.launchers, "codex")).toEqual([{ id: "codex-compound", label: "codex-compound" }]);
  expect(launchSummaries(found.launchers, "pi")).toEqual([{ id: "pi-compound", label: "pi-compound" }]);
  expect(launchSummaries(found.launchers, "omp")).toEqual([{ id: "omp-review", label: "omp-review" }]);
  expect(selectedAgentLaunch(found, "codex", undefined, "codex-compound")).toMatchObject({ command: chosen });
  expect(() => selectedAgentLaunch(found, "pi", undefined, "codex-compound")).toThrow("unavailable");
  expect(() => selectedAgentLaunch(found, "codex", "review", "codex-compound")).toThrow();
  rmSync(join(f.home, "bin/codex-compound"));
  chmodSync(chosen, 0o644);
  expect(() => selectedAgentLaunch(f.discover(true), "codex", undefined, "codex-compound")).toThrow("unavailable");
  expect(discoverAgentLaunches({ home: f.home, env: f.env, platform: "win32" })).toEqual({ profiles: [], launchers: [] });
});
it("reads native file changes and never reads a Herdr catalog", () => {
  const f = fixture();
  writeFileSync(join(f.home, "agent-profiles.json"), "invalid ignored catalog");
  expect(f.discover()).toEqual({ profiles: [], launchers: [] });
  writeFileSync(join(f.bin, "codex"), "#!/bin/sh\nprintf '%s\\n' '-p, --profile <CONFIG_PROFILE_V2>'\n", { mode: 0o755 });
  writeFileSync(join(f.env.CODEX_HOME, "new.config.toml"), "model = 'safe'\n");
  expect(selectedAgentLaunch(f.discover(), "codex", "new")).toEqual({ kind: "codex", profile: "new" });
  rmSync(join(f.env.CODEX_HOME, "new.config.toml"));
  expect(() => selectedAgentLaunch(f.discover(), "codex", "new")).toThrow("unavailable");
});

it("discovers Claude configuration launchers without inventing a native profile flag", () => {
  const f = fixture();
  const command = f.wrapper("claude-work");
  const found = f.discover(true);
  expect(launchSummaries(found.launchers, "claude")).toEqual([{ id: "claude-work", label: "claude-work" }]);
  expect(launchSummaries(found.profiles, "claude")).toEqual([]);
  expect(selectedAgentLaunch(found, "claude", undefined, "claude-work")).toEqual({ kind: "claude", id: "claude-work", command });
  expect(() => selectedAgentLaunch(found, "claude", "work")).toThrow("unavailable");
});

it("selects Codex profiles compatible with installed CLI help and excludes legacy conflicts", () => {
  const f = fixture();
  writeFileSync(join(f.env.CODEX_HOME, "config.toml"), '[profiles.conflict]\nmodel = "secret"\nprofile = "unused"\n');
  writeFileSync(join(f.env.CODEX_HOME, "conflict.config.toml"), 'model = "secret"');
  writeFileSync(join(f.env.CODEX_HOME, "modern.config.toml"), 'model = "secret"');
  expect(launchSummaries(f.discover().profiles, "codex")).toEqual([{ id: "conflict", label: "conflict" }]);
  writeFileSync(join(f.bin, "codex"), "#!/bin/sh\nprintf '%s\\n' '-p, --profile <CONFIG_PROFILE_V2>'\n", { mode: 0o755 });
  expect(launchSummaries(f.discover().profiles, "codex")).toEqual([{ id: "modern", label: "modern" }]);
  writeFileSync(join(f.bin, "codex"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  f.wrapper("codex-useful");
  expect(f.discover().profiles).toEqual([]);
  expect(launchSummaries(f.discover(true).launchers, "codex")).toEqual([{ id: "codex-useful", label: "codex-useful" }]);
});
it("finds canonical Codex in ordinary user bins on a non-login bridge PATH", () => {
  const f = fixture();
  const nonlogin = join(f.home, "nonlogin"); mkdirSync(nonlogin);
  f.env.PATH = nonlogin;
  writeFileSync(join(f.env.CODEX_HOME, "config.toml"), "[profiles.remote-native]\n");
  expect(launchSummaries(f.discover().profiles, "codex")).toEqual([{ id: "remote-native", label: "remote-native" }]);
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

it("keeps installed wrappers out of ordinary discovery without losing native profiles", () => {
  const f = fixture(); f.wrapper("codex-compound");
  writeFileSync(join(f.env.CODEX_HOME, "config.toml"), "[profiles.research]\n");
  expect(f.discover()).toEqual({ profiles: [{ kind: "codex", id: "research" }], launchers: [] });
});
