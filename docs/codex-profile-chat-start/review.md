# Independent review

Standards: the missing changelog fragment was added. The final read-only review found no outstanding standards issues.

Spec: review caught two ownership errors before deployment. A different store could still veto a short reply if its pane directory was missing; store filtering now happens before that check. A trailing slash or symlink could make one store look like two stores; store paths are now canonicalized before comparison. Both failing regressions passed after the fix, and the symlink case is covered too. The final read-only review found no outstanding spec issues.

The existing test assertions remain unchanged. The process fixture now reports separate per-pane foreground metadata and gives its owned Codex process the temporary store it actually tests. These fixture changes let the new tests reproduce separate stores without reading the user's environment.

A single failed screen RPC after launcher readiness remains a possible resilience follow-up. Review found no supported normal startup race: launcher readiness already waits for Codex idle/done. Opaque and resumed launchers retain their existing conservative behavior.
