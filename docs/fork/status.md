<!-- Generated from status.json by scripts/fork-status.py; edit the JSON or refresh. -->
# Fork comparison

Snapshot: 2026-10-18T05:37:13.110012+00:00. This is a pinned comparison, not live status.

Fork: [christso/herdr-web-ui](https://github.com/christso/herdr-web-ui) · ref `origin/christso/main` · commit [`4e8eaf3241568c51289185cc570ca7621f8c3e47`](https://github.com/christso/herdr-web-ui/commit/4e8eaf3241568c51289185cc570ca7621f8c3e47).
Upstream: [devswha/herdr-web-ui](https://github.com/devswha/herdr-web-ui) · ref `upstream/main` · commit [`f1491383275c11d37d1f11bbd826009972d72f4d`](https://github.com/devswha/herdr-web-ui/commit/f1491383275c11d37d1f11bbd826009972d72f4d).

Fork ahead / behind upstream: **39 / 0 commits** (full history, before path exclusions).
Upstream is an ancestor of the fork: **yes**. Product files differing: **46**.

## Reporting scope

Exclude the whole English README (including the fork introduction) and the fork reporting files/tool, so reporting does not count itself as product work. All other changed paths, including documentation, tests and changelog fragments, count.

Excluded exact paths:

- `README.md`
- `docs/fork/status.json`
- `docs/fork/status.md`
- `scripts/fork-status.py`

Method: Git tree diff, no renames; binary numstats are null. Compare the two committed trees directly, not just changes since their merge base. Uncommitted file contents are not compared.

Excluded paths that differ in this snapshot: none.

## Retained fork changes

| Area | Type | Difference from pinned upstream | Files | Upstream context |
| --- | --- | --- | ---: | --- |
| OMP custom config roots | Retained functionality | Resolve PI_CONFIG_DIR from the pane's process for default and named profiles, retaining upstream's bounded WSL probes. | 5 | — |
| Codex custom session stores | Retained functionality | Bind chats to the native process's custom store and distinguish peers sharing a working directory. Merged upstream footer fixes are not counted as fork-exclusive functionality. | 5 | PR [#1155](https://github.com/devswha/herdr-web-ui/pull/1155), PR [#1248](https://github.com/devswha/herdr-web-ui/pull/1248) |
| Pane and PC navigation | Retained functionality | Keep new worktree and PC selections through roster refreshes, deep links and browser navigation, including worktree-selection regression registration and assertions in the browser lane. | 8 | — |
| Native Working regression and history | Manual regression + historical fragment | scripts/chat-browser-qa.ts retains a manual browser regression. changelog.d/native-working-chat.md is a historical fork fragment, not new functionality or QA coverage. The live Working implementation is already upstream, including the merged OMP fixes. | 2 | PR [#1307](https://github.com/devswha/herdr-web-ui/pull/1307), PR [#1322](https://github.com/devswha/herdr-web-ui/pull/1322) |
| Native profiles and launchers | Retained functionality | Discover and revalidate native profiles and installed shell launchers in workspace, tab and worktree dialogs. Keep separate Profile and Launcher fields; Profile is conditional on native choices with Default selected. | 26 | Issue [#1197](https://github.com/devswha/herdr-web-ui/issues/1197) |

PR/issue links are context, not proof of coverage. Issue #1197 was open on 2026-10-18; this report does not claim it resolved.

Membership uses explicit paths, not filename wildcards. New unmatched paths remain in the complete file table and require classification.

**Unclassified paths: 0.** All changed product paths are accounted for.

## Complete product file detail

`A` = added, `M` = modified, `D` = deleted, `T` = type changed. Renames appear as deletion/addition; binary counts are shown as `binary`.

| File | Git status | Added | Removed | Area |
| --- | --- | ---: | ---: | --- |
| `changelog.d/agent-launch-profiles.md` | A | 8 | 0 | native-launch-profiles |
| `changelog.d/codex-profile-chat-start.md` | A | 4 | 0 | codex-profile-stores |
| `changelog.d/creation-link-machine.md` | A | 3 | 0 | selection-navigation |
| `changelog.d/native-working-chat.md` | A | 2 | 0 | working-regression |
| `changelog.d/worktree-phone-selection.md` | A | 2 | 0 | selection-navigation |
| `docs/agent-profiles.md` | A | 59 | 0 | native-launch-profiles |
| `docs/development.md` | M | 2 | 0 | native-launch-profiles |
| `scripts/chat-browser-qa.ts` | M | 62 | 0 | working-regression |
| `scripts/ci-browser.sh` | M | 1 | 0 | selection-navigation |
| `scripts/ci-browser.test.ts` | M | 2 | 1 | selection-navigation |
| `scripts/deep-link-demo-regression.ts` | M | 17 | 0 | selection-navigation |
| `scripts/demo-agent-launch.test.ts` | A | 48 | 0 | native-launch-profiles |
| `scripts/palette-machines-demo-regression.ts` | M | 21 | 1 | selection-navigation |
| `scripts/ui-regression.ts` | M | 4 | 0 | native-launch-profiles |
| `scripts/worktree-selection-demo-regression.ts` | A | 79 | 0 | selection-navigation |
| `server/agent-launch.ts` | M | 17 | 8 | native-launch-profiles |
| `server/agent-profiles.contract.test.ts` | A | 257 | 0 | native-launch-profiles |
| `server/agent-profiles.test.ts` | A | 108 | 0 | native-launch-profiles |
| `server/agent-profiles.ts` | A | 118 | 0 | native-launch-profiles |
| `server/api.contract.test.ts` | M | 8 | 2 | native-launch-profiles |
| `server/codex-processes.test.ts` | M | 80 | 3 | codex-profile-stores |
| `server/codex.ts` | M | 51 | 18 | codex-profile-stores |
| `server/conversation.test.ts` | M | 47 | 0 | codex-profile-stores |
| `server/conversation.ts` | M | 7 | 6 | codex-profile-stores |
| `server/index.ts` | M | 9 | 1 | native-launch-profiles |
| `server/omp-process.test.ts` | M | 2 | 2 | omp-custom-root |
| `server/omp-process.ts` | M | 1 | 1 | omp-custom-root |
| `server/omp.contract.test.ts` | M | 3 | 1 | omp-custom-root |
| `server/omp.test.ts` | M | 8 | 0 | omp-custom-root |
| `server/omp.ts` | M | 12 | 6 | omp-custom-root |
| `server/shell-agent.test.ts` | M | 32 | 1 | native-launch-profiles |
| `server/shell-agent.ts` | M | 58 | 0 | native-launch-profiles |
| `server/start-screen.test.ts` | M | 17 | 1 | native-launch-profiles |
| `server/start-screen.ts` | M | 11 | 0 | native-launch-profiles |
| `server/workspace-routes.ts` | M | 10 | 3 | native-launch-profiles |
| `shared/protocol.ts` | M | 7 | 3 | native-launch-profiles |
| `site/demo/transport.ts` | M | 22 | 2 | native-launch-profiles |
| `src/App.tsx` | M | 15 | 5 | selection-navigation |
| `src/components/AgentLaunchPicker.tsx` | A | 26 | 0 | native-launch-profiles |
| `src/components/NewSessionDialog.tsx` | M | 24 | 8 | native-launch-profiles |
| `src/components/WorktreeDialog.tsx` | M | 28 | 10 | native-launch-profiles |
| `src/lib/api.test.ts` | M | 23 | 1 | native-launch-profiles |
| `src/lib/api.ts` | M | 1 | 1 | native-launch-profiles |
| `src/lib/i18n.ja.ts` | M | 3 | 0 | native-launch-profiles |
| `src/lib/i18n.ko.ts` | M | 3 | 0 | native-launch-profiles |
| `src/lib/i18n.zh.ts` | M | 3 | 0 | native-launch-profiles |

## Outstanding PR snapshot

Scope: open upstream PRs authored by `christso`, and all open fork PRs. These queries cover the public repositories only; PRs are not part of the pinned tree diff.

All pages queried. Each repository has its own query timestamp; this is not live PR status.

devswha/herdr-web-ui, queried 2026-10-18T05:37:13.622135+00:00; author: christso.

No outstanding PRs in this successfully queried scope at that time.

christso/herdr-web-ui, queried 2026-10-18T05:37:14.128829+00:00; author: all.

No outstanding PRs in this successfully queried scope at that time.

## Refresh and render

Run from the repository root. The [tool](../../scripts/fork-status.py) requires Python 3 and Git for local refresh; rendering the [canonical JSON](status.json) requires only Python 3, with no Git, GitHub or network access.

Render this snapshot without changing its source pins or timestamps:

```sh
python3 scripts/fork-status.py render --input docs/fork/status.json --output docs/fork/status.md
```

Refresh from locally available tracking refs (defaults: `origin/christso/main`, `upstream/main`):

```sh
python3 scripts/fork-status.py refresh --out docs/fork
```

Recompute the product comparison from the exact source pins used above (creates a new snapshot time):

```sh
python3 scripts/fork-status.py refresh --fork-ref 4e8eaf3241568c51289185cc570ca7621f8c3e47 --upstream-ref f1491383275c11d37d1f11bbd826009972d72f4d --out docs/fork
```

`--github` additionally requires the GitHub CLI (`gh`) with access to the public repositories and network access. It queries all open PR pages in the scope above. Without it, PR status is explicitly unknown; a query failure exits nonzero before writing reports.

`--fetch` explicitly fetches only `origin`'s `christso/main` and `upstream`'s `main` into their tracking refs, without pruning, tags or submodule fetches. Configure those remotes for the fork and upstream first. Fetch is optional and is the only Git mutation; the tool never checks out, stages, deletes refs or changes branches.

Refresh writes only `status.json` and `status.md` in `--out`; render writes only `--output`. Both commands accept paths relative to the caller's directory. `--repo` can select another local checkout for refresh; it defaults to this tool's repository. No application state is read.
