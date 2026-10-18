#!/usr/bin/env python3
"""Compare committed fork/upstream trees, or render a saved JSON snapshot offline.

Python 3 and Git suffice for local refresh. Only --github requires gh and network
access. Git reads are local unless --fetch explicitly requests remote ref updates.
"""

import argparse
import datetime
import json
from pathlib import Path
import subprocess
import sys


REPO = Path(__file__).resolve().parent.parent
EXCLUDED_PATHS = [
    "README.md",
    "docs/fork/status.json",
    "docs/fork/status.md",
    "scripts/fork-status.py",
]
SCOPE_REASON = (
    "Exclude the whole English README (including the fork introduction) and the "
    "fork reporting files/tool, so reporting does not count itself as product work. "
    "All other changed paths, including documentation, tests and changelog fragments, count."
)

GROUPS = [
    ("omp-custom-root", "OMP custom config roots", "Retained functionality",
     "Resolve PI_CONFIG_DIR from the pane's process for default and named profiles, retaining upstream's bounded WSL probes.",
     ["server/omp-process.test.ts", "server/omp-process.ts", "server/omp.contract.test.ts", "server/omp.test.ts", "server/omp.ts"], []),
    ("codex-profile-stores", "Codex custom session stores", "Retained functionality",
     "Bind chats to the native process's custom store and distinguish peers sharing a working directory. Merged upstream footer fixes are not counted as fork-exclusive functionality.",
     ["server/codex-processes.test.ts", "server/codex.ts", "server/conversation.test.ts", "server/conversation.ts", "changelog.d/codex-profile-chat-start.md"], [1155, 1248]),
    ("selection-navigation", "Pane and PC navigation", "Retained functionality",
     "Keep new worktree and PC selections through roster refreshes, deep links and browser navigation, including worktree-selection regression registration and assertions in the browser lane.",
     ["src/App.tsx", "scripts/deep-link-demo-regression.ts", "scripts/palette-machines-demo-regression.ts", "scripts/worktree-selection-demo-regression.ts", "scripts/ci-browser.sh", "scripts/ci-browser.test.ts", "changelog.d/creation-link-machine.md", "changelog.d/worktree-phone-selection.md"], []),
    ("working-regression", "Native Working regression and history", "Manual regression + historical fragment",
     "scripts/chat-browser-qa.ts retains a manual browser regression. changelog.d/native-working-chat.md is a historical fork fragment, not new functionality or QA coverage. The live Working implementation is already upstream, including the merged OMP fixes.",
     ["scripts/chat-browser-qa.ts", "changelog.d/native-working-chat.md"], [1307, 1322]),
    ("native-launch-profiles", "Native profiles and launchers", "Retained functionality",
     "Discover and revalidate native profiles and installed shell launchers in workspace, tab and worktree dialogs. Keep separate Profile and Launcher fields; Profile is conditional on native choices with Default selected.",
     ["server/agent-launch.ts", "server/agent-profiles.contract.test.ts", "server/agent-profiles.test.ts", "server/agent-profiles.ts", "server/shell-agent.test.ts", "server/shell-agent.ts", "server/start-screen.test.ts", "server/start-screen.ts", "server/workspace-routes.ts", "server/index.ts", "server/api.contract.test.ts", "shared/protocol.ts", "src/components/AgentLaunchPicker.tsx", "src/components/NewSessionDialog.tsx", "src/components/WorktreeDialog.tsx", "src/lib/api.test.ts", "src/lib/api.ts", "src/lib/i18n.ja.ts", "src/lib/i18n.ko.ts", "src/lib/i18n.zh.ts", "site/demo/transport.ts", "scripts/demo-agent-launch.test.ts", "scripts/ui-regression.ts", "docs/agent-profiles.md", "docs/development.md", "changelog.d/agent-launch-profiles.md"], []),
]
PR_SCOPES = [
    {"repository": "devswha/herdr-web-ui", "author": "christso"},
    {"repository": "christso/herdr-web-ui", "author": None},
]


