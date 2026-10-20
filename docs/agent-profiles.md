# Native profiles and launchers

New workspace, New tab and New worktree discover the selected PC's existing
Codex and Oh My Pi profiles. Launcher searches executable names on that PC as you type.
No Herdr agent catalog is needed. SSH bridges discover on the remote PC.

Choose the underlying **Agent** first. **Launcher → Default** uses the ordinary
agent launch. With Default selected, **Profile** offers exact native profile IDs,
without display aliases. Choosing a custom Launcher
hides Profile: the launcher owns its own profile, environment and arguments.
Profile is hidden when no profiles exist. On a supported PC, Launcher and **Add launcher**
remain available even when nothing was discovered or the ordinary agent is not installed.
If the ordinary agent is unavailable, save and select a custom launcher explicitly
before starting; Default stays unavailable.

## Saved definitions

On Linux and macOS, **Add launcher** saves a display name, the selected underlying agent
kind (Codex, Oh My Pi, Pi or Claude Code), an executable and optional individual arguments.
Use a command name on the bridge's PATH, an absolute path, or a path starting with `~/`.
Each argument field represents one argument, including any spaces; do not add shell quoting.
Shell syntax and environment substitutions are not expanded. An interpreter or compiled
launcher can be saved without a naming convention or shell-script restriction.
Saving checks the executable without running it; it installs nothing and creates no wrapper.

Saved choices appear in their own Launcher group, with a short ID beside the display name
only when saved names collide. Select one to **Edit** or **Delete** it in the same dialog.
The underlying kind is the Agent selected before adding it. A saved launcher owns its setup,
so Profile is cleared and hidden and the ordinary agent's launch-mode arguments are not added.
Edits and deletion affect future launches only; existing panes keep running.

Each PC's Web UI bridge owns `agent-launchers.json` in its server state directory,
beside shared preferences. The connection server uses `HERDR_WEB_STATE_DIR` when configured;
SSH bridges use their persistent `<bridge descriptor>.state` directory. The version-1 document
contains `launchers`, each with `id`, `kind`, `label`, `executable` and `args`. Writes replace
the document atomically; malformed saved state is preserved and reported rather than overwritten.
Unreadable saved state does not hide ordinary agents, native profiles or executable search;
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

Custom launchers require Linux or macOS and an available POSIX interactive shell, as discovered
wrappers do. Windows and older bridges without saved-launcher support do not offer Add/manage;
their ordinary agent launches remain available. No Windows launcher transport is added.

## Discovery

On Linux and macOS, native profile discovery uses:

- Codex: `$CODEX_HOME`, or `~/.codex`. Current CLIs use `<ID>.config.toml`;
  older CLIs use `[profiles.<ID>]` in `config.toml`. Herdr checks the installed
  Codex CLI's help to distinguish these incompatible formats. Current Codex
  rejects an ID that still has a matching legacy table or `profile` setting,
  so those conflicting IDs are omitted until migrated in Codex itself. If the
  capability check fails, Profile stays hidden; Default remains available.
- Oh My Pi: `~/.omp/profiles/<ID>/agent`, respecting its native `PI_CONFIG_DIR`
  directory name under home. `PI_CODING_AGENT_DIR` changes Default's agent
  directory only; named profiles use their native root.
- Pi: no native Profile field, because Pi core has no `--profile` flag.
  An installed wrapper can select its own `PI_CODING_AGENT_DIR` instead.
- Claude Code: save a configuration launcher that supplies its own setup or `--settings` arguments,
  without inventing a native `--profile` option.

Native profile launches use the ordinary agent with fixed `--profile ID`
arguments. Discovery reads native Codex TOML and OMP directory markers; it does
not return configuration contents, authentication, paths or environment to the
browser. These settings must be available to the bridge process on that PC.

On current Linux/macOS bridges, Launcher offers Default and saved labels without automatically
cataloging wrappers. Type to filter those labels and request executable name suggestions from the
selected PC. Suggestions use a case-sensitive prefix of actual executable names in absolute PATH
directories, then `~/.local/bin`, `~/.bun/bin` and `~/bin`. Names are deduplicated and limited to 20.
Shell aliases/functions and non-executable files are excluded; script format and name prefixes do
not matter. No candidate is executed, sourced or probed for help. Full-path completion is not added.

Selecting a suggestion or **Use executable: …** opens the existing editor with name and executable
prefilled. You can enter an absolute or `~/` path even when no suggestion matches. Adjust the name
and individual arguments and explicitly **Save launcher**; then the outer Start/Create launches it.
Typing and selecting suggestions never saves or runs them. Uncommitted search text blocks creation;
select a launcher or cancel search to continue. Arrow keys and Enter choose a row; Escape cancels
search without closing the dialog. IME confirmation remains input, not a selection or submission.

`GET /api/agents/launchers/search?q=prefix` returns `{ names: string[] }` to controlling devices only,
including local aliases and remote forwarding. Each bridge owns a shared metadata cache keyed by
home and search paths, refreshed on demand ten seconds after the previous refresh completes.
Concurrent requests share a refresh, with at most 16 filesystem checks in flight. Typing is debounced
by 180ms and superseded requests are canceled. Saving and launching always revalidate independently.
No per-keystroke SSH process starts: requests use the existing PC bridge connection.

The catalog advertises `launcher_search` separately from `saved_launchers`. Older bridges retain
their existing saved/manual and legacy choices without receiving unsupported search requests.
Current bridges still accept explicit old prefix-based shell-wrapper IDs through the creation API,
resolving those only when requested. They never import or register those wrappers automatically.
The editor supplies executable and argument values only, without an environment or secret editor
and without changing the agent's global configuration.

Choices are read on every dialog opening and revalidated before creating a
workspace, tab or worktree. A native profile and custom Launcher cannot be combined.
Changing Agent or PC resets these choices to Default. If discovery fails, a plain
Shell remains usable. Windows retains ordinary agent launches.

A wrapper may resume an existing session. Herdr therefore waits for native session
or transcript evidence and does not assume a fresh conversation or show an empty
conversation greeting for every wrapper. Before the first message, some fresh
wrapper launches can consequently lack that greeting. Controlled native profile
and Default launches retain ordinary fresh-session tracking; resumed history is
never declared empty because a wrapper was selected.

A failed or blocked wrapper startup preserves the workspace, tab or worktree and
its pane. Open its terminal to inspect startup. Herdr waits up to 60 seconds for
the expected agent to become idle or done. Wrapper launch requires an available
POSIX interactive shell; an unreadable foreground job or another running program
is never used for launch input.
