#!/usr/bin/env python3
"""Fourth-pass: final remaining user-visible AI strings."""

import os

SRC_DIR = "/home/ubuntu/kinga-replit/client/src"
SKIP_FILES = {"AIChatBox.tsx", "AiReanalysisPanel.tsx"}

RULES = [
    # DamageConsistencyPanel — standalone "AI" label in JSX
    (">                                AI\n", ">                                KINGA\n"),
    # AutomationPolicies — hybrid workflow description
    ("hybrid workflow (AI + human review)", "hybrid workflow (KINGA + human review)"),
    # FraudAnalyticsDashboard
    ("flagged by AI and physics analysis", "flagged by KINGA and physics analysis"),
    # HistoricalClaimsPipeline
    ("AI Accuracy", "KINGA Accuracy"),
    # InsurerClaimsTriage — standalone "AI" label
    (">                              AI\n", ">                              KINGA\n"),
    # InsurerComparisonView
    ("re-run AI for precise values", "re-run KINGA for precise values"),
    ("re-run AI", "re-run KINGA"),
    # InternalAssessorDashboard
    (">                          AI\n", ">                          KINGA\n"),
    (">                          AI<", ">                          KINGA<"),
    # OperationalHealthDashboard
    ("performance, and AI stability", "performance, and KINGA stability"),
    # RecoveryCaseDetail
    ("The AI will draft", "KINGA will draft"),
    # Generic remaining
    ("AI Accuracy", "KINGA Accuracy"),
    ("AI stability", "KINGA stability"),
    ("AI Stability", "KINGA Stability"),
    ("AI + human review", "KINGA + human review"),
    ("AI + physics", "KINGA + physics"),
    ("AI and physics", "KINGA and physics"),
    ("AI vs assessor", "KINGA vs assessor"),
    ("AI vs Assessor", "KINGA vs Assessor"),
    ("AI will draft", "KINGA will draft"),
    ("AI will ", "KINGA will "),
    # Standalone "AI" in JSX text (common patterns)
    (">AI<", ">KINGA<"),
    ("> AI<", "> KINGA<"),
    (">AI ", ">KINGA "),
    (" AI<", " KINGA<"),
    # In string templates
    ("\"AI\"", "\"KINGA\""),
    ("'AI'", "'KINGA'"),
    ("`AI`", "`KINGA`"),
    # Comment-style but user-visible (section headers)
    ("AI Savings", "KINGA Savings"),
    ("AI engine", "KINGA engine"),
    ("AI Extraction Data", "KINGA Extraction Data"),
    ("AI Context Panel", "KINGA Context Panel"),
    ("AI context panel", "KINGA context panel"),
    ("AI disagreement", "KINGA disagreement"),
    ("AI Co-Pilot", "KINGA Co-Pilot"),
    ("AI per-component benchmark", "KINGA per-component benchmark"),
    ("AI vs assessor comparison", "KINGA vs assessor comparison"),
    ("Extract quote data using AI", "Extract quote data using KINGA"),
]

def process_file(filepath: str) -> int:
    filename = os.path.basename(filepath)
    if filename in SKIP_FILES:
        return 0

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    original = content
    changes = 0

    for old, new in RULES:
        if old == new:
            continue
        if old in content:
            count = content.count(old)
            content = content.replace(old, new)
            changes += count

    if content != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  ✅ {filepath} ({changes} replacements)")

    return changes


def main():
    total_files = 0
    total_changes = 0

    for root, dirs, files in os.walk(SRC_DIR):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "node_modules"]
        for fname in files:
            if fname.endswith((".tsx", ".ts")):
                fpath = os.path.join(root, fname)
                n = process_file(fpath)
                if n > 0:
                    total_files += 1
                    total_changes += n

    print(f"\n✅ Pass 4 done: {total_changes} replacements across {total_files} files")


if __name__ == "__main__":
    main()
