# Native WSL reproduction of missing OMP conversations

The missing command-line arguments have a specific cause. Herdr 0.9.5 deliberately omits them for recognized agent processes on WSL, to avoid a possible blocking procfs read during process exit. This is documented in [Herdr's process discovery](https://github.com/herdrdev/herdr/blob/2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01/src/platform/linux.rs#L377) and [the condition it checks](https://github.com/herdrdev/herdr/blob/2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01/src/platform/linux.rs#L758). It was introduced by [Herdr PR #2179](https://github.com/herdrdev/herdr/pull/2179).

## Conditions

1. Herdr runs inside WSL2 and recognizes the foreground process as OMP.
2. OMP has a saved conversation but does not report its session file through the Herdr integration. Disabling extensions explicitly is one reproducible way to create this condition; a profile without the integration can also lack that report.
3. The web UI uses the upstream OMP resolver that requires command-line arguments for its fallback.

A custom profile and SSH are not required. WSL matters here; ordinary Linux fresh-session checks had arguments populated. An OMP session that successfully reports its conversation file can use the direct session path instead of this fallback.

## Observed result

An isolated WSL2 test with native Herdr 0.9.5 and real OMP 18.11.1 reproduced the missing arguments in three runs: default profile, named `personal` profile, default again. Each resumed a fictional saved conversation. No process metadata was injected and no model calls were made.

In all three runs native Herdr reported OMP as idle, supplied its process ID/name/cwd, and omitted both arguments and session path. The upstream `ompHeldTranscript` resolver returned null. The current fork resolver found the exact fictional conversation. [Machine-readable results](report.json).

This test checks the native process report and real file resolution. The [earlier browser replay](../omp-launch-workaround/README.md) separately shows how the missing information reaches Chat and how the fixed resolver recovers both messages. That browser replay deliberately omitted arguments; this native WSL test does not.

## Repeat it on WSL2

Prerequisites: Python 3, Git, Bun 1.4+, Herdr 0.9.5, and native OMP 18.11.1. The OMP process must be recognized by Herdr as `omp`. Use the executable paths matching your installation.

```sh
WSL_REPRO_ROOT=$(mktemp -d)
git clone https://github.com/christso/herdr-web-ui.git "$WSL_REPRO_ROOT/herdr-web-ui"
cd "$WSL_REPRO_ROOT/herdr-web-ui"
git checkout --detach 3b6d381cbebd3f6d1e953e569f0478f2836656d9
bun install --frozen-lockfile
curl -fsSL https://raw.githubusercontent.com/christso/herdr-web-ui/dogfood/evidence/docs/omp-native-wsl-repro/native-repro.py -o "$WSL_REPRO_ROOT/native-repro.py"
HERDR_REPRO_RUNTIME="$WSL_REPRO_ROOT/herdr-web-ui" \
HERDR_REPRO_BIN="$HOME/.local/bin/herdr" \
BUN_REPRO_BIN="$HOME/.bun/bin/bun" \
OMP_REPRO_BIN="$HOME/.bun/bin/omp" \
python3 "$WSL_REPRO_ROOT/native-repro.py"
```

The script creates a temporary home, named Herdr server, three fictional transcripts, and a temporary copy of the runtime. It runs real OMP with `--no-extensions --extension <offline-provider> --model launch-fixture/offline --session <fictional-file>`, adding `--profile personal` in the middle run. The explicit provider forbids model calls. Both resolver versions are imported from that temporary runtime; only the upstream resolver file is added to it. The server is stopped in `finally`. The final REPORT line names the local evidence file.

Expected: three rows with `reported_argc: 0`, `native_session_reported: false`, `upstream_found: false`, `fixed_found: true`, and final status `passed`.

## Safety finding about the proposed fix

The existing synchronous `/proc/<pid>/cmdline` fallback bypasses Herdr's WSL safeguard. Herdr applies the same safeguard to environment reads. No hang occurred during these runs, but successful reads do not rule out the process-exit race. The proposed fallback needs a bounded approach before being called ready for upstream review. This is separate from establishing a repeatable reproduction.

These personal reproduction materials live only on the fork's orphan evidence branch, outside application branches and upstream PR diffs.
