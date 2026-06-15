#!/usr/bin/env python3
"""
Second-pass replacement for remaining user-visible "AI" strings.
Only touches string literals, JSX text, and comments that are visible to users.
Skips: variable names (camelCase starting with 'ai'), import paths, OpenAI, AIChatBox.
"""

import os
import re

SRC_DIR = "/home/ubuntu/kinga-replit/client/src"

SKIP_FILES = {"AIChatBox.tsx", "AiReanalysisPanel.tsx"}

# Additional rules not caught by pass 1
RULES = [
    # Comments that are user-visible (JSX comments / doc strings)
    ("AI Structural Narrative", "KINGA Structural Narrative"),
    ("AI Repair Intelligence", "KINGA Repair Intelligence"),
    ("AI Confidence", "KINGA Confidence"),
    ("AI Preliminary Score", "KINGA Preliminary Score"),
    ("AI Recommendation:", "KINGA Recommendation:"),
    ("AI Recommendation", "KINGA Recommendation"),
    ("AI:", "KINGA:"),
    ("AI assists — insurer decides", "KINGA assists — insurer decides"),
    ("AI assists; insurer decides", "KINGA assists; insurer decides"),
    ("AI Approval Limit", "KINGA Approval Limit"),
    ("AI Limit", "KINGA Limit"),
    ("AI Training", "KINGA Training"),
    ("AI Pipeline", "KINGA Pipeline"),
    ("AI Reasoning", "KINGA Reasoning"),
    ("AI Narrative", "KINGA Narrative"),
    ("AI narrative", "KINGA narrative"),
    ("AI Generated", "KINGA Generated"),
    ("AI generated", "KINGA generated"),
    ("AI reconstruction", "KINGA reconstruction"),
    ("AI will automatically extract", "KINGA will automatically extract"),
    ("our AI will automatically extract", "KINGA will automatically extract"),
    ("our AI can read", "KINGA can read"),
    ("our AI", "KINGA"),
    ("The AI can read", "KINGA can read"),
    ("AI can read", "KINGA can read"),
    ("AI analyzes", "KINGA analyzes"),
    ("AI analyses", "KINGA analyses"),
    ("AI, Assessor", "KINGA, Assessor"),
    ("AI, assessor", "KINGA, assessor"),
    ("Compare AI,", "Compare KINGA,"),
    ("compare AI,", "compare KINGA,"),
    ("Process {files.length} Document(s) Through AI Pipeline", "Process {files.length} Document(s) Through KINGA Pipeline"),
    ("Through AI Pipeline", "Through KINGA Pipeline"),
    ("Forensic AI reconstruction", "KINGA forensic reconstruction"),
    ("AI learning benchmark estimate", "KINGA learning benchmark estimate"),
    ("AI-reasoned", "KINGA-reasoned"),
    ("System Management, AI Training", "System Management, KINGA Training"),
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

    print(f"\n✅ Pass 2 done: {total_changes} replacements across {total_files} files")


if __name__ == "__main__":
    main()
