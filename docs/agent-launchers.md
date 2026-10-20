# Saved agent launchers

New workspace, New tab and New worktree offer saved launchers on the selected PC.
The launcher editor searches executable names on that PC as you type. No Herdr agent catalog
is needed. SSH bridges save and resolve launchers on the remote PC.

Choose the underlying **Agent** first. **Launcher → Default** uses the ordinary agent launch,
including the launch mode in Settings. A custom Launcher owns its executable and arguments.
On a supported PC, Launcher and its **Add launcher…** footer remain available even when no
launchers have been saved or the ordinary agent is not installed. If the ordinary agent is
unavailable, save and select a custom launcher explicitly before starting; Default stays unavailable.

## Saved definitions

On Linux and macOS, the Launcher dropdown’s **Add launcher…** footer opens a form to save a display name, the selected underlying agent
kind (Codex, Oh My Pi, Pi or Claude Code), an executable and optional individual arguments.
Use a command name on the bridge's PATH, an absolute path, or a path starting with `~/`.
Each argument field represents one argument, including any spaces; do not add shell quoting.
Shell syntax and environment substitutions are not expanded. An interpreter or compiled
launcher can be saved without a naming convention or shell-script restriction.
Saving checks the executable without running it; it installs nothing and creates no wrapper.

Saved choices appear in their own Launcher group, with a short ID beside the display name
only when saved names collide. Select one, then use **Edit launcher…** in the dropdown footer.
**Delete** is available only inside that Edit form and requires confirmation; **Cancel** keeps it.
The Add form has no Delete action.
The underlying kind is the Agent selected before adding it. A saved launcher owns its setup,
so the ordinary agent's launch-mode arguments are not added.
Edits and deletion affect future launches only; existing panes keep running.

Each PC's Web UI bridge owns `agent-launchers.json` in its server state directory,
beside shared preferences. The connection server uses `HERDR_WEB_STATE_DIR` when configured;
SSH bridges use their persistent `<bridge descriptor>.state` directory. The version-1 document
contains `launchers`, each with `id`, `kind`, `label`, `executable` and `args`. Writes replace
the document atomically; malformed saved state is preserved and reported rather than overwritten.
Unreadable saved state does not hide ordinary agents or executable search;
saved management and launches still report the repair error.
Definitions survive restart and are shared by every connected browser. Reopen a creation
dialog to load another browser's changes. Browser storage is not the source of truth.
An SSH PC keeps its definitions on that PC's bridge, not on the connection server. Removing
and re-adding the connection does not copy definitions to the local PC or another bridge.

The catalog (`GET /api/agents`) returns only selection IDs, labels and availability metadata.
Management (`GET/POST/PUT/DELETE /api/agents/launchers`, with `?id=` for PUT/DELETE) exposes
definitions only to controlling devices. Watching devices cannot read executable/argument
details, save, edit, delete or launch. The same checks precede local aliases and PC forwarding.
The bridge validates the selected definition and executable before creation and again after
checkout creation; a stale selection produces an actionable error. A failure after creation
preserves the pane so it can be opened and inspected.

Custom launchers require Linux or macOS and an available POSIX interactive shell. Windows and older bridges without saved-launcher support do not offer Add/manage;
their ordinary agent launches remain available. No Windows launcher transport is added.

## Agent configuration arguments

To use an existing Codex or Oh My Pi profile, save a launcher with **Executable** set to
`codex` or `omp`, **Argument 1** set to `--profile`, and **Argument 2** set to the exact profile ID
(for example, `research`). These are two separate arguments; do not enter `--profile research`
as one value or add shell quoting. The fictional browser demo uses the same editor and guidance.
The CLI owns its profile configuration and validates the ID when it starts.

Pi and Claude Code launchers can likewise supply the arguments their own CLI supports.

Creation APIs accept ordinary `agent.args`, including `["--profile", "research"]`, when no
launcher is selected. Saved launcher IDs resolve from the selected PC’s saved definitions.
Save an existing custom command by entering its executable name and individual arguments.

## Executable search and PC support

On current Linux/macOS bridges, Launcher offers Default and saved labels. Its popup footer has
**Add launcher…** and, only for a selected saved definition, **Edit launcher…**. These actions are
separate from the selectable choices. Bridges without launcher support keep ordinary agent options.

In Add/Edit, type in **Executable** to request name suggestions from the selected PC. Suggestions
use a case-sensitive prefix of actual executable names in absolute PATH directories, then
`~/.local/bin`, `~/.bun/bin` and `~/bin`. Names are deduplicated and limited to 20.
Shell aliases/functions and non-executable files are excluded; script format and name prefixes do
not matter. No candidate is executed, sourced or probed for help. Full-path completion is not added.

Choosing a suggestion fills only Executable and keeps the editor open, preserving the independent
name and individual arguments. You can also type a command or absolute/`~/` path without choosing
a suggestion. **Save launcher** persists the definition; Enter in the name or an argument field
also saves, after IME composition finishes. Enter in Executable only chooses a suggestion. Nothing
in the editor starts an agent. The outer Start/Create stays disabled until you save or cancel the editor.
Arrow keys and Enter choose a popup row. Tab reaches the selector’s action footer and stays within
the creation dialog. Escape dismisses an open popup first, then cancels deletion confirmation or
the editor, then closes the creation dialog. IME confirmation remains input, not a selection or
submission.

`GET /api/agents/launchers/search?q=prefix` returns `{ names: string[] }` to controlling devices only,
including local aliases and remote forwarding. Each bridge owns a shared metadata cache keyed by
home and search paths, refreshed on demand ten seconds after the previous refresh completes.
Concurrent requests share a refresh, with at most 16 filesystem checks in flight. Typing is debounced
by 180ms and superseded requests are canceled. Saving and launching always revalidate independently.
No per-keystroke SSH process starts: requests use the existing PC bridge connection.

The catalog advertises `launcher_search` separately from `saved_launchers`. A bridge with saved
launcher support but no executable search keeps manual editing without receiving search requests.
A bridge without saved launcher support offers ordinary agent launches without management requests.
The editor supplies executable and argument values only, without an environment or secret editor
and without changing the agent's global configuration.

Choices are read on every dialog opening and revalidated before creating a
workspace, tab or worktree. Changing Agent or PC resets Launcher to Default. If the catalog
cannot be read, a plain Shell remains usable. Windows retains ordinary agent launches.

A custom launcher may resume an existing session. Herdr therefore waits for native session
or transcript evidence and does not assume a fresh conversation or show an empty
conversation greeting for every custom launcher. Before the first message, some fresh
custom launcher starts can consequently lack that greeting. Default launches retain ordinary
fresh-session tracking; resumed history is never declared empty because a custom launcher was selected.

A failed or blocked custom launcher startup preserves the workspace, tab or worktree and
its pane. Open its terminal to inspect startup. Herdr waits up to 60 seconds for
the expected agent to become idle or done. Custom launchers require an available
POSIX interactive shell; an unreadable foreground job or another running program
is never used for launch input.
