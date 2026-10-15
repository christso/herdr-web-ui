# Fresh Codex launched from a terminal

Native Codex 0.162.1 and Herdr 0.9.5, clean upstream main `aa624cb`, with the full web app and agent-browser CLI. The agent and browser use temporary directories, the provider points to a closed loopback port, and no prompt or model call is made.

The terminal-launched process is detected as Codex/idle but reports no session identity. Its conversation endpoint returns HTTP 200, source scrollback, zero turns. Desktop and phone Chat show Conversation unavailable.

A second fresh Codex launched through the web API on the same server returns source codex-transcript, zero turns and the greeting. This is a working launch-path control, not an after-fix screenshot. No product fix is claimed here.

## Manual reproduction

1. Open a new Herdr tab in a project directory.
2. Run `codex` and wait for its empty composer. Do not send a message.
3. Open that pane in Herdr Web UI and choose Chat. It shows Conversation unavailable.
4. For comparison, create a new Codex workspace through the web UI. Before sending a message, its Chat shows the greeting.

Upstream PR #990 explicitly covered launches from the app and excluded terminal launches because they may resume an existing session. Any extension must preserve the distinction between an empty session and an existing transcript that cannot be read. This evidence supports asking for that extension; it does not establish a safe implementation.
