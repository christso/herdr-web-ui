# OMP working status and deployment, 2026-10-16

OMP can visibly be working in its terminal while Herdr reports it as idle. This is
separate from the web UI hiding a working status that Herdr has already reported.
Both conditions were reproduced in owned fixtures, without sending input to a
user's agent.

## Native reporting

Herdr's [agent documentation](https://github.com/herdrdev/herdr/blob/2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01/docs/next/website/src/content/docs/agents.mdx)
explicitly says OMP state requires the integration. Its
[integration documentation](https://github.com/herdrdev/herdr/blob/2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01/docs/next/website/src/content/docs/integrations.mdx)
describes the extension that reports lifecycle and session information. A missing
hook is therefore a setup gap, rather than sufficient evidence of a Herdr defect.

A real OMP 18.11.1 instance ran on Herdr 0.9.5 under WSL2, using an offline
provider with a fixed 15-second reply delay. It made no live model calls. Herdr was
polled every 300 ms while the provider was busy:

| Official integration | Native status during the busy interval | After the reply |
| --- | --- | --- |
| Absent | Idle for all 50 samples; sequence unchanged | Idle; no session report |
| v10 installed | First sample idle, next 49 working | Idle; session reported |

The owned terminal frames showed `Working…` in both cases. This rules out a
terminal-reading ambiguity and shows why parsing an OMP spinner in the web UI
would address the wrong layer. Lifecycle reports avoid depending on its screen
layout, though changes to the extension API can still require maintenance.

Read-only inspection of the existing WTG coordinator found an OMP process that
started before its profile's v10 extension was installed. Its Herdr socket and
pane context were present, but it reported idle without a session file. This is
consistent with the current hook not being loaded; it does not prove which
extension code that process loaded. The process was left untouched.

WTG's default OMP extension was still v8. It was backed up with mode 0600 and
updated through `herdr integration install omp`; its hash now matches the
profile's v10 extension. Existing OMP processes need to restart and resume their
session to load the current extension. No user agent was restarted or prompted.

## Web UI rendering

The separate UI defect had two causes: the standalone indicator required a
conversation `activity` field even when native status was working, and a text-only
turn could suppress it despite having no rendered work block. The fix uses native
status when conversation activity is absent, and suppresses the standalone label
only when a live work block actually renders it. Explicit activity, blocked,
disconnected, ended and prompt guards remain.

The user-requested `codex-compound` agent implemented this in an isolated Herdr
worktree. The same browser regression check failed against each old condition and
passed with the fix. It covers user-only and text-only turns, native working with
no conversation activity, and avoiding a duplicate label for live tool work. The
fixture uses a detected Codex process with an OMP-shaped transcript; native OMP
reporting was tested separately above. Agent-browser also checked an owned
fixture. Its generic completed-conversation screenshot is not red/green evidence
of the working indicator.

An independent review found no blocking issue. Fast checks passed with 3,885 tests,
0 failures and 8 skips across 300 files. The focused browser regression and OMP
contract test passed. Extra Grok and Antigravity browser runs stopped at fixture
process detection before the app started, so those runs do not establish browser
coverage for those agents. The older broad chat browser script also has an
unrelated assertion that fails on the original UI; it was not weakened.

## Published and deployed state

The focused branch `fix/omp-chat-working-indicator` is pushed to the christso fork
at `e97ea32b4a650a964b355b191208d4be044dea72` and retained for a later upstream PR.
No upstream working-indicator issue or PR was opened. Personal evidence stays on
the fork's orphan `dogfood/evidence` branch, outside application changes.

Fork `christso/main` is pushed and deployed at
`883f2b65add9b873b6f836c16299df2bcae2d526`. It includes the indicator change and
the bounded OMP process-memory lookup from PR #1157. That lookup respects native
Herdr's WSL safety concern by isolating reads behind a deadline and a bounded
number of helper processes.

The host plugin and both WTG and Spectre web bridges run this revision. Each
remote's 120 backend source files match the fork; managed bridge identity and
restart were checked. Native Herdr socket identities, host auth configuration,
remote registrations and existing agent processes were preserved. An existing
WTG OMP conversation returned 134 turns after deployment.

Agent-browser signed into the production site and checked desktop and phone
layouts: the sidebar showed 32 workspaces, no sidebar fallback and no captured
browser errors. WebSockets were blocked for this read-only smoke check, so it
attached to no live terminal and took no user-session screenshots. This confirms
the deployed shell and revision; the owned browser regression supplies the
working-indicator proof.

The first smoke-check attempts misread a JavaScript Promise as a completed login
result. Awaiting it fixed the check; the application login passed unchanged.
