import { afterEach, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { savedLauncherInput } from "../shared/agent-launchers.ts";
import { SavedLauncherStore } from "./saved-launchers.ts";

const roots: string[] = [];
const root = () => { const dir = mkdtempSync(join(tmpdir(), "saved-launchers-")); roots.push(dir); return dir; };
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const input = { kind: "codex", label: "Research", executable: process.execPath, args: ["resume", "two words", "a'quote", "$(not-expanded); *", ""] };

it.skipIf(process.platform !== "linux" && process.platform !== "darwin")("persists CRUD across reconstruction without running a saved executable", () => {
  const dir = root(), marker = join(dir, "ran"), executable = join(dir, "custom-name");
  writeFileSync(executable, `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o700 });
  const store = new SavedLauncherStore(dir);
  const [entry] = store.save({ ...input, executable });
  expect(existsSync(marker)).toBeFalse();
  expect(entry!.id).toMatch(/^saved:[0-9a-f-]{36}$/);
  expect(new SavedLauncherStore(dir).get()).toEqual([entry!]);
  expect(store.select("codex", entry!.id)).toMatchObject({ command: executable, args: input.args });
  expect(() => store.select("pi", entry!.id)).toThrow("removed or changed");
  const edited = store.save({ ...input, label: "Revised", executable }, entry!.id);
  expect(new SavedLauncherStore(dir).get()).toEqual(edited);
  if (process.platform !== "win32") expect(statSync(join(dir, "agent-launchers.json")).mode & 0o777).toBe(0o600);
  store.remove(entry!.id);
  expect(new SavedLauncherStore(dir).get()).toEqual([]);
  expect(() => store.select("codex", entry!.id)).toThrow("removed or changed");
  expect(() => store.save(input, entry!.id)).toThrow("removed or changed");
  expect(existsSync(marker)).toBeFalse();
});

it("rejects invalid definitions and terminal controls but preserves literal argument values", () => {
  expect(savedLauncherInput(input)).toEqual(input);
  for (const patch of [{ kind: "unknown" }, { label: " " }, { executable: "" }, { args: "words" }, { args: [1] }, { id: "client-supplied" }, { environment: {} }]) expect(savedLauncherInput({ ...input, ...patch })).toBeNull();
  for (const control of ["\n", "\r", "\0", "\x1b", "\x7f"]) {
    for (const patch of [{ label: `a${control}b` }, { executable: `a${control}b` }, { args: [`a${control}b`] }]) expect(savedLauncherInput({ ...input, ...patch })).toBeNull();
  }
});

it("preserves malformed, duplicate-ID and unsupported documents and refuses changes", () => {
  const entry = { ...input, id: "saved:00000000-0000-4000-8000-000000000001" };
  for (const bytes of ["{broken", "null", JSON.stringify({ version: 2, launchers: [] }), JSON.stringify({ version: 1, launchers: [entry, entry] }), JSON.stringify({ version: 1, launchers: [{ ...entry, args: [null] }] })]) {
    const dir = root(), path = join(dir, "agent-launchers.json");
    writeFileSync(path, bytes);
    const store = new SavedLauncherStore(dir);
    expect(() => store.get()).toThrow("Repair agent-launchers.json");
    expect(() => store.save(input)).toThrow();
    expect(() => store.remove(entry.id)).toThrow();
    expect(() => store.select("codex", entry.id)).toThrow();
    expect(readFileSync(path, "utf8")).toBe(bytes);
  }
  const dir = root(); mkdirSync(join(dir, "agent-launchers.json"));
  expect(() => new SavedLauncherStore(dir).get()).toThrow("Repair agent-launchers.json");
});

it("keeps the previous memory and disk after failed writes and failed renames", () => {
  const dir = root(), path = join(dir, "agent-launchers.json"), store = new SavedLauncherStore(dir);
  const entries = store.save(input), bytes = readFileSync(path, "utf8"), temporary = `${path}.${process.pid}.tmp`;
  mkdirSync(temporary);
  expect(() => store.save({ ...input, label: "Cannot write" })).toThrow();
  expect(store.get()).toEqual(entries);
  expect(readFileSync(path, "utf8")).toBe(bytes);
  rmSync(temporary, { recursive: true });
  const rename = spyOn(fs, "renameSync").mockImplementationOnce(() => { throw new Error("fixture rename failure"); });
  try {
    expect(() => store.remove(entries[0]!.id)).toThrow("fixture rename failure");
    expect(store.get()).toEqual(entries);
    expect(readFileSync(path, "utf8")).toBe(bytes);
  } finally { rename.mockRestore(); }
  expect(new SavedLauncherStore(dir).get()).toEqual(entries);
});