def command(args, cwd=None):
    return subprocess.check_output(args, cwd=cwd, text=True, encoding="utf-8")


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def github_snapshot():
    queries = []
    for scope in PR_SCOPES:
        pages = json.loads(command([
            "gh", "api", "--paginate", "--slurp",
            f"repos/{scope['repository']}/pulls?state=open&per_page=100",
        ]))
        rows = [row for page in pages for row in page
                if scope["author"] is None or row["user"]["login"] == scope["author"]]
        queries.append({
            **scope, "queried_at": now(),
            "pull_requests": [
                {"number": row["number"], "title": row["title"], "url": row["html_url"],
                 "draft": row["draft"], "base_ref": row["base"]["ref"], "head_sha": row["head"]["sha"]}
                for row in sorted(rows, key=lambda row: row["number"])
            ],
        })
    return {"status": "complete", "state": "open", "pagination": "all pages", "queries": queries}


def refresh(repo, fork_ref, upstream_ref, fetch, github):
    def git(*args):
        return command(["git", *args], repo)

    if fetch:
        for remote in ("origin", "upstream"):
            # Explicit destination/main refs avoid configured pruning or tag updates.
            source = "christso/main" if remote == "origin" else "main"
            git("-c", "fetch.prune=false", "-c", "fetch.pruneTags=false", "fetch",
                "--no-prune", "--no-prune-tags", "--no-tags", "--no-recurse-submodules",
                "--no-write-fetch-head", remote, f"+refs/heads/{source}:refs/remotes/{remote}/{source}")
    fork_sha = git("rev-parse", "--verify", "--end-of-options", f"{fork_ref}^{{commit}}").strip()
    upstream_sha = git("rev-parse", "--verify", "--end-of-options", f"{upstream_ref}^{{commit}}").strip()
    counts = [int(value) for value in git("rev-list", "--left-right", "--count", f"{fork_sha}...{upstream_sha}").split()]
    ancestor = subprocess.run(["git", "merge-base", "--is-ancestor", upstream_sha, fork_sha], cwd=repo)
    if ancestor.returncode not in (0, 1):
        raise RuntimeError("Git could not determine upstream ancestry")
    diff = ("--no-ext-diff", "--no-textconv", "--no-renames", "--ignore-submodules=none")
    statuses = git("diff", *diff, "--name-status", "-z", upstream_sha, fork_sha, "--").split("\0")[:-1]
    stats = {}
    for record in git("diff", *diff, "--numstat", "-z", upstream_sha, fork_sha, "--").split("\0")[:-1]:
        added, removed, path = record.split("\t", 2)
        stats[path] = (None if added == "-" else int(added), None if removed == "-" else int(removed))
    membership = {path: ident for ident, _, _, _, paths, _ in GROUPS for path in paths}
    files, excluded = [], []
    for status, path in sorted(zip(statuses[::2], statuses[1::2]), key=lambda item: item[1]):
        added, removed = stats[path]
        entry = {"path": path, "status": status, "added": added, "removed": removed}
        if path in EXCLUDED_PATHS:
            excluded.append(entry)
        else:
            files.append({**entry, "group": membership.get(path, "unclassified")})
    groups = [
        {"id": ident, "title": title, "kind": kind, "summary": summary,
         "classified_paths": paths, "related_upstream_prs": prs,
         "related_upstream_issues": [1197] if ident == "native-launch-profiles" else [],
         "files": [entry["path"] for entry in files if entry["group"] == ident]}
        for ident, title, kind, summary, paths, prs in GROUPS
    ]
    unclassified = [entry["path"] for entry in files if entry["group"] == "unclassified"]
    return {
        "schema_version": 1, "generated_at": now(),
        "fork": {"repository": "christso/herdr-web-ui", "ref": fork_ref, "sha": fork_sha},
        "upstream": {"repository": "devswha/herdr-web-ui", "ref": upstream_ref, "sha": upstream_sha},
        "scope": {"method": "Git tree diff, no renames; binary numstats are null",
                  "excluded_paths": EXCLUDED_PATHS, "reason": SCOPE_REASON, "excluded_changed_files": excluded},
        "comparison": {"fork_only_commits": counts[0], "upstream_only_commits": counts[1],
                       "upstream_included": ancestor.returncode == 0, "product_files": len(files),
                       "unclassified_paths": unclassified},
        "upstream_context": "PR/issue links are context, not proof of coverage. Issue #1197 was open on 2026-10-18; this report does not claim it resolved.",
        "pull_requests": github_snapshot() if github else {
            "status": "not_queried", "state": "open", "scopes": PR_SCOPES,
            "reason": "Local refresh only; outstanding PRs are unknown. Use --github to query public GitHub metadata.",
        },
        "groups": groups, "files": files,
    }


