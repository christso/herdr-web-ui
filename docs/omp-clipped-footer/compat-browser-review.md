# Scoped compatibility-browser lifecycle review

**No retained actionable findings** in the two-line follow-up to `b2cf9fced0edffa6272b8f5ab2774e3606fba722`.

Reviewed file: `scripts/omp-question-compat.ts`. Start/end SHA-256: `4edc707c02793c08dbe604c4b01f188bf395d719b952c3f8af6a47c346d248b5`.

The old browser is closed before AGENT_BROWSER_SESSION changes to the random fixture session's -phone name. The subsequent set-viewport and open commands therefore target a distinct owned daemon/socket instead of racing the old daemon's shutdown. This preserves a separate phone browser context and sets its viewport before navigation. It adds no retry, delay, assertion relaxation or change to parser/answer behavior.

Cleanup is consistent: browserEnvForCleanup references the same browserEnv object rather than a copy, and the subprocess wrapper forwards that object as env. After the switch, diagnostics/final close target the phone session. Failure before the switch still targets the original session. If the original close rejects, execution never switches names and finally still attempts to close it. The original successful close has already requested shutdown before the new session starts; the session switch does not create an abandoned extra session. Both names derive from the existing random fixture id and do not target user sessions.

I compared the full file against b2cf9fc after removing exactly the added comment and assignment; it matches byte-for-byte. All question/options/descriptions, exact native result, phone layout, timeout and cleanup assertions are unchanged. Only the harness script is modified; no personal evidence or other file is added.

The supplied hosted failure report/log records agent-browser set failing to configure/connect after parser recognition, consistent with the reported shutdown/socket race. This source review does not by itself prove the race is eliminated on hosted runners. No build, native/browser run or source edit was performed. Root owns the fresh hosted compatibility rerun after commit/integration and the already-running fast checks.

Machine receipt: `/tmp/herdr-fresh-chat/compat-browser-review.json`.
