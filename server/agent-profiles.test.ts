import { afterEach, expect, it } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAgentProfiles, profileSummaries, selectedAgentProfile } from "./agent-profiles.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "herdr-agent-profiles-")); roots.push(root);
  const command = join(root, "launcher"); writeFileSync(command, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const profile = { id: "compound", label: "Compound", kind: "codex", command, args: ["fixed secret"], fresh: true };
  const save = (profiles: unknown) => writeFileSync(join(root, "agent-profiles.json"), JSON.stringify({ profiles }));
  return { root, command, profile, save };
}
it("absent catalog and Windows offer no profiles; summaries expose only id and label", () => {
  const f = fixture(); expect(readAgentProfiles(f.root, "linux")).toEqual([]);
  f.save([f.profile, { ...f.profile, kind: "pi" }]);
  const profiles = readAgentProfiles(f.root, "linux");
  expect(profileSummaries(profiles, "codex")).toEqual([{ id: "compound", label: "Compound" }]);
  expect(selectedAgentProfile(profiles, "codex", "compound")).toEqual(f.profile);
  expect(readAgentProfiles(f.root, "win32")).toEqual([]);
  expect(() => selectedAgentProfile(profiles, "omp", "compound")).toThrow("unavailable");
});
it("rejects the entire malformed catalog without exposing paths or fixed arguments", () => {
  const f = fixture();
  for (const invalid of [null, {}, { ...f.profile, command: "relative" }, { ...f.profile, args: [1] }, { ...f.profile, fresh: "yes" }, { ...f.profile, kind: "shell" }, { ...f.profile, id: "" }, { ...f.profile, env: {} }]) {
    f.save([f.profile, invalid]);
    expect(() => readAgentProfiles(f.root, "linux")).toThrow("Invalid agent profiles configuration");
  }
  f.save([f.profile, f.profile]); expect(() => readAgentProfiles(f.root, "linux")).toThrow();
});
it.skipIf(process.platform === "win32")("unavailable launchers are not offered or selectable, and changes are reread", () => {
  const f = fixture(); f.save([f.profile]); expect(readAgentProfiles(f.root, "linux")).toHaveLength(1);
  chmodSync(f.command, 0o644); expect(readAgentProfiles(f.root, "linux")).toEqual([]);
  expect(() => selectedAgentProfile(readAgentProfiles(f.root, "linux"), "codex", "compound")).toThrow("unavailable");
});
