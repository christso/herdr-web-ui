/** WSL can block procfs memory reads during agent exit. Keep them outside the bridge. */
interface ProcessMemory { argv: string[]; environ: string[] }
const MAX_OUTPUT = 1024 * 1024;
const SCRIPT = `
const fs = require("node:fs"), pid = process.argv[1];
try {
  const stat = fs.readFileSync("/proc/" + pid + "/stat", "utf8");
  if (/[DZXx]/.test(stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3))) process.exit(1);
  const read = name => fs.readFileSync("/proc/" + pid + "/" + name, "utf8").split("\\0").filter(Boolean);
  console.log(JSON.stringify({ argv: process.argv[2] === "1" ? read("cmdline") : [], environ: read("environ") }));
} catch { process.exit(1); }
`;

/** Concurrent polls share a probe; timed-out children retain their slot until they exit. */
export function createOmpProcessProbe({ timeoutMs = 1000, maxProcesses = 4, command = (pid, argv) => [process.execPath, "-e", SCRIPT, String(pid), argv ? "1" : "0"] }: {
  timeoutMs?: number;
  maxProcesses?: number;
  command?: (pid: number, argv: boolean) => string[];
} = {}): (pid: number, argv: boolean) => Promise<ProcessMemory | null> {
  const pending = new Map<string, Promise<ProcessMemory | null>>();
  return (pid, argv) => {
    if (process.platform !== "linux" || !Number.isSafeInteger(pid) || pid <= 0) return Promise.resolve(null);
    const key = `${pid}:${argv}`;
    const existing = pending.get(key);
    if (existing) return existing;
    if (pending.size >= maxProcesses) return Promise.resolve(null);
    let child: Bun.Subprocess<"ignore", "pipe", "ignore">;
    try { child = Bun.spawn(command(pid, argv), { stdin: "ignore", stdout: "pipe", stderr: "ignore" }); }
    catch { return Promise.resolve(null); }
    child.unref();
    const reader = child.stdout.getReader();
    const answer = new Promise<ProcessMemory | null>((resolve) => {
      let finished = false;
      const finish = (value: ProcessMemory | null) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        // A kernel-blocked child may not exit promptly even after SIGKILL. Never await it here.
        try { child.kill("SIGKILL"); } catch { /* already exited */ }
        void reader.cancel().catch(() => {});
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      void (async () => {
        let output = "", bytes = 0;
        const decoder = new TextDecoder();
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > MAX_OUTPUT) { finish(null); return; }
            output += decoder.decode(chunk.value, { stream: true });
          }
          output += decoder.decode();
          const value: unknown = JSON.parse(output);
          const words = (v: unknown): v is string[] => Array.isArray(v) && v.every((word) => typeof word === "string");
          if (value !== null && typeof value === "object" && "argv" in value && "environ" in value && words(value.argv) && words(value.environ)) finish({ argv: value.argv, environ: value.environ });
          else finish(null);
        } catch { finish(null); }
      })();
    });
    pending.set(key, answer);
    void child.exited.then(() => pending.delete(key), () => pending.delete(key));
    return answer;
  };
}

export const ompProcessMemory = createOmpProcessProbe();
