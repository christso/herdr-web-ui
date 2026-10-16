# Agent launch profiles

New workspace, New tab and New worktree can start a named Codex, Oh My Pi or Pi
launcher configured on the selected PC. **Default** uses the ordinary agent launch. If only a named launcher is available,
choose a profile before starting; Default is disabled.
The Profile field appears only when that agent has usable named launchers.

On Linux or macOS, create `agent-profiles.json` on the PC that runs the launcher.
For the local server, use its state directory: `HERDR_WEB_STATE_DIR`, or
`$XDG_CONFIG_HOME/herdr-web-ui`, or `~/.config/herdr-web-ui` by default.

An app-managed SSH bridge uses a separate directory for each Herdr socket:
`~/.config/herdr-web-ui/bridges/<socket-sha256>.json.state/agent-profiles.json`.
Find the matching `bridges/<socket-sha256>.json` descriptor by its `socket_path`
field on that PC, then create the catalog in the adjacent `.json.state` directory.
Keep the descriptor private: it also contains the bridge's access token.

The catalog has this format:

```json
{
  "profiles": [
    {
      "id": "review",
      "label": "Review",
      "kind": "codex",
      "command": "/opt/agent-launchers/codex-review",
      "args": ["--quiet"],
      "fresh": true
    }
  ]
}
```

`command` must be an absolute path to an existing executable wrapper. The wrapper
must start the declared underlying agent in the current pane and working directory.
Arguments are a fixed string array, passed as individual arguments without shell
expansion. IDs must be unique within each kind (`codex`, `omp` or `pi`). Labels are
shown in the dialog; commands, paths and arguments stay on the bridge. Each remote
PC has its own configuration. Protect this file and its launchers as executable
configuration; there is no browser editor.

`fresh: true` is the host administrator's declaration that the launcher always
starts a new session. Only use it after inspecting the wrapper. Omit it, or use
`false`, for launchers that may resume sessions: the app will wait for transcript
evidence instead of showing a fresh conversation greeting.

Changes are read when a dialog loads its agent list and again when it starts.
Missing or non-executable launchers are unavailable. A malformed file rejects the
catalog; fix the configuration on that PC and reopen the dialog. Named profiles do
not accept extra arguments from launch requests. Windows keeps its ordinary agent
launches and does not offer named profiles.

A failed or blocked startup preserves the workspace, tab or worktree and its pane.
Open its terminal to inspect the launcher. Startup waits up to 60 seconds for herdr
to recognize the expected agent and report it idle or done. Profiles require an
available POSIX interactive shell (sh, bash, dash, zsh, fish, ksh or mksh); an unreadable foreground job or another
running program is never used for launch input.
