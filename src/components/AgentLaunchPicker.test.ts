import { afterEach, beforeEach, expect, it, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { SavedLauncherStore, handleSavedLaunchersRequest } from "../../server/saved-launchers.ts";
import { MachineContext } from "../lib/machineContext.tsx";
import { SettingsProvider } from "../lib/settings.ts";
import { AgentLaunchPicker } from "./AgentLaunchPicker.tsx";

let renderer: ReactTestRenderer;
let dir: string;
let store: SavedLauncherStore;
let restoreFetch: () => void;
const saved = new Map<string, PropertyDescriptor | undefined>();
class Input { focus() {} getBoundingClientRect() { return { top: 100, bottom: 140, left: 100, width: 400 }; } }
beforeEach(() => {
  for (const key of ["window", "document", "navigator", "HTMLInputElement", "IS_REACT_ACT_ENVIRONMENT"]) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  const globals: Record<string, unknown> = {
    IS_REACT_ACT_ENVIRONMENT: true, HTMLInputElement: Input,
    navigator: { languages: ["en-US"] },
    window: { innerHeight: 900, requestAnimationFrame: (callback: FrameRequestCallback) => { queueMicrotask(() => callback(0)); return 1; }, cancelAnimationFrame() {}, localStorage: { getItem: () => null }, addEventListener() {}, removeEventListener() {} },
    document: { addEventListener() {}, removeEventListener() {}, documentElement: { dataset: {}, style: { setProperty() {}, removeProperty() {} } }, querySelector: () => null },
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  dir = mkdtempSync(join(tmpdir(), "launcher-editor-")); store = new SavedLauncherStore(dir);
  const send = async (url: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(url), "http://fixture"), init);
    return handleSavedLaunchersRequest(request, new URL(request.url), store);
  };
  const network = spyOn(globalThis, "fetch").mockImplementation(Object.assign(send, { preconnect: globalThis.fetch.preconnect }));
  restoreFetch = () => network.mockRestore();
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  restoreFetch();
  for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  renderer = undefined as unknown as ReactTestRenderer;
  saved.clear(); rmSync(dir, { recursive: true, force: true });
});
async function editor(launchers: { id: string; label: string; saved?: boolean }[] = []) {
  await act(async () => {
    renderer = create(createElement(SettingsProvider, null, createElement(AgentLaunchPicker, {
      agent: { kind: "codex", label: "Codex", saved_launchers: true, launchers }, profile: "", launcher: "", disabled: false,
      onProfileChange() {}, onLauncherChange() {}, onLaunchersChange() {}, onEditingChange() {},
    })), { createNodeMock: () => new Input() });
  });
  await act(async () => renderer.root.findAllByType("button").find((node) => node.children.join("") === "Add launcher")!.props.onClick());
  const change = async (suffix: string, value: string) => act(async () => renderer.root.findAllByType("input").find((node) => node.props.id.endsWith(suffix))!.props.onChange({ target: { value } }));
  await change("-name", "Research"); await change("-executable", process.execPath);
  return change;
}
for (const native of [{ isComposing: true, keyCode: 13 }, { isComposing: false, keyCode: 229 }]) {
  it.skipIf(process.platform !== "linux" && process.platform !== "darwin")(`keeps IME confirmation for committed input before saving (${JSON.stringify(native)})`, async () => {
    const change = await editor();
    let prevented = false, stopped = false;
    await act(async () => renderer.root.findByType("fieldset").props.onKeyDown({ key: "Enter", target: new Input(), nativeEvent: native, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } }));
    expect(store.get()).toEqual([]);
    expect(stopped).toBeTrue();
    expect(prevented).toBeFalse();
    // WebKit can deliver its final input after compositionend and the committing Enter.
    await change("-name", "研究 committed");
    await act(async () => renderer.root.findByType("fieldset").props.onKeyDown({ key: "Enter", target: new Input(), nativeEvent: { isComposing: false, keyCode: 13 }, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } }));
    expect(store.get().map((entry) => entry.label)).toEqual(["研究 committed"]);
    expect(prevented).toBeTrue();
    expect(stopped).toBeTrue();
  });
}

