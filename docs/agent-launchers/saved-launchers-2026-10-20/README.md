# Saved launcher walkthrough

Start an agent with a saved executable and individual arguments from desktop or phone.

- [Desktop MP4](launcher-only-desktop.mp4): 1280 × 900, 37.68 seconds.
- [Phone MP4](launcher-only-phone.mp4): 390 × 844, 35.64 seconds, Chromium touch emulation.
- [GIF preview](launcher-only-preview.gif): 15-second desktop excerpt.

Both videos show this flow:

1. Open Launcher → Add launcher… in New workspace.
2. Name it Code review and choose `codex` from executable suggestions.
3. Add `--profile` and `review` as separate arguments, then save.
4. Open Edit launcher…, inspect Delete confirmation, then cancel deletion.
5. Create a fictional workspace and choose Code review in New tab.

## Source and limits

Recorded from source `8203bdf57bd935a1fe4c0c6502a27be3f292d7d8`, using the actual React client and its fictional demo transport and fixtures.

Workspace creation, executable suggestions and persistence are simulated in the browser. The recordings contain no user session, live Herdr connection, real launcher store or model call. They demonstrate the interface; backend execution and persistence are not exercised. The phone recording uses browser emulation.

The MP4s use H.264/yuv420p with faststart and have no audio. [The manifest](media-manifest.json) records hashes, dimensions and duration. Representative frames are included for desktop editing, phone editing and Delete confirmation.
