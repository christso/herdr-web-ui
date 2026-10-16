import { expect, it } from "bun:test";
import { createOmpProcessProbe } from "./omp-process.ts";

it.skipIf(process.platform !== "linux")("reads a live process's arguments and environment without blocking the caller", async () => {
  const read = createOmpProcessProbe();
  const result = await read(process.pid, true);
  expect(result?.argv.length).toBeGreaterThan(0);
  expect(result?.environ.some((word) => word.startsWith("PATH="))).toBe(true);
  expect((await read(process.pid, false))?.argv).toEqual([]);
  expect(await read(2147483647, true)).toBeNull();
});

it.skipIf(process.platform !== "linux")("a stalled memory read has a deadline and leaves the event loop responsive", async () => {
  const read = createOmpProcessProbe({ timeoutMs: 100, command: () => [process.execPath, "-e", "setInterval(() => {}, 1000)"] });
  const result = read(process.pid, true);
  let settled = false;
  void result.then(() => { settled = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(settled).toBe(false);
  expect(await Promise.race([result, new Promise((resolve) => setTimeout(() => resolve("deadline missed"), 1000))])).toBeNull();
});

it.skipIf(process.platform !== "linux")("deduplicates reads and bounds outstanding helpers when polling repeats", async () => {
  let starts = 0;
  const read = createOmpProcessProbe({ timeoutMs: 100, maxProcesses: 1, command: () => { starts++; return [process.execPath, "-e", "setInterval(() => {}, 1000)"]; } });
  const first = read(1, true);
  expect(read(1, true)).toBe(first);
  expect(await read(2, true)).toBeNull();
  expect(starts).toBe(1);
  expect(await first).toBeNull();
});

it.skipIf(process.platform !== "linux")("rejects malformed or excessive helper output and invalid process IDs", async () => {
  for (const script of ["console.log('not JSON')", "console.log(JSON.stringify({argv:[42],environ:[]}))", "console.log('x'.repeat(1024*1024+1))", "process.exit(1)"]) {
    const read = createOmpProcessProbe({ command: () => [process.execPath, "-e", script] });
    expect(await read(process.pid, true)).toBeNull();
  }
  let starts = 0;
  const read = createOmpProcessProbe({ command: () => { starts++; return []; } });
  for (const pid of [-1, 0, 1.5, Number.NaN]) expect(await read(pid, true)).toBeNull();
  expect(starts).toBe(0);
});
