#!/usr/bin/env python3
"""Pull-request guard for DoWorks app repos (synced from doworks/dev-tools).

Usage in CI: python3 .github/scripts/guard.py BASE_SHA HEAD_SHA
Fails (exit 1) when a change touches frappe/erpnext/hrms code, adds built or vendored files, or hard-codes a
do-works.net site name in shared code, and when the app at HEAD is not installable by Pilot (no
[tool.bench.frappe-dependencies] with frappe, or DocType fixtures). Prints one line per problem.
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


def packaging_problems(pyproject: str | None, files: list[str], hooks: str) -> list[str]:
    """The whole app at HEAD: pyproject.toml text (None if missing), tracked file paths, hooks.py text."""
    import tomllib  # stdlib from 3.11 (CI runs 3.12); apps' ruff configs target 3.10

    if pyproject is None:
        out = ["pyproject.toml: missing (Pilot refuses the app)"]
    else:
        try:
            deps = tomllib.loads(pyproject).get("tool", {}).get("bench", {}).get("frappe-dependencies", {})
        except tomllib.TOMLDecodeError as e:
            deps = {}
            out = [f"pyproject.toml: not valid TOML ({e})"]
        else:
            out = []
        if "frappe" not in deps:
            out.append("pyproject.toml: no [tool.bench.frappe-dependencies] with frappe (Pilot refuses the app)")
    out += [f"{f}: DocType fixtures (Pilot refuses them; ship DocTypes in the app)"
            for f in files if f.endswith("/fixtures/doctype.json")]
    if re.search(r"""["']dt["']\s*:\s*["']DocType["']""", hooks):
        out.append('hooks.py: fixtures export "DocType" records (Pilot refuses them)')
    return out


def _at_head(head: str, path: str) -> str | None:
    r = subprocess.run(["git", "show", f"{head}:{path}"], capture_output=True, text=True, errors="ignore")
    return r.stdout if r.returncode == 0 else None


def _packaging(head: str) -> list[str]:
    files = subprocess.run(["git", "ls-tree", "-r", "--name-only", head], capture_output=True, text=True, check=True).stdout.split()
    hooks = "".join(_at_head(head, f) or "" for f in files if re.fullmatch(r"[^/]+/hooks\.py", f))
    return packaging_problems(_at_head(head, "pyproject.toml"), files, hooks)


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
    found = problems(_changes(argv[0], argv[1])) + _packaging(argv[1])
    for p in found:
        print(p)
    if not found:
        print("guard: no problems")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
