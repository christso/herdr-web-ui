# Clipped OMP cancel footer

Real OMP 18.0.0, Herdr 0.9.5 and agent-browser CLI in disposable test sessions. No user sessions, API keys or paid model calls were used. The provider returns one fictional question and checks the exact native structured answer.

At 43 native terminal columns, OMP shows `Enter select · n note · ↑/↓ move · Esc…`. Clean upstream main `aa624cb` returns no prompt. The fixed parser exposes exactly Local socket and Remote relay; selecting Remote relay returns exactly that selection.

The red run starts the native terminal narrow, then opens Chat. It confirms a null prompt API response and zero browser cards in three consecutive reads before each screenshot. This avoids retaining an earlier wide-layout card. Green checks the structured native result, not a substring in rendered text.

## Replay

Run from a Herdr Web UI checkout with Bun dependencies, Herdr, agent-browser and Chrome installed. Download `reproduce.ts` beside this README. Use an absolute evidence path.

```sh
npm install --prefix /tmp/omp-footer-release @oh-my-pi/pi-coding-agent@18.0.0
OMP_BIN=/tmp/omp-footer-release/node_modules/.bin/omp OMP_VERSION=18.0.0 OMP_COMPAT_RED_PROOF=1 OMP_COMPAT_OUT=/tmp/omp-footer-red AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome bun run check run --build bun /absolute/path/to/reproduce.ts
```

Run that against clean `aa624cb` for red. Then check out the fix and run the same command without `OMP_COMPAT_RED_PROOF=1`, changing `OMP_COMPAT_OUT` to `/tmp/omp-footer-green`. Substitute your Chrome executable where needed. `check run` isolates and cleans up Herdr automatically.

The report records the parser SHA because the green run used an uncommitted, frozen patch. Its SHA matches the independently reviewed runtime. All original tests were retained; fast checks passed with 3,827 tests, zero failures and eight skips.

The independent fix deliberately rejects wrapped option rows that the older parser cannot group safely. The separate parser PR #1184 groups those rows; a scratch composition check reconstructs the older 57-column wrapped capture correctly. This is behavioral proof, not a claim of a conflict-free git merge. The native runs here use Herdr 0.9.5, not the hosted pinned 0.9.3.