def cell(value):
    return str(value).replace("&", "&amp;").replace("<", "&lt;").replace("|", "\\|").replace("\n", " ").replace("\r", " ")


def render(data):
    comparison = data["comparison"]
    lines = ["<!-- Generated from status.json by scripts/fork-status.py; edit the JSON or refresh. -->",
             "# Fork comparison", "", f"Snapshot: {cell(data['generated_at'])}. This is a pinned comparison, not live status.", ""]
    for side in ("fork", "upstream"):
        source = data[side]
        lines.append(f"{side.capitalize()}: [{cell(source['repository'])}](https://github.com/{source['repository']}) · ref `{cell(source['ref'])}` · commit [`{source['sha']}`](https://github.com/{source['repository']}/commit/{source['sha']}).")
    lines += ["", f"Fork ahead / behind upstream: **{comparison['fork_only_commits']} / {comparison['upstream_only_commits']} commits** (full history, before path exclusions).",
              f"Upstream is an ancestor of the fork: **{'yes' if comparison['upstream_included'] else 'no'}**. Product files differing: **{len(data['files'])}**.",
              "", "## Reporting scope", "", data["scope"]["reason"], "", "Excluded exact paths:", ""]
    lines += [f"- `{cell(path)}`" for path in data["scope"]["excluded_paths"]]
    lines += ["", f"Method: {cell(data['scope']['method'])}. Compare the two committed trees directly, not just changes since their merge base. Uncommitted file contents are not compared.",
              "", "Excluded paths that differ in this snapshot: " + (", ".join(f"`{cell(entry['path'])}`" for entry in data["scope"]["excluded_changed_files"]) or "none") + ".",
              "", "## Retained fork changes", "", "| Area | Type | Difference from pinned upstream | Files | Upstream context |", "| --- | --- | --- | ---: | --- |"]
    for group in data["groups"]:
        links = [f"PR [#{number}](https://github.com/devswha/herdr-web-ui/pull/{number})" for number in group["related_upstream_prs"]]
        links += [f"Issue [#{number}](https://github.com/devswha/herdr-web-ui/issues/{number})" for number in group["related_upstream_issues"]]
        lines.append(f"| {cell(group['title'])} | {cell(group['kind'])} | {cell(group['summary'])} | {len(group['files'])} | {', '.join(links) or '—'} |")
    unmatched = comparison["unclassified_paths"]
    if unmatched:
        lines.append(f"| **Unclassified — classification required** | Unknown | No feature or coverage claim | {len(unmatched)} | — |")
    lines += ["", data["upstream_context"], "",
              "Membership uses explicit paths, not filename wildcards. New unmatched paths remain in the complete file table and require classification.", "",
              f"**Unclassified paths: {len(unmatched)}.**" + (" " + ", ".join(f"`{cell(path)}`" for path in unmatched) if unmatched else " All changed product paths are accounted for."),
              "", "## Complete product file detail", "", "`A` = added, `M` = modified, `D` = deleted, `T` = type changed. Renames appear as deletion/addition; binary counts are shown as `binary`.",
              "", "| File | Git status | Added | Removed | Area |", "| --- | --- | ---: | ---: | --- |"]
    for entry in data["files"]:
        added = entry["added"] if entry["added"] is not None else "binary"
        removed = entry["removed"] if entry["removed"] is not None else "binary"
        lines.append(f"| `{cell(entry['path'])}` | {cell(entry['status'])} | {added} | {removed} | {cell(entry['group'])} |")
    prs = data["pull_requests"]
    lines += ["", "## Outstanding PR snapshot", "", "Scope: open upstream PRs authored by `christso`, and all open fork PRs. These queries cover the public repositories only; PRs are not part of the pinned tree diff.", ""]
    if prs["status"] != "complete":
        lines.append("**Unknown / not queried.** " + cell(prs["reason"]))
    else:
        lines.append("All pages queried. Each repository has its own query timestamp; this is not live PR status.")
        for query in prs["queries"]:
            lines += ["", f"{cell(query['repository'])}, queried {cell(query['queried_at'])}; author: {cell(query['author'] or 'all')}.", ""]
            if not query["pull_requests"]:
                lines.append("No outstanding PRs in this successfully queried scope at that time.")
            else:
                lines += ["| PR | Title | State | Base | Head commit |", "| --- | --- | --- | --- | --- |"]
                for pr in query["pull_requests"]:
                    lines.append(f"| [#{pr['number']}]({pr['url']}) | {cell(pr['title'])} | {'Draft' if pr['draft'] else 'Open'} | `{cell(pr['base_ref'])}` | `{pr['head_sha']}` |")
    lines += ["", "## Refresh and render", "", "Run from the repository root. The [tool](../../scripts/fork-status.py) requires Python 3 and Git for local refresh; rendering the [canonical JSON](status.json) requires only Python 3, with no Git, GitHub or network access.",
              "", "Render this snapshot without changing its source pins or timestamps:", "", "```sh",
              "python3 scripts/fork-status.py render --input docs/fork/status.json --output docs/fork/status.md", "```",
              "", "Refresh from locally available tracking refs (defaults: `origin/christso/main`, `upstream/main`):", "", "```sh",
              "python3 scripts/fork-status.py refresh --out docs/fork", "```",
              "", "Recompute the product comparison from the exact source pins used above (creates a new snapshot time):", "", "```sh",
              f"python3 scripts/fork-status.py refresh --fork-ref {data['fork']['sha']} --upstream-ref {data['upstream']['sha']} --out docs/fork", "```",
              "", "`--github` additionally requires the GitHub CLI (`gh`) with access to the public repositories and network access. It queries all open PR pages in the scope above. Without it, PR status is explicitly unknown; a query failure exits nonzero before writing reports.",
              "", "`--fetch` explicitly fetches only `origin`'s `christso/main` and `upstream`'s `main` into their tracking refs, without pruning, tags or submodule fetches. Configure those remotes for the fork and upstream first. Fetch is optional and is the only Git mutation; the tool never checks out, stages, deletes refs or changes branches.",
              "", "Refresh writes only `status.json` and `status.md` in `--out`; render writes only `--output`. Both commands accept paths relative to the caller's directory. `--repo` can select another local checkout for refresh; it defaults to this tool's repository. No application state is read.", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    collect = sub.add_parser("refresh", help="compare local committed refs; optional fetch/GitHub query")
    collect.add_argument("--repo", type=Path, default=REPO)
    collect.add_argument("--out", type=Path, default=REPO / "docs/fork")
    collect.add_argument("--fork-ref", default="origin/christso/main")
    collect.add_argument("--upstream-ref", default="upstream/main")
    collect.add_argument("--fetch", action="store_true", help="explicitly update origin/christso/main and upstream/main; no pruning")
    collect.add_argument("--github", action="store_true", help="query public open PRs using gh (requires network)")
    make = sub.add_parser("render", help="render saved JSON without Git or network")
    make.add_argument("--input", type=Path, required=True)
    make.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.action == "refresh":
            data = refresh(args.repo, args.fork_ref, args.upstream_ref, args.fetch, args.github)
            markdown = render(data)
            args.out.mkdir(parents=True, exist_ok=True)
            (args.out / "status.json").write_bytes((json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))
            (args.out / "status.md").write_bytes(markdown.encode("utf-8"))
            print(json.dumps(data["comparison"]))
        else:
            args.output.write_bytes(render(json.loads(args.input.read_text(encoding="utf-8"))).encode("utf-8"))
    except (OSError, subprocess.CalledProcessError, ValueError, KeyError, RuntimeError) as error:
        print(f"fork-status: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
