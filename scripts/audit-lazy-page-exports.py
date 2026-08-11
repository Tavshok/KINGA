#!/usr/bin/env python3
"""Verify that every lazy-loaded App route page has a default export.

An absent default export becomes an undefined React element when a route is
opened, producing production-only minified React error #130.
"""

from __future__ import annotations

import re
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
APP = PROJECT / "client" / "src" / "App.tsx"
SRC = PROJECT / "client" / "src"

source = APP.read_text(encoding="utf-8")
imports = re.findall(r"lazy\(\(\)\s*=>\s*import\([\"']([^\"']+)[\"']\)\)", source)
issues: list[str] = []

for module in imports:
    if module.startswith("@/"):
        candidate = SRC / module[2:]
    elif module.startswith("./"):
        candidate = APP.parent / module[2:]
    else:
        continue

    paths = [candidate.with_suffix(".tsx"), candidate.with_suffix(".ts"), candidate / "index.tsx"]
    resolved = next((path for path in paths if path.exists()), None)
    if resolved is None:
        issues.append(f"{module}: source file not found")
        continue
    page_source = resolved.read_text(encoding="utf-8")
    if not re.search(r"export\s+default\s+", page_source):
        issues.append(f"{module}: {resolved.relative_to(PROJECT)} has no default export")

if issues:
    print("Lazy page export audit failed:")
    print("\n".join(f"- {issue}" for issue in issues))
    raise SystemExit(1)

print(f"Lazy page export audit passed: {len(imports)} lazy pages provide default exports.")
