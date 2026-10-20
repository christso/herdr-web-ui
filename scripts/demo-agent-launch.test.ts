import { expect, it } from "bun:test";

it("the demo offers saved launchers without native profiles or an automatic wrapper catalog and validates every creation flow", async () => {
  const saved = new Map(["window", "location", "PushManager"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    const storage = new Map<string, string>();
    (globalThis as any).location = new URL("http://demo.test/demo/app/");
    (globalThis as any).window = {
      fetch, WebSocket, EventSource: class {},
      localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    };
    const transport = "../site/demo/transport.ts?agent-launch";
    await import(transport);
    const demo = (globalThis as any).window;
    const agents = (await (await demo.fetch("/api/agents")).json()).agents;
    expect(agents.find((entry: any) => entry.kind === "codex").profiles).toBeUndefined();
    expect(agents.find((entry: any) => entry.kind === "pi").profiles).toBeUndefined();
    expect(agents.find((entry: any) => entry.kind === "pi").launchers).toEqual([]);
    expect(agents.find((entry: any) => entry.kind === "claude").profiles).toBeUndefined();
    expect(agents.find((entry: any) => entry.kind === "claude").launchers).toEqual([]);
    expect(agents.find((entry: any) => entry.kind === "codex").launcher_search).toBeTrue();
    expect(await (await demo.fetch("/api/agents/launchers/search?q=research")).json()).toEqual({ names: ["research", "research.js"] });
    const savedId = async (kind: string, executable: string) => (await (await demo.fetch("/api/agents/launchers", { method: "POST", body: JSON.stringify({ kind, executable, label: executable, args: [] }) })).json()).launchers.at(-1).id;
    const codexLauncher = await savedId("codex", "codex-compound"), piLauncher = await savedId("pi", "research"), claudeLauncher = await savedId("claude", "research.js");
    const snapshot = async () => (await (await demo.fetch("/api/session")).json()).snapshot;
    const workspace = (await snapshot()).workspaces.find((entry: any) => entry.worktree && !entry.worktree.is_linked_worktree).workspace_id;
    const post = (route: string, agent: unknown, branch = "demo-launch") => demo.fetch(`/api/${route}/create`, { method: "POST", body: JSON.stringify({ workspace_id: workspace, branch, cwd: "/home/demo/launch", agent }) });
    for (const route of ["workspace", "tab", "worktree"]) {
      const before = await snapshot();
      for (const agent of [
        { kind: "codex", launcher: "unknown" }, { kind: "pi", launcher: "codex-compound" },
        { kind: "codex", profile: "review", launcher: "codex-compound" },
        { kind: "codex", launcher: "codex-compound", args: [] },
        { kind: "codex", profile: "review", args: ["resume"] },
        { kind: "pi", profile: "review" }, { kind: "codex", launcher: "/bin/sh" },
      ]) expect((await post(route, agent)).status).toBe(400);
      expect((await snapshot()).workspaces).toEqual(before.workspaces);
      expect((await snapshot()).tabs).toEqual(before.tabs);
      expect((await snapshot()).panes).toEqual(before.panes);
      for (const [index, agent] of [null, { kind: "codex" }, { kind: "codex", args: ["--profile", "compound-engineering"] }, { kind: "codex", launcher: codexLauncher }, { kind: "pi", launcher: piLauncher }, { kind: "claude", launcher: claudeLauncher }].entries()) {
        const response = await post(route, agent, `demo-launch-${route}-${index}`);
        expect(response.status).toBe(200);
        expect((await response.json()).agent_started).toBe(agent !== null ? true : route === "worktree" ? undefined : false);
      }
    }
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
  }
});

it("saves distinct demo launchers without randomUUID on an HTTP preview", async () => {
  const saved = new Map(["window", "location", "PushManager", "crypto"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    const storage = new Map<string, string>();
    (globalThis as any).location = new URL("http://demo.test/");
    (globalThis as any).window = { fetch, WebSocket, EventSource: class {}, localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } };
    const transport = "../site/demo/transport.ts?saved-launcher-http";
    await import(transport);
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: {} });
    const demo = (globalThis as any).window;
    const entries: any[] = [];
    for (let index = 0; index < 2; index++) {
      const response = await demo.fetch("/api/agents/launchers", { method: "POST", body: JSON.stringify({ kind: "codex", label: "Research", executable: "/home/demo/bin/research", args: ["", "two words"] }) });
      expect(response.status).toBe(200);
      entries.push((await response.json()).launchers.at(-1));
    }
    expect(entries[0].id).toStartWith("saved:");
    expect(entries[1].id).not.toBe(entries[0].id);
    const catalog = await (await demo.fetch("/api/agents")).text();
    expect(catalog).not.toContain("/home/demo/bin/research");
    const edited = await demo.fetch(`/api/agents/launchers?id=${encodeURIComponent(entries[0].id)}`, { method: "PUT", body: JSON.stringify({ kind: "codex", label: "Edited", executable: "research", args: [] }) });
    expect(edited.status).toBe(200);
    expect((await edited.json()).launchers[0].id).toBe(entries[0].id);
    expect((await demo.fetch(`/api/agents/launchers?id=${encodeURIComponent(entries[0].id)}`, { method: "DELETE" })).status).toBe(200);
    expect((await (await demo.fetch("/api/agents/launchers")).json()).launchers).toEqual([entries[1]]);
  } finally {
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
