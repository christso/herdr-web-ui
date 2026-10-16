# Native profiles and launchers

New workspace, New tab and New worktree discover the selected PC's existing
Codex and Oh My Pi profiles and installed Codex, Oh My Pi, Pi and Claude Code shell wrappers.
No Herdr agent catalog is needed. SSH bridges discover on the remote PC.

Choose the underlying **Agent** first. **Launcher → Default** uses the ordinary
agent launch. With Default selected, **Profile** offers exact native profile IDs,
without display aliases. Choosing a custom Launcher, such as `codex-compound`,
hides Profile: the wrapper owns its own profile, environment and arguments.
Fields with no choices are hidden. If the ordinary agent is unavailable but a
wrapper is installed, choose that wrapper explicitly before starting.

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
- Claude Code: configuration launchers can supply `CLAUDE_CONFIG_DIR` or `--settings`.
  They appear under Launcher, without inventing a native `--profile` option.

Native profile launches use the ordinary agent with fixed `--profile ID`
arguments. Discovery reads native Codex TOML and OMP directory markers; it does
not return configuration contents, authentication, paths or environment to the
browser. These settings must be available to the bridge process on that PC.

Launcher discovery checks absolute directories on the bridge's `PATH`, then
`~/.local/bin`, `~/.bun/bin` and `~/bin`. It preserves executable search order
and offers executable POSIX shell scripts named `codex-*`, `omp-*`, `pi-*` or `claude-*`.
It skips binary helpers, other script interpreters, missing files and directories.
Discovery never executes wrappers or interprets their bodies. The selected
wrapper runs itself from its resolved host path, in the created pane's directory.
There is no browser command, argument or environment editor.

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
