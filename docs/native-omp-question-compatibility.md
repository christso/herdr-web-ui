# Native OMP question compatibility

The native check starts real OMP and invokes its built-in `ask` tool through a fake provider. Agent-browser answers through Herdr Web UI. The provider checks the exact answers returned by OMP. No API key, paid model call, user pane or private conversation is used.

Issue: https://github.com/devswha/herdr-web-ui/issues/1182
Parser fix: https://github.com/devswha/herdr-web-ui/pull/1184
Separate compatibility workflow: https://github.com/devswha/herdr-web-ui/pull/1187

## Captured failure and fix

At 47 native terminal columns, OMP clips its question-navigation hint to `quest…`. The earlier parser rejected this complete question menu, so chat had no question card. The fixed parser accepts valid clipped prefixes while retaining the required selection, note and navigation hints.

The phone screenshots in `screenshots/omp-native-compat/` come from real OMP 18.10.4 on hosted Ubuntu with Herdr 0.9.3. The red run used fork integration commit `2af58a9`; the green run used `5aa897f253881603ef0e920b9cf20171c531a90d`. This is a comparison of the integration builds, not a claim that only one file differed between those builds. The focused regression below isolates the parser change.

- Red hosted run: https://github.com/christso/herdr-web-ui/actions/runs/38811511892
- Green hosted run: https://github.com/christso/herdr-web-ui/actions/runs/38812837915
- Final parser PR head: `756b7c8836b1e571f27fdd9d6449ffb7f7d4b200`.
- Final compatibility PR head: `b2cf9fced0edffa6272b8f5ab2774e3606fba722`.
- Final integration parser SHA-256: `c9ef150211202de507bcabb9357e544651a829d07094321088ef864a6e10dfeb`.

The green workflow passed both OMP 18.10.4 and 18.11.1. Each lane checked a non-default choice, multiple selections, custom text, a wrapped question and final review submission. Reports and exact expected/actual answers are preserved under `native-omp-compat/`.

The terminal was sized through the browser's actual terminal attachment: initially 120 columns by 47 rows; the narrow case measured 47 columns by 83 rows. The narrow terminal attachment used 390×1400 pixels to keep the complete menu visible; the chat screenshot and answer used 390×844 pixels. Menus with options outside the visible native viewport remain unsupported and fail closed.

## Reproduce the focused parser failure

These commands keep the test fixed and replace only its parser. They run in a disposable checkout, not the application serving users.

```sh
git clone https://github.com/christso/herdr-web-ui.git herdr-omp-repro
cd herdr-omp-repro
git checkout 756b7c8836b1e571f27fdd9d6449ffb7f7d4b200
bun install --frozen-lockfile

git show b10e15a79b407ae54cd0eb3393f6484f9c4b5620:server/prompt.ts > server/prompt.ts
HERDR_TEST_MODE=unit bun test server/prompt.test.ts --test-name-pattern "recognizes OMP's question hint when the word itself is clipped"
# Expected: 1 fail. The complete native menu is rejected.

git restore --source=756b7c8836b1e571f27fdd9d6449ffb7f7d4b200 -- server/prompt.ts
HERDR_TEST_MODE=unit bun test server/prompt.test.ts --test-name-pattern "recognizes OMP's question hint when the word itself is clipped"
# Expected: 1 pass, 15 assertions.
```

Both results were verified with the same test source and only the parser changed. The broader OMP-focused selection passed 66 tests and 317 assertions. The parser branch's final fast checks passed 3,837 tests, with 8 skipped; the independent compatibility branch passed 3,825, with 8 skipped.

## Run the complete native scenario

Use a separate application checkout containing both PRs. The recorded integration commit is available on the fork. Linux needs Bun 1.4.2 or newer, Herdr 0.9.3 or newer, Node 24 or newer, and Chromium's system dependencies.

```sh
git clone --branch christso/main https://github.com/christso/herdr-web-ui.git herdr-omp-native
cd herdr-omp-native
git checkout 5aa897f253881603ef0e920b9cf20171c531a90d
bun install --frozen-lockfile
OMP_TOOLS_DIR="$(mktemp -d)"
npm install --prefix "$OMP_TOOLS_DIR" --no-save --no-audit --no-fund agent-browser@0.33.2 @oh-my-pi/pi-coding-agent@18.10.4
bun node_modules/playwright-core/cli.js install --with-deps chromium
export PATH="$OMP_TOOLS_DIR/node_modules/.bin:$PATH"
export OMP_BIN="$OMP_TOOLS_DIR/node_modules/.bin/omp"
export OMP_VERSION=18.10.4
export OMP_COMPAT_OUT="$OMP_TOOLS_DIR/evidence"
CHECK_WAIT_SECONDS=900 bun run check run --build bun scripts/omp-question-compat.ts
```

The wrapper supplies isolated test state and its own Herdr session. Do not edit or commit in that checkout while it runs: the wrapper verifies source identity. Repeat with an isolated install of 18.11.1 to check the other recorded version. The weekly/manual workflow installs these tools itself and preserves artifacts for 14 days; this orphan branch keeps selected fictional proof longer.

## Limits of the other checks

Independent review and the completed CodeRabbit full review found no outstanding parser findings. Existing upstream prompt tests are preserved. No code was adapted from Paperclip; this test uses OMP's own built-in question tool.

Earlier broad integration checks were not fully passing: 505 passed, 16 failed and one skipped. A focused rerun passed 280 of 283; the remaining three Grok, Agy and Hermes process-detection failures also reproduced on unchanged base. Not every original failure was established as a baseline failure. The full browser run failed at Safari IME; the baseline run stopped earlier at command-arrow/readline. Standalone Safari IME passed on both. Native Windows was not checked locally. Fork-native CI success does not replace upstream CI, which still needs maintainer approval.
