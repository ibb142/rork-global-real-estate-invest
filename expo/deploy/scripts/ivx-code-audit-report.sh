#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TARGET_ROOT="${1:-$PROJECT_ROOT}"
REPORT_SCOPE="${REPORT_SCOPE:-full}"

python3 - "$TARGET_ROOT" "$REPORT_SCOPE" <<'PY'
from __future__ import annotations

import os
import sys
from collections import defaultdict
from pathlib import Path

root = Path(sys.argv[1]).resolve()
report_scope = sys.argv[2].strip().lower()

allowed_extensions = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".sh", ".md", ".sql", ".css"
}
excluded_dirs = {
    ".git", ".workspace", "node_modules", ".expo", ".next", "dist", "build", ".turbo", ".idea", ".vscode"
}
focus_tokens = (
    "ivx",
    "audit",
    "chat",
    "deploy",
    "health",
    "nginx",
    "pm2",
)
core_roots = (
    "expo/",
    "backend/",
    "app/",
    "components/",
    "lib/",
    "src/",
    "server",
    "package.json",
    "PLAN.md",
)

if not root.exists():
    print(f"ERROR: target root does not exist: {root}", file=sys.stderr)
    sys.exit(1)

records: list[tuple[str, int, str]] = []
by_ext: dict[str, dict[str, int]] = defaultdict(lambda: {"files": 0, "lines": 0})
focus_records: list[tuple[str, int, str]] = []

for current_root, dirs, files in os.walk(root):
    dirs[:] = [directory for directory in dirs if directory not in excluded_dirs]
    current_path = Path(current_root)

    for file_name in files:
        path = current_path / file_name
        extension = path.suffix.lower()
        if extension not in allowed_extensions:
            continue
        if path.name in {"bun.lock", "bun.lockb"}:
            continue

        relative_path = path.relative_to(root).as_posix()
        if relative_path.startswith("expo/dist/"):
            continue

        try:
            with path.open("r", encoding="utf-8", errors="ignore") as file_handle:
                line_count = sum(1 for _ in file_handle)
        except OSError:
            continue

        records.append((relative_path, line_count, extension or "[no_ext]"))
        by_ext[extension or "[no_ext]"]["files"] += 1
        by_ext[extension or "[no_ext]"]["lines"] += line_count

        lower_path = relative_path.lower()
        if any(token in lower_path for token in focus_tokens):
            focus_records.append((relative_path, line_count, extension or "[no_ext]"))

records.sort(key=lambda item: (-item[1], item[0]))
focus_records.sort(key=lambda item: (-item[1], item[0]))
summary_total_lines = sum(item[1] for item in records)
summary_total_files = len(records)
core_records = [
    item for item in records
    if any(item[0] == prefix or item[0].startswith(prefix) for prefix in core_roots)
]
core_total_lines = sum(item[1] for item in core_records)
core_total_files = len(core_records)

print("IVX CODE AUDIT REPORT")
print(f"ROOT {root}")
print(f"SCOPE {report_scope}")
print(f"TOTAL_FILES {summary_total_files}")
print(f"TOTAL_LINES {summary_total_lines}")
print(f"CORE_APP_FILES {core_total_files}")
print(f"CORE_APP_LINES {core_total_lines}")
print()
print("LINES BY EXTENSION")
for extension, metrics in sorted(by_ext.items(), key=lambda item: (-item[1]['lines'], item[0])):
    print(f"{metrics['lines']:>8} lines | {metrics['files']:>5} files | {extension}")

print()
print("FILE LINE COUNTS")
for index, (relative_path, line_count, extension) in enumerate(records, start=1):
    print(f"{index:>4}. {line_count:>8} | {extension:<6} | {relative_path}")

if report_scope in {"focus", "ivx"}:
    selected_focus = focus_records
else:
    selected_focus = focus_records[:150]

print()
print("CORE APP FILES")
if not core_records:
    print("NONE")
else:
    for index, (relative_path, line_count, extension) in enumerate(core_records, start=1):
        print(f"{index:>4}. {line_count:>8} | {extension:<6} | {relative_path}")

print()
print("IVX FOCUS FILES")
if not selected_focus:
    print("NONE")
else:
    for index, (relative_path, line_count, extension) in enumerate(selected_focus, start=1):
        print(f"{index:>4}. {line_count:>8} | {extension:<6} | {relative_path}")
PY
