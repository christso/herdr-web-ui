# Herdr Web UI dogfooding evidence

This orphan branch stores fictional screenshots, local reproduction helpers and verification notes
for our upstream contributions. It has no application-history parent and is not intended to merge
into upstream main. Runtime code, automated regression tests and CI belong on their own PR branches.

## OMP question cards

- Issue: https://github.com/devswha/herdr-web-ui/issues/1182
- Parser fix: https://github.com/devswha/herdr-web-ui/pull/1184
- Baseline parser: 6e575a89d2aa1fc054959cc44fa9df46a13455eb
- Fixed parser and captured screenshots: b52e2ef1b4251ae900df6c6b6e347ecc0c9f147e

The screenshots show fictional screen/RPC replay on a production-built frontend. They are not native
OMP execution or private conversation captures. The custom-answer replay verifies routing and key
order, not native OMP editor timing.

The original reproduction guide is under docs/omp-question-cards-reproduction.md. Its commands were
run from an application checkout; this branch itself does not contain the application or dependencies.
To use the replay helper from a separate evidence checkout, point its --root at a built application
checkout and link that checkout's node_modules into the evidence checkout first.

```sh
# APP_ROOT is an absolute path to an installed, built source checkout.
# Run from a checkout of this orphan branch.
ln -s "$APP_ROOT/node_modules" node_modules
bun scripts/omp-question-browser-fixture.ts --root "$APP_ROOT" --built
```

The source fix was independently reviewed. Fast checks passed (3,832 tests, 8 skipped); the prompt
suite passed 285 tests, including seven new OMP regressions that fail with the baseline parser.
The full integration/browser run was not green; the upstream PR records its failures and limits.
The separate native compatibility canary will keep its evidence here after validation.
