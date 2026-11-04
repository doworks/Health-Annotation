#!/usr/bin/env python3
"""Pull-request guard for DoWorks app repos (synced from doworks/dev-tools).

Usage in CI: python3 .github/scripts/guard.py BASE_SHA HEAD_SHA
Fails (exit 1) when a change touches frappe/erpnext/hrms code, adds built or vendored files, or hard-codes a
do-works.net site name in shared code. Prints one line per problem.
"""
from __future__ import annotations

import re
import subprocess
import sys

CORE = re.compile(r"^(frappe|erpnext|hrms)/")
BUILT = re.compile(r"(^|/)(node_modules|dist)/|\.bundle\.[0-9a-f]*\.?(js|css)$|\.pyc$")
SITE = re.compile(r"\b([a-z0-9-]+\.do-works\.net)\b")
NO_SITE_CHECK = re.compile(r"(^|/)tests?/|(^|/)test_[^/]*$|\.md$")


def problems(changes: list[tuple[str, str, str | None]]) -> list[str]:
    """changes: (status letter A/M/R/D/C, path, new file text or None). Returns problem lines."""
    out = []
    for status, path, text in changes:
        if status == "D":
            continue
        if CORE.match(path):
            out.append(f"{path}: core app code (frappe/erpnext/hrms) must not be changed here")
            continue
        if BUILT.search(path):
            out.append(f"{path}: built or vendored file; build output is not committed")
            continue
        if text and path.endswith((".py", ".js")) and not NO_SITE_CHECK.search(path):
            m = SITE.search(text)
            if m:
                out.append(f"{path}: hard-coded site name {m.group(1)} (use a setting instead)")
    return out


def _changes(base: str, head: str) -> list[tuple[str, str, str | None]]:
    diff = subprocess.run(["git", "diff", "--name-status", "-M", f"{base}...{head}"],
                          capture_output=True, text=True, check=True).stdout
    changes = []
    for line in diff.splitlines():
        parts = line.split("\t")
        status, path = parts[0][0], parts[-1]
        text = None
        if status != "D":
            r = subprocess.run(["git", "show", f"{head}:{path}"], capture_output=True, text=True, errors="ignore")
            text = r.stdout if r.returncode == 0 else None
        changes.append((status, path, text))
    return changes


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    found = problems(_changes(argv[0], argv[1]))
    for p in found:
        print(p)
    if not found:
        print("guard: no problems")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
