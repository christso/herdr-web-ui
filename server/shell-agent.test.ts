import { expect, it, spyOn } from "bun:test";
import * as herdr from "./herdr/client.ts";
import { isGjcProcess } from "./gjc-runtime.ts";
import { startAgentLauncher } from "./saved-launcher-start.ts";
import { paneShell, shellAgentExecutable, shellCommandLine } from "./shell-agent.ts";
import { descendantArgv, descendantProcesses, parseProcessTable, windowsArgv, windowsProcessTable } from "./windows-processes.ts";

it("tells a pane's shell from the program herdr reports in front", () => {
  expect(paneShell("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")).toBe("powershell");
  expect(paneShell("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe("powershell");
  expect(paneShell("C:\\Windows\\System32\\cmd.exe")).toBe("cmd");
  expect(paneShell("/bin/zsh")).toBe("posix");
});

it("writes the line each shell runs as a command, not as a string", () => {
  const exe = "C:\\Users\\o'brien\\AppData\\Local\\gjc\\gjc.exe";
  expect(shellCommandLine("powershell", exe, ["--resume", "a b"])).toBe("& 'C:\\Users\\o''brien\\AppData\\Local\\gjc\\gjc.exe' '--resume' 'a b'");
  expect(shellCommandLine("cmd", "C:\\gjc\\gjc.exe", ["a b"])).toBe('"C:\\gjc\\gjc.exe" "a b"');
  expect(shellCommandLine("posix", "/usr/local/bin/gjc", ["it's"])).toBe("'/usr/local/bin/gjc' 'it'\\''s'");
  // a trailing backslash must not escape the closing quote for the program that parses it
  expect(shellCommandLine("cmd", "C:\\gjc\\gjc.exe", ["C:\\work\\", "--resume"])).toBe('"C:\\gjc\\gjc.exe" "C:\\work\\\\" "--resume"');
  // cmd cannot carry these inside quotes
  expect(() => shellCommandLine("cmd", "C:\\gjc\\gjc.exe", ["%PATH%"])).toThrow();
  expect(() => shellCommandLine("cmd", "C:\\gjc\\gjc.exe", ['say "hi"'])).toThrow();
});

it("recognizes gjc as Windows reports it", () => {
  expect(isGjcProcess(["C:\\Users\\devsw\\AppData\\Local\\gjc\\gjc.exe"])).toBe(true);
  expect(isGjcProcess(["C:\\Program Files\\nodejs\\node.exe", "C:\\tools\\gjc\\dist\\gjc.mjs"])).toBe(true);
  expect(isGjcProcess(["C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "-NoExit"])).toBe(false);
  expect(isGjcProcess(["C:\\tools\\gjc-helper.exe"])).toBe(false);
});

it("finds what runs under a pane's shell in the process table", () => {
  // the table as PowerShell prints it; rows from a Windows PC with gjc running in a pane
  const table = parseProcessTable(JSON.stringify([
    { ProcessId: 41948, ParentProcessId: 26540, ExecutablePath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", CommandLine: "powershell.exe -NoExit" },
    { ProcessId: 12156, ParentProcessId: 41948, ExecutablePath: "C:\\Users\\devsw\\AppData\\Local\\gjc\\gjc.exe", CommandLine: '"C:\\Users\\devsw\\AppData\\Local\\gjc\\gjc.exe"' },
    { ProcessId: 700, ParentProcessId: 12156, ExecutablePath: null, CommandLine: '"C:\\Program Files\\nodejs\\node.exe" "C:\\x y\\tool.js" --flag' },
    { ProcessId: 9, ParentProcessId: 4, ExecutablePath: "C:\\other\\gjc.exe", CommandLine: "gjc.exe" },
    { ProcessId: "bad" },
  ]));
  const under = descendantArgv(table, 41948);
  expect(under).toEqual([
    ["C:\\Users\\devsw\\AppData\\Local\\gjc\\gjc.exe"],
    ["C:\\Program Files\\nodejs\\node.exe", "C:\\x y\\tool.js", "--flag"],
  ]);
  expect(under.some(isGjcProcess)).toBe(true);
  // the same walk, with each process's number
  expect(descendantProcesses(table, 41948).map((entry) => entry.pid)).toEqual([12156, 700]);
  // another pane's shell has no gjc under it, though one runs elsewhere on the PC
  expect(descendantArgv(table, 26540).length).toBe(3);
  expect(descendantArgv(table, 4242)).toEqual([]);
  expect(parseProcessTable("not json")).toEqual([]);
  // the process's start, as the table script reads it (ms since 1970), comes along when present
  expect(parseProcessTable(JSON.stringify({ ProcessId: 2, ParentProcessId: 1, ExecutablePath: null, CommandLine: "x", Started: 1790886000123 }))).toEqual([{ pid: 2, parent: 1, path: null, commandLine: "x", started: 1790886000123 }]);
  expect(windowsArgv('"C:\\a b\\x.exe" one "two three"')).toEqual(["C:\\a b\\x.exe", "one", "two three"]);
});

it("gives up on a process-table query that stalls, and kills it", async () => {
  const started = Date.now();
  expect(await windowsProcessTable(200, ["sleep", "30"])).toEqual([]);
  expect(Date.now() - started).toBeLessThan(5000);
  // a query that answers is read
  expect(await windowsProcessTable(5000, ["printf", '[{"ProcessId":2,"ParentProcessId":1,"ExecutablePath":null,"CommandLine":"x"}]'])).toEqual([{ pid: 2, parent: 1, path: null, commandLine: "x" }]);
});

it("offers OmO on Windows when its launcher is on PATH", () => {
  const which = spyOn(Bun, "which").mockReturnValue("C:\\tools\\omo.exe");
  try {
    expect(shellAgentExecutable("omo", "win32")).toBe("C:\\tools\\omo.exe");
    expect(which).toHaveBeenCalledWith("omo", { PATH: process.env["PATH"] ?? "" });
    which.mockReturnValue(null);
    expect(shellAgentExecutable("omo", "win32")).toBeNull();
  } finally {
    which.mockRestore();
  }
});

it("only offers a shell with the native agent.start foreground ownership evidence", async () => {
  const { availableLauncherShell } = await import("./saved-launcher-start.ts");
  const info = { pane_id: "fixture", shell_pid: 123, foreground_process_group_id: 123, foreground_processes: [{ pid: 123, name: "-zsh" }] };
  expect(availableLauncherShell(info)).toBe("posix");
  expect(availableLauncherShell({ ...info, foreground_process_group_id: 456 })).toBeNull();
  expect(availableLauncherShell({ ...info, foreground_processes: [] })).toBeNull();
  expect(availableLauncherShell({ ...info, foreground_processes: [{ pid: 123, name: "zsh" }, { pid: 456, name: "vim" }] })).toBeNull();
  expect(availableLauncherShell({ ...info, foreground_processes: [{ pid: 123, name: "vim" }] })).toBeNull();
  expect(availableLauncherShell({ ...info, foreground_processes: [{ pid: 123, name: "pwsh" }] })).toBeNull();
  expect(availableLauncherShell(undefined)).toBeNull();
});

for (const state of ["active agent", "unreadable foreground", "foreign foreground job", "shell becomes busy"] as const) {
  it.skipIf(process.platform !== "linux" && process.platform !== "darwin")(`refuses wrapper launch with ${state} without typing into the pane`, async () => {
    const ready = { pane_id: "fixture", shell_pid: 123, foreground_process_group_id: 123, foreground_processes: [{ pid: 123, name: "zsh" }] };
    const busy = { ...ready, foreground_process_group_id: 456, foreground_processes: [{ pid: 456, name: "vim" }] };
    const agent = spyOn(herdr, "agentGet").mockRejectedValue(new herdr.HerdrError("agent_not_found", "No agent"));
    const processes = spyOn(herdr, "paneProcessInfo").mockResolvedValue(state === "unreadable foreground" ? undefined : state === "active agent" ? ready : busy);
    const input = spyOn(herdr, "paneSendText").mockResolvedValue(undefined);
    if (state === "active agent") agent.mockResolvedValue({ agent: "codex" } as never);
    if (state === "shell becomes busy") processes.mockResolvedValueOnce(ready);
    try {
      await expect(startAgentLauncher({ id: "saved:00000000-0000-4000-8000-000000000001", kind: "codex", command: "/fixture/launcher" }, "fixture", undefined, 30)).rejects.toMatchObject({ code: "agent_pane_busy" });
      expect(input).not.toHaveBeenCalled();
    } finally {
      agent.mockRestore(); processes.mockRestore(); input.mockRestore();
    }
  });
}
