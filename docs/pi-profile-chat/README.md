# Pi sessions in a custom agent directory

Native Pi 1.2.0, Herdr 0.9.5, the official integration v9, the full web app and agent-browser CLI. The app and Pi have separate temporary homes, as they do when a launcher overrides PI_CODING_AGENT_DIR. The native integration reports both session paths itself; the test never fabricates that binding.

Clean upstream main aa624cb returns source scrollback and shows Conversation unavailable for both a fresh custom-profile session and a resumed one. The fixed server returns an unwritten pi-transcript with the greeting for the fresh session, and exactly two fictional turns for the resumed one. No new prompt or model call is made. Desktop and 390px phone captures use the real app; phone screenshots wait for the drawer to close and confirm no horizontal overflow.

The green snapshot's server/pi.ts SHA-256 is `ae59a1f81e357833a5dfd71df5afb373ab855721f71dfc5be40841219d3d61fb`. This binds the browser result to the frozen source, rather than an uncommitted checkout's base revision. The browser assets came from clean aa624cb; this fix changes only server resolution.

## Reproduce manually

In a new Herdr tab:

```sh
herdr integration install pi
mkdir -p /tmp/pi-profile-chat/extensions
cp "$HOME/.pi/agent/extensions/herdr-agent-state.ts" /tmp/pi-profile-chat/extensions/
PI_CODING_AGENT_DIR=/tmp/pi-profile-chat pi
```

Open that pane in Chat before sending a message. Its native integration reports an unwritten session path, but upstream only checks the web bridge's default store. A saved session resumed from the same custom directory has the same failure. This also reproduces locally, so SSH is not required.

## Replay without a model call

Download reproduce.ts beside this file. From the fixed web UI checkout, create and build a clean base checkout, then install the exact Pi release:

```sh
git worktree add /tmp/herdr-pi-base aa624cb56f550f9a7dd8bf4d59ed99ffc3921741
(cd /tmp/herdr-pi-base && bun install --frozen-lockfile && bun run build)
npm install --prefix /tmp/pi-profile-release @earendil-works/pi-coding-agent@1.2.0
PI_QA_BASE_ROOT=/tmp/herdr-pi-base PI_QA_FIXED_ROOT="$PWD" PI_QA_BIN=/tmp/pi-profile-release/node_modules/.bin/pi AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome bun run check run --build bun /absolute/path/to/reproduce.ts
```

The replay copies the installed official integration from ~/.pi/agent/extensions/herdr-agent-state.ts; PI_QA_EXTENSION can select another v9 copy. Substitute your Chrome path. All panes, browser profiles, sessions and transcript fixtures belong to a disposable named test Herdr. The provider throws if anything tries to invoke a model.

The fix discovers custom directories from the pane's Pi process on Linux. Where process identity/environment cannot be read, it retains default-store behavior and refuses unproven custom stores. It does not repair Herdr's separate reload/lifecycle binding problem (#1441), and it does not change fresh terminal-launched Codex support (#1191).