it("names the launcher editor's own fields and only disambiguates colliding saved labels", async () => {
  await editor([
    { id: "codex-research", label: "Research" },
    { id: "saved:00000000-0000-4000-8000-000000000001", label: "Research", saved: true },
    { id: "saved:00000000-0000-4000-8000-000000000002", label: "Research", saved: true },
    { id: "saved:00000000-0000-4000-8000-000000000003", label: "Unique", saved: true },
  ]);
  expect(renderer.root.findAllByType("label").some((node) => node.children.join("") === "Launcher name")).toBeTrue();
  expect(renderer.root.findAllByType("button").some((node) => node.children.join("") === "Cancel launcher")).toBeTrue();
  const options = renderer.root.findAllByType("option").map((node) => ({ value: node.props.value, label: node.children.join("") }));
  expect(options.find((option) => option.value === "codex-research")!.label).toBe("Research");
  expect(options.find((option) => option.value.endsWith("00000001"))!.label).toBe("Research · 00000001");
  expect(options.find((option) => option.value.endsWith("00000002"))!.label).toBe("Research · 00000002");
  expect(options.find((option) => option.value.endsWith("00000003"))!.label).toBe("Unique");
});

it("offers a searchable picker and opens an unsaved executable in the explicit editor", async () => {
  let editing = false;
  await act(async () => {
    renderer = create(createElement(SettingsProvider, null, createElement(AgentLaunchPicker, {
      agent: { kind: "codex", label: "Codex", installed: false, saved_launchers: true, launcher_search: true }, profile: "", launcher: "", disabled: false,
      onProfileChange() {}, onLauncherChange() {}, onLaunchersChange() {}, onEditingChange(value: boolean) { editing = value; },
    })), { createNodeMock: () => new Input() });
  });
  const combo = renderer.root.findByProps({ role: "combobox" });
  await act(async () => combo.props.onChange({ target: { value: process.execPath } }));
  expect(editing).toBeTrue();
  const use = renderer.root.findAllByProps({ role: "option" }).find((node) => node.children.join("").includes(process.execPath))!;
  await act(async () => use.props.onClick());
  expect(store.get()).toEqual([]);
  expect(renderer.root.findAllByType("input").find((node) => node.props.id.endsWith("-executable"))!.props.value).toBe(process.execPath);
});

