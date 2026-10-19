import { afterEach, beforeEach, expect, it, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { SavedLauncherStore, handleSavedLaunchersRequest } from "../../server/saved-launchers.ts";
import { SettingsProvider } from "../lib/settings.ts";
import { AgentLaunchPicker } from "./AgentLaunchPicker.tsx";

let renderer: ReactTestRenderer;
let dir: string;
let store: SavedLauncherStore;
let restoreFetch: () => void;
const saved = new Map<string, PropertyDescriptor | undefined>();
class Input { focus() {} }
beforeEach(() => {
  for (const key of ["window", "document", "navigator", "HTMLInputElement", "IS_REACT_ACT_ENVIRONMENT"]) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  const globals: Record<string, unknown> = {
    IS_REACT_ACT_ENVIRONMENT: true, HTMLInputElement: Input,
    navigator: { languages: ["en-US"] },
    window: { localStorage: { getItem: () => null }, addEventListener() {}, removeEventListener() {} },
    document: { documentElement: { dataset: {}, style: { setProperty() {}, removeProperty() {} } }, querySelector: () => null },
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
