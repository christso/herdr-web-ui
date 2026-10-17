# WTG reconnected — 2026-10-17

After the owner reported WTG online, inspection found it already connected through an upstream
v30 bridge. The native Herdr installation was 0.9.5 and its existing session was running.

WTG now uses the same verified fork commit as this host and Spectre:
`5d6e91a71647b9ad5eb20c9f846689bbfac54778`. Its stable `remote-v30` link points to
`remote-v30-christso-5d6e91a`. The previous upstream runtime remains as a rollback copy.

The deployment copied the existing verified v30 runtime, overlaid the same tested archive used
for Spectre, then verified all 1,616 source/asset hashes. Imports and the Node PTY smoke check
passed before activation. WTG's local connection was briefly disabled while switching the link
and stopping only the authenticated, identity-checked managed web bridge. It was re-enabled and
reconnected successfully. The live bridge identity and source hashes were checked again.

All 25 existing panes remained, along with all 39 recorded agent/Herdr process identities and
the native socket inode. Three existing OMP conversations remained readable. No user input was
sent, and no native Herdr or agent process was restarted.

Agent-browser checks on desktop and phone loaded a real WTG conversation without an unavailable
message, sidebar error or browser error. WebSocket attachments were blocked, and no user screenshots
were taken. The WTG OMP launch form offered the actual discovered profile IDs; selecting
`compound-engineering` worked. Selecting `omp-compound` hid Profile, and returning to Default
restored it. The form was never submitted.

The discovered WTG launchers were `codex-eng`, `omp-compound`, `pi-compound` and `pi-rpiv`.
Native OMP profiles were `agcon`, `agent-conductor`, `compound-engineering` and `omp-compound`.
No sample profiles or launchers were created to populate these choices.

Private scripts and verification reports are under
`/home/christso/.cache/herdr-upstream-sync/wtg`. The application checkout is unchanged and clean.