async function searchable(machine = "local", onEditingChange = (_value: boolean) => {}, launchers: { id: string; label: string; saved?: boolean }[] = []) {
  const view = createElement(SettingsProvider, null, createElement(MachineContext.Provider, { value: machine }, createElement(AgentLaunchPicker, {
    agent: { kind: "codex", label: "Codex", installed: true, saved_launchers: true, launcher_search: true, launchers }, profile: "", launcher: "", disabled: false,
    onProfileChange() {}, onLauncherChange() {}, onLaunchersChange() {}, onEditingChange,
  })));
  await act(async () => { if (renderer) renderer.update(view); else renderer = create(view, { createNodeMock: () => new Input() }); });
  return renderer.root.findByProps({ role: "combobox" });
}
it("ignores older queries and PC results, cancels on close, and retains the older bridge select", async () => {
  restoreFetch();
  const pending: { query: string; url: string; signal: AbortSignal; resolve: (value: Response) => void }[] = [];
  let entered: (() => void) | undefined;
  const fetcher = spyOn(globalThis, "fetch").mockImplementation(Object.assign((url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
    pending.push({ query: new URL(String(url), "http://fixture").searchParams.get("q")!, url: String(url), signal: init!.signal!, resolve }); entered?.();
  }), { preconnect: globalThis.fetch.preconnect }));
  restoreFetch = () => fetcher.mockRestore();
  const type = async (text: string) => {
    const started = new Promise<void>((resolve) => { entered = resolve; });
    await act(async () => renderer.root.findByProps({ role: "combobox" }).props.onChange({ target: { value: text } }));
    await started;
  };
  await searchable("local", undefined, [{ id: "saved:00000000-0000-4000-8000-000000000001", label: "new-command", saved: true }]);
  await act(async () => {
    const input = renderer.root.findByProps({ role: "combobox" });
    input.props.onChange({ target: { value: "o" } }); input.props.onChange({ target: { value: "ol" } });
  });
  await type("old"); await type("new");
  expect(pending.map((entry) => entry.query)).toEqual(["old", "new"]);
  expect(pending[0]!.signal.aborted).toBeTrue();
  await act(async () => { pending[1]!.resolve(Response.json({ names: ["new-command"] })); });
  await act(async () => { pending[0]!.resolve(Response.json({ names: ["old-command"] })); });
  expect(renderer.root.findAllByProps({ role: "option" }).some((node) => node.children.includes("new-command"))).toBeTrue();
  expect(renderer.root.findAllByProps({ role: "option" }).some((node) => node.children.includes("old-command"))).toBeFalse();
  expect(renderer.root.findByProps({ role: "group", "aria-label": "Saved launchers" }).findAllByProps({ role: "option" }).map((node) => node.children.join(""))).toEqual(["new-command"]);
  expect(renderer.root.findByProps({ role: "group", "aria-label": "Executables · opens editor" }).findAllByProps({ role: "option" }).map((node) => node.children.join(""))).toEqual(["new-command"]);
  const switched = new Promise<void>((resolve) => { entered = resolve; });
  await searchable("remote-pc"); await switched;
  expect(pending[2]!.url).toContain("/api/machines/remote-pc/");
  let prevented = false, stopped = false;
  await act(async () => renderer.root.findByProps({ role: "combobox" }).props.onKeyDown({ key: "Escape", nativeEvent: {}, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } }));
  expect(prevented && stopped).toBeTrue(); expect(pending[2]!.signal.aborted).toBeTrue();
  await act(async () => pending[2]!.resolve(Response.json({ names: ["foreign-command"] })));
  expect(renderer.root.findAllByProps({ role: "option" })).toHaveLength(0);
  expect(renderer.root.findByProps({ role: "combobox" }).props.value).toBe("Default");
  let secondPrevented = false, secondStopped = false;
  await act(async () => renderer.root.findByProps({ role: "combobox" }).props.onKeyDown({ key: "Escape", nativeEvent: {}, preventDefault() { secondPrevented = true; }, stopPropagation() { secondStopped = true; } }));
  expect(secondPrevented || secondStopped).toBeFalse();
  await type("none");
  expect(renderer.root.findByProps({ role: "status" }).children.join("")).toBe("Searching executables…");
  await act(async () => pending[3]!.resolve(Response.json({ names: [] })));
  expect(renderer.root.findByProps({ role: "status" }).children.join("")).toContain("No matching executables");
  await type("error");
  await act(async () => pending[4]!.resolve(Response.json({ error: { code: "fixture", message: "fixture" } }, { status: 500 })));
  expect(renderer.root.findByProps({ role: "status" }).children.join("")).toContain("Could not search this PC");
  expect(renderer.root.findByProps({ role: "combobox" }).props.value).toBe("error");
  await type("closing");
  await act(async () => renderer.unmount());
  expect(pending[5]!.signal.aborted).toBeTrue();
  await act(async () => pending[5]!.resolve(Response.json({ names: ["after-unmount"] })));
  const before = pending.length;
  await editor([{ id: "codex-legacy", label: "Legacy" }]);
  expect(renderer.root.findAllByProps({ role: "combobox" })).toHaveLength(0);
  expect(renderer.root.findAllByType("option").some((node) => node.props.value === "codex-legacy")).toBeTrue();
  expect(pending).toHaveLength(before);
});
it("consumes arrows and Enter without form submission and preserves both IME confirmation forms", async () => {
  await searchable();
  const combo = () => renderer.root.findByProps({ role: "combobox" });
  await act(async () => combo().props.onChange({ target: { value: "/custom/research" } }));
  const key = async (name: string, nativeEvent: object = {}) => {
    let prevented = false, stopped = false;
    await act(async () => combo().props.onKeyDown({ key: name, nativeEvent, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } }));
    return { prevented, stopped };
  };
  for (const native of [{ isComposing: true }, { keyCode: 229 }]) {
    expect(await key("Enter", native)).toEqual({ prevented: false, stopped: true });
    expect(renderer.root.findAllByType("fieldset")).toHaveLength(0);
  }
  expect((await key("ArrowDown")).prevented).toBeTrue();
  expect((await key("ArrowUp")).prevented).toBeTrue();
  expect(await key("Enter")).toEqual({ prevented: true, stopped: true });
  expect(renderer.root.findAllByType("fieldset")).toHaveLength(1);
  expect(store.get()).toEqual([]);
});

