import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { buildDemoApp } from "./demo-build.ts";
import { chromePath } from "./chrome-path.ts";

const app = mkdtempSync(join(tmpdir(), "herdr-worktree-selection-"));
try {
  await buildDemoApp(app);
  writeFileSync(join(app, "delayed-roster.js"), `(() => {
    let hold = false;
    const waiting = [], sources = new Set(), originalFetch = window.fetch.bind(window), OriginalSource = window.EventSource;
    window.releaseWorktreeRoster = () => { hold = false; for (const resume of waiting.splice(0)) resume(); for (const source of sources) source.flush(); };
    window.fetch = async (input, init) => {
      const path = new URL(typeof input === "string" ? input : input.url, location.href).pathname;
      if (hold && path === "/api/machines") await new Promise(resolve => waiting.push(resolve));
      if (path === "/api/worktree/create" && init?.method === "POST") {
        hold = true;
        const response = await originalFetch(input, init);
        window.worktreeCreated = await response.clone().json();
        return response;
      }
      return originalFetch(input, init);
    };
    window.EventSource = class extends EventTarget {
      constructor(url, options) {
        super(); this.inner = new OriginalSource(url, options); this.readyState = 1; sources.add(this);
        this.inner.onmessage = event => { if (hold) this.pending = event; else this.onmessage?.(event); };
        this.inner.onopen = event => this.onopen?.(event);
        this.inner.onerror = event => this.onerror?.(event);
      }
      flush() { if (this.pending) { this.onmessage?.(this.pending); this.pending = null; } }
      close() { sources.delete(this); this.inner.close(); this.readyState = 2; }
    };
  })();`);
  const index = join(app, "index.html");
  writeFileSync(index, readFileSync(index, "utf8").replace(/<script type="module"/, '<script src="./demo-transport.js"></script><script src="./delayed-roster.js"></script><script type="module"'));
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const path = new URL(request.url).pathname.slice(1) || "index.html";
    if (path.split("/").includes("..")) return new Response(null, { status: 400 });
    const file = Bun.file(join(app, path));
    return await file.exists() ? new Response(file) : new Response(null, { status: 404 });
  } });
  try {
    const browser = await chromium.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`http://127.0.0.1:${server.port}/?view=chat`);
      await page.locator(".conn-live").waitFor({ state: "attached" });
      const source = await page.evaluate(async () => {
        const { snapshot } = await (await fetch("/api/session")).json();
        return snapshot.workspaces.find((workspace: { worktree?: { is_linked_worktree?: boolean } }) => workspace.worktree && !workspace.worktree.is_linked_worktree).workspace_id;
      });
      await page.locator(`.workspace-group[data-workspace="${source}"] .workspace-header`).dispatchEvent("contextmenu", { button: 2 });
      await page.getByRole("menuitem", { name: "New worktree", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: /^New worktree/ });
      await dialog.getByLabel(/^Branch/).fill("feat/roster-delay");
      await dialog.locator(".agent-picker-trigger").click();
      await page.locator(".agent-picker-menu").getByText("Oh My Pi", { exact: true }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      await dialog.getByRole("button", { name: "Create worktree", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      await page.waitForFunction(() => new URLSearchParams(location.search).get("pane") === (window as any).worktreeCreated?.pane_id, undefined, { timeout: 3000 });
      const created = await page.evaluate(() => (window as any).worktreeCreated);
      assert.equal(new URL(page.url()).searchParams.get("pane"), created.pane_id);
      await page.goBack();
      await page.waitForFunction((id) => new URLSearchParams(location.search).get("pane") !== id, created.pane_id);
      await page.goForward();
      await page.waitForFunction((id) => new URLSearchParams(location.search).get("pane") === id, created.pane_id);
      await page.evaluate(() => (window as any).releaseWorktreeRoster());
      await page.waitForFunction((id) => new URLSearchParams(location.search).get("ws")?.startsWith(id), created.workspace_id, { timeout: 3000 });
      assert.equal(new URL(page.url()).searchParams.get("pane"), created.pane_id);
      assert.equal(await page.locator(".worktree-error").count(), 0);
      console.log("PASS a phone worktree selection survives sheet cleanup and Back/Forward before its roster arrives");
    } finally { await browser.close(); }
  } finally { server.stop(); }
} finally { rmSync(app, { recursive: true, force: true }); }
