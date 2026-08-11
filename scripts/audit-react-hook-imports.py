#!/usr/bin/env python3
"""Find React hook usage in TSX files without their expected import.

This is a lightweight regression guard for runtime failures such as a page
calling useAuth() after its import was accidentally removed.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "client" / "src"
CHECKS = ("useAuth", "useLocation", "useRoute", "useState", "useEffect", "useMemo")

issues: list[str] = []
for path in sorted(ROOT.rglob("*.tsx")):
    relative_path = path.relative_to(ROOT)
    # shadcn primitives and deprecated report fragments commonly use qualified
    # React hooks; they are outside the portal-routing regression surface.
    if relative_path.parts[0] == "components" and len(relative_path.parts) > 1 and relative_path.parts[1] in {"ui", "deprecated"}:
        continue
    if relative_path.parts[0] == "hooks":
        continue
    source = path.read_text(encoding="utf-8")
    # Imports can legitimately come from AuthContext, _core/hooks/useAuth,
    # React, or Wouter. Validate the imported symbol itself rather than the
    # import path so this guard prevents real omissions without false alarms.
    import_section = "\n".join(source.splitlines()[:120])
    for hook in CHECKS:
        usage = re.search(rf"\b{hook}\s*\(", source)
        imported = re.search(rf"^import[^\n]*\b{hook}\b[^\n]*$", import_section, re.MULTILINE)
        if usage and not imported:
            issues.append(f"{path.relative_to(ROOT)}: {hook}() used without importing {hook}")

if issues:
    print("React hook import audit failed:")
    print("\n".join(f"- {issue}" for issue in issues))
    raise SystemExit(1)

print("React hook import audit passed: no missing hook imports found.")
