# Older OMP compatibility checks

These checks ran against integration commit `5aa897f253881603ef0e920b9cf20171c531a90d`. No parser changes were made during this follow-up.

The OMP-focused tests passed again: 66 tests, zero failures and 317 assertions. The original upstream prompt tests are unchanged, including the legacy `Enter`/`Esc` and `Space/Enter toggle` examples and the legacy multi-select key sequence.

## Checks against released OMP code

Using separately installed npm releases of `@oh-my-pi/pi-coding-agent` 17.2.12 and 18.0.0, a temporary probe loaded each release's own `AskDialogComponent`, rendered it at 120 columns, parsed its actual rendered output, and fed the generated answer keys back into that same component's native handler. Each release correctly returned `Second` for the non-default single choice and `First, Second` for multi-select. Labels and descriptions matched the supplied fictional questions.

This is a test of the released rendering and key handler, not a full terminal/browser/provider test. It used isolated HOME/XDG directories and no model or API key.

The legacy 17.2.12 footer uses `Space/Enter toggle`, so the generated answer toggles with Space and confirms through Tab then Enter. Release 18.0.0 uses `Space toggle · Enter submit`, so the generated answer toggles with Space then confirms with Enter. This decision comes from the visible controls, without a version-number switch.

## Full native 18.0.0 browser run

The unmodified compatibility harness ran through `bun run check run --build bun scripts/omp-question-compat.ts` with OMP 18.0.0, Herdr 0.9.5 and agent-browser 0.33.2. Its desktop single choice, multi-select and custom answer steps passed. The complete run did **not** pass: after narrowing the native terminal to 57 columns, OMP clipped the footer to:

```text
Enter select · n note · ↑/↓ move · Tab/←/→ · Esc can…
```

The card was not recognized. The complete menu was visible; this failure is a clipped-control-hint limitation, not an off-screen-option limitation.

The exact same captured screen was parsed with upstream-before commit `85c21cdaacad183ea6ed6f41e64417492444e6f3` and fixed parser commit `756b7c8836b1e571f27fdd9d6449ffb7f7d4b200`. Both returned null. This establishes that this specific narrow-layout failure is pre-existing, not introduced by #1184. It does not establish compatibility with every version or layout.

The full native 18.10.4 and 18.11.1 hosted runs remain passing, as recorded in [the main native verification guide](native-omp-question-compatibility.md). The CI matrix currently checks 18.10.4 and the latest stable release, not all historical releases.

## What the parser assumes

The fix accepts legacy and current keyboard labels, multiple marker glyphs, wrapped text, and variable terminal widths. It does not match version numbers or the fictional question wording used by the tests. Tests compare labels and answers because those must retain their meaning; they do not require an entire terminal screenshot to remain unchanged.

It still depends on OMP's displayed control text, a selected option marker, marker-column alignment, recognizable question tabs and complete visible choices. Unknown layouts are rejected rather than answered with guessed keys. Weekly/manual drift detection catches changes in the versions it runs, but cannot guarantee future compatibility or cover every theme, viewport and older release.

No application code changed, and no additional upstream issue or PR was opened for the pre-existing 18.0.0 narrow-footer limitation during this verification.