it("preserves a native profile when reselecting Default and activates the existing launcher on open", async () => {
  const changes: string[] = [];
  const render = async (launcher: string, profile: string) => {
    const view = createElement(SettingsProvider, null, createElement(AgentLaunchPicker, {
      agent: { kind: "codex", label: "Codex", saved_launchers: true, launcher_search: true, profiles: [{ id: "research", label: "research" }], launchers: [{ id: "saved:current", label: "Current", saved: true }] }, profile, launcher, disabled: false,
      onProfileChange() {}, onLauncherChange(value: string) { changes.push(value); }, onLaunchersChange() {}, onEditingChange() {},
    }));
    await act(async () => { if (renderer) renderer.update(view); else renderer = create(view, { createNodeMock: () => new Input() }); });
  };
  await render("", "research");
  await act(async () => renderer.root.findByProps({ role: "combobox" }).props.onFocus({ target: { select() {} } }));
  await act(async () => renderer.root.findAllByProps({ role: "option" }).find((node) => node.children.includes("Default"))!.props.onClick());
  expect(changes).toEqual([]);
  expect(renderer.root.findAllByType("select").find((node) => node.props.id.endsWith("-profile"))!.props.value).toBe("research");
  await render("saved:current", "");
  await act(async () => renderer.root.findByProps({ role: "combobox" }).props.onFocus({ target: { select() {} } }));
  const combo = renderer.root.findByProps({ role: "combobox" });
  const selected = renderer.root.findAllByProps({ role: "option" }).find((node) => node.props["aria-selected"])!;
  expect(combo.props["aria-activedescendant"]).toBe(selected.props.id);
  await act(async () => renderer.root.findAllByProps({ role: "option" }).find((node) => node.children.includes("Default"))!.props.onClick());
  expect(changes).toEqual([""]);
});

it("keeps the highlighted typed executable when delayed suggestions insert before it", async () => {
  restoreFetch();
  let answer!: (response: Response) => void, entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const network = spyOn(globalThis, "fetch").mockImplementation(Object.assign(() => new Promise<Response>((resolve) => { answer = resolve; entered(); }), { preconnect: globalThis.fetch.preconnect }));
  restoreFetch = () => network.mockRestore();
  await searchable();
  const combo = () => renderer.root.findByProps({ role: "combobox" });
  await act(async () => combo().props.onChange({ target: { value: "cod" } }));
  await started;
  const key = async (key: string) => act(async () => combo().props.onKeyDown({ key, nativeEvent: {}, preventDefault() {}, stopPropagation() {} }));
  await key("ArrowDown");
  expect(renderer.root.findByProps({ id: combo().props["aria-activedescendant"] }).children.join("")).toBe("Use executable: cod");
  await act(async () => answer(Response.json({ names: ["codex", "codex-helper"] })));
  expect(renderer.root.findByProps({ id: combo().props["aria-activedescendant"] }).children.join("")).toBe("Use executable: cod");
  await key("Enter");
  expect(renderer.root.findAllByType("input").find((node) => node.props.id.endsWith("-executable"))!.props.value).toBe("cod");
  expect(store.get()).toEqual([]);
});

