import { afterEach, expect, it } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentExecutable } from "./agent-launchers.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "herdr-discovery-")); roots.push(home);
  const bin = join(home, ".local/bin"); mkdirSync(bin, { recursive: true });
  const env = { PATH: bin };
  writeFileSync(join(bin, "codex"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const wrapper = (id: string, source = "#!/bin/sh\nexit 0\n") => { const path = join(bin, id); writeFileSync(path, source, { mode: 0o755 }); return path; };
  return { home, bin, env, wrapper };
}
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
