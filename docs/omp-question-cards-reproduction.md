# OMP question card replay

The fixture serves a fictional OMP screen through the real Herdr Web UI prompt and answer routes. A temporary Unix socket supplies fake Herdr RPC responses, and a temporary OMP session file supplies two fictional chat messages. The pending pane is `idle`, matching OMP while it waits for an answer. No agent process or model is started.

Both red and green runs use the production-built frontend served by the real app server. The fixture replays a sanitized screen based on OMP 18.10.4; it is not a native OMP process run. Its synchronous fake RPC verifies parser output, rendered cards, and answer routing, but does not verify native editor activation timing. The screenshots come from `agent-browser` on this isolated fixture, never from a live pane.

## Red and green screenshots

From the repository root, install dependencies and create an untouched baseline worktree. Build each checkout before starting its fixture:

```sh
bun install --frozen-lockfile
git worktree add --detach /tmp/herdr-omp-before 6e575a89d2aa1fc054959cc44fa9df46a13455eb
ln -s "$PWD/node_modules" /tmp/herdr-omp-before/node_modules
(cd /tmp/herdr-omp-before && bun run build)
bun run build
```

Start the baseline fixture in one terminal, then the current branch fixture in another (stop each with Ctrl+C):

```sh
bun scripts/omp-question-browser-fixture.ts --root /tmp/herdr-omp-before --built
bun scripts/omp-question-browser-fixture.ts --built
```

Open each printed URL with `view=chat` in separate desktop and phone browser sessions. Set each viewport before loading the app; wait for finite animations to settle and confirm the fictional transcript is present. Before each green capture, assert one visible `.prompt-card`, two `.prompt-card-option` choices with their descriptions, and no overflow or crash. Before each red capture, assert no `.prompt-card`, two transcript turns, and no overflow or crash. On phone, also assert that `.sidebar` has `right <= 1` and computed visibility `hidden`.

```sh
# Start a fresh browser session for each viewport. Set the viewport before loading the app.
agent-browser --session omp-green-desktop set viewport 1440 900
agent-browser --session omp-green-desktop open 'FIXTURE_URL/?pane=omp-question-fixture-pane&view=chat'
agent-browser --session omp-green-desktop wait 2000
agent-browser --session omp-green-desktop eval '(()=>{const c=document.querySelectorAll(".prompt-card"),o=[...document.querySelectorAll(".prompt-card-option")],r=c[0]?.getBoundingClientRect(),t=o.map(x=>x.innerText);if(c.length!==1||!r||r.width<=0||r.height<=0||r.bottom<=0||r.top>=innerHeight||o.length!==2||!t[0].includes("ARM server")||!t[0].includes("fictional workshop")||!t[1].includes("x86 runner")||!t[1].includes("fictional Linux builds"))throw Error("expected one visible card with both named choices and descriptions");document.querySelectorAll(".machine-context-name,.machine-name").forEach(e=>e.textContent="fixture-pc")})()'
agent-browser --session omp-green-desktop screenshot docs/screenshots/omp-question-cards/green-desktop.png
agent-browser --session omp-green-phone set viewport 390 844
agent-browser --session omp-green-phone open 'FIXTURE_URL/?pane=omp-question-fixture-pane&view=chat'
agent-browser --session omp-green-phone wait 2000
agent-browser --session omp-green-phone eval '(()=>{const c=document.querySelectorAll(".prompt-card"),o=[...document.querySelectorAll(".prompt-card-option")],r=c[0]?.getBoundingClientRect(),t=o.map(x=>x.innerText);if(c.length!==1||!r||r.width<=0||r.height<=0||r.bottom<=0||r.top>=innerHeight||o.length!==2||!t[0].includes("ARM server")||!t[0].includes("fictional workshop")||!t[1].includes("x86 runner")||!t[1].includes("fictional Linux builds"))throw Error("expected one visible card with both named choices and descriptions");document.querySelectorAll(".machine-context-name,.machine-name").forEach(e=>e.textContent="fixture-pc")})()'
agent-browser --session omp-green-phone screenshot docs/screenshots/omp-question-cards/green-mobile.png
```

Repeat at both viewports with the red fixture URL and assert `document.querySelectorAll(".prompt-card").length === 0`, saving to `red-desktop.png` and `red-mobile.png`. The screenshots replace the fixture's machine label with `fixture-pc` before capture.

## Custom answer dogfood

After saving both green screenshots, use the card's **Or type your own answer** field, enter fictional text, and click **Send**. The fixture models OMP's custom row as an input state: Enter on **Other** activates it, text is accepted only in that state, and the following Enter submits it. The server log shows the two Down keys, Enter, a generic accepted-answer marker, final Enter, and `outcome=ok`; it does not log the answer text.

## What this verifies

The production frontend renders the parser's card state and sends a custom answer through the real `/api/pane/prompt/answer` route. The fake Herdr peer checks the key and text sequence without starting an agent or model. This is controlled RPC replay, not native OMP interaction timing.