it("places and updates the popup within emulated visual viewport geometry and cleans listeners", async () => {
  const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 500 });
  Object.assign(window, { innerHeight: 800, visualViewport: viewport });
  const rect = spyOn(Input.prototype, "getBoundingClientRect").mockReturnValue({ top: 350, bottom: 394, left: 100, width: 400 });
  const add = spyOn(viewport, "addEventListener"), remove = spyOn(viewport, "removeEventListener");
  try {
    await searchable();
    const combo = () => renderer.root.findByProps({ role: "combobox" });
    await act(async () => combo().props.onFocus({ target: { select() {} } }));
    const popup = () => renderer.root.findByProps({ className: "launcher-popup" });
    expect(popup().props.style.bottom).toBe(454);
    expect(popup().props.style.top).toBeUndefined();
    expect(popup().props.style.maxHeight).toBe(280);
    await act(async () => { viewport.offsetTop = 200; viewport.height = 300; viewport.dispatchEvent(new Event("scroll")); });
    expect(popup().props.style.maxHeight).toBe(134);
    await act(async () => { viewport.offsetTop = 40; viewport.height = 600; viewport.dispatchEvent(new Event("resize")); });
    expect(popup().props.style.top).toBe(398);
    expect(popup().props.style.bottom).toBeUndefined();
    expect(popup().props.style.maxHeight).toBe(230);
    expect(combo().props["aria-expanded"]).toBeTrue();
    const listeners = add.mock.calls.filter(([name]) => name === "resize" || name === "scroll");
    expect(listeners).toHaveLength(2);
    await act(async () => combo().props.onKeyDown({ key: "Escape", nativeEvent: {}, preventDefault() {}, stopPropagation() {} }));
    for (const [name, listener] of listeners) expect(remove.mock.calls.some((call) => call[0] === name && call[1] === listener)).toBeTrue();
    const calls = add.mock.calls.length;
    await act(async () => combo().props.onFocus({ target: { select() {} } }));
    expect(add.mock.calls.length).toBe(calls + 2);
    await act(async () => renderer.unmount());
    expect(remove.mock.calls.length).toBe(add.mock.calls.length);
  } finally { rect.mockRestore(); add.mockRestore(); remove.mockRestore(); }
});

it("keeps one initially empty search live region through opening, frame announcement and closing", async () => {
  const frames: FrameRequestCallback[] = [];
  Object.assign(window, { requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback), cancelAnimationFrame() {} });
  await searchable();
  const region = renderer.root.findByProps({ role: "status" });
  expect(region.children).toEqual([]);
  expect(region.props.className).toContain("visually-hidden");
  const combo = () => renderer.root.findByProps({ role: "combobox" });
  await act(async () => combo().props.onChange({ target: { value: "research" } }));
  expect(renderer.root.findByProps({ role: "status" })).toBe(region);
  expect(region.children).toEqual([]);
  await act(async () => { for (const frame of frames.splice(0)) frame(0); });
  expect(region.children.join("")).toBe("Searching executables…");
  await act(async () => combo().props.onKeyDown({ key: "Escape", nativeEvent: {}, preventDefault() {}, stopPropagation() {} }));
  expect(renderer.root.findByProps({ role: "status" })).toBe(region);
  expect(region.children).toEqual([]);
  expect(region.props.style?.display).not.toBe("none");
  await act(async () => combo().props.onChange({ target: { value: "again" } }));
  expect(renderer.root.findByProps({ role: "status" })).toBe(region);
  expect(region.children.join("")).toBe("Searching executables…");
});
