# Independent final clipped legacy cancel-footer review

**No retained actionable findings in the frozen runtime/test content.** The previous P2 is closed. This is the requested scoped read-only final recheck; no project source edits, builds, publication, native executions or live user-pane access were performed.

Reviewed base: `aa624cb56f550f9a7dd8bf4d59ed99ffc3921741`. Start and end hashes matched:

| File | SHA-256 |
| --- | --- |
| `server/prompt.ts` | `a0383e4debb4c940218e45b755a0b53c1f771c583ea59dd32caba472e8b89edf` |
| `server/prompt.test.ts` | `72cb1b883f9e54b2fb8916f7ec9ba1bc16ff647f4c3456be242f9646c26b9fd5` |

The diff contains only prompt runtime, its additive regression test, and the small changelog fragment. Original tests and assertions remain verbatim: zero pre-existing test lines were removed or changed. No screenshots, personal documentation or replay helpers are part of the upstream diff. No files or behavior from the independent modern parser PR are included.

The clipped rule still requires complete Enter select, note and movement controls plus an ellipsis-marked bounded cancel prefix. It supports native and ASCII ellipses with or without question-navigation tabs, without executable-version or terminal-width gating. The added guard checks each resulting MenuRow source for an actual option marker in the selected row's physical marker column. Exactly one cursor is required. Unmarked continuation/description rows that the old parser would invent as choices now reject the newly accepted clipped card.

Verification:

- Focused OMP prompt suite: **55 passed, 0 failed, 265 assertions**; `/tmp/herdr-omp-clipped/independent-final-focused.log`.
- **25 pure capture/composition/adverse controls passed**; script/result `/tmp/herdr-omp-clipped/independent-final-probes.ts` and `.json`.
- The actual supplied 57-column native wrapped capture now returns null on this standalone branch, closing the false-choice P2. It is deliberately not claimed to parse correctly without the separate wrapped-row parser.
- The actual 43-column complete menu extracted from the final clean-main red report is rejected by the byte-matched baseline, then parsed by the fixed source as exactly Which route?, Local socket, Remote relay. Choosing Remote relay emits Down then Enter.
- Missing or unmarked Other, a misaligned option marker, an unmarked extra row, missing/multiple cursors, later output and unmarked cancel prefixes reject the card. Every supported cancel prefix with native/ASCII ellipsis passes on the real complete-menu capture. The added regression additionally verifies padded aligned markers and the original Tab-present footer.
- To check composition without editing either repository, a scratch module combines the exact reviewed guard and clipped-footer recognition with the real modern parser source (SHA d0ff23727d000bd9a8eecb391d8cd9ad140beadbea920ab0df6207316c05e531). On the same 57-column capture, its grouped rows pass the guard and reconstruct the exact whole question, one wrapped label and description; answering emits one Enter. This demonstrates behavioral composability, not automatic conflict-free git merging.

Native evidence readback:

`red-clean-main/report.json` is the meaningful baseline failure: the actual complete native menu at 43 columns ends Esc… and the baseline fails waiting for a parsed card. Earlier fixture/schema failures are excluded. `green/report.json` records a pass at the same 43-column clipped footer and parser SHA matching the frozen runtime above. The scratch provider now reads real single-question details.selectedOptions and compares the structured result exactly; its old text-contains fallback is gone. `green/native-result.json` has actual and expected both equal to route selectedOptions [Remote relay], ok true. I inspected this code/artifact linkage; I did not rerun native OMP or agent-browser. The worker's reports use Herdr 0.9.5, so this is not independently verified evidence for pinned hosted Herdr 0.9.3.

The screenshots and reports remain scratch/evidence artifacts for the parent to publish separately. Browser dimension reporting distinguishes the tall 300x1400 native attach from desktop and phone Chat views. The source-content hash, rather than the still-uncommitted base HEAD label in the run report, binds the green run to this frozen patch. Parent owns final commit/publication, complete checks and any future CI/native matrix validation.

Machine receipt: `/tmp/herdr-omp-clipped/independent-final-review.json`.
