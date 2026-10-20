# Saved launcher walkthrough

These recordings show the merged launcher editor from fork source `1e670c3d52ad08a1686564ab1ac86b36156f604e`.

- [Desktop MP4](launcher-editor-desktop.mp4): 1280 × 900 desktop Chromium.
- [Phone MP4](launcher-editor-phone.mp4): 390 × 844 Chromium with mobile and touch emulation.

`launcher-editor-preview.gif` is a 15-second desktop excerpt (960 × 675), suitable for an inline PR preview.

Both full clips follow the same flow:

1. Choose the native `review` Profile with Launcher set to Default.
2. Open Launcher → Add launcher… and name it Code review.
3. Type `codex` in Executable, then choose `codex-compound` from autocomplete.
4. Add the single argument `--review`, then save.
5. Open Launcher → Edit launcher…, inspect Delete confirmation, and cancel deletion.
6. Start a fictional workspace and choose the saved launcher in New tab.

The selector lists saved launchers. Executable search is inside Add/Edit. Saving a launcher does not install or run the executable. Profiles remain a separate native option when using Default.

## Provenance and limits

The actual React client was built from the source above into a disposable demo build. Its transport is the repository's `site/demo/transport.ts`, with fictional data from `site/demo/fixtures`. No live Herdr socket, user session, real launcher store, filesystem executable search, server-side persistence, model call, or user content was used. The profile names and executable suggestions are demo fixtures. Workspace and tab creation are simulated in the demo.

This is a visual walkthrough, not a test suite. The phone clip is browser touch emulation, not a physical device. There is no audio. H.264 MP4 uses yuv420p and faststart for embedding. The recording harness did not modify application source.

The videos can illustrate the upstream proposal; they do not establish backend compatibility or execution correctness. `media-manifest.json` records codec, dimensions, duration, sizes and SHA-256 hashes. Frame extracts were inspected for UI legibility and fictional content.

All owned recording browsers and the loopback ephemeral demo server were closed after capture. The short temporary parent directory was removed. The initial unsuccessful touch capture remains private and is not part of the showcase media.
