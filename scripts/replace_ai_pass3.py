#!/usr/bin/env python3
"""Third-pass: catch remaining user-visible AI strings."""

import os

SRC_DIR = "/home/ubuntu/kinga-replit/client/src"
SKIP_FILES = {"AIChatBox.tsx", "AiReanalysisPanel.tsx"}

RULES = [
    # ClaimReviewDialog
    ("No AI risk assessment available", "No KINGA risk assessment available"),
    # ClaimRiskIndicators
    ("AI Assess", "KINGA Assess"),
    ("The AI has analysed", "KINGA has analysed"),
    ("The AI has analyzed", "KINGA has analyzed"),
    # DamageConsistencyPanel — standalone "AI" label
    # (handled below with word-boundary logic)
    # DamageImagesPanel
    ("AI enriched", "KINGA enriched"),
    # ExecutiveAnalyticsCharts
    ("AI-recommended repairers", "KINGA-recommended repairers"),
    ("AI-assessed fraud risk", "KINGA-assessed fraud risk"),
    # ExecutiveKPICards
    ("through AI and automation", "through KINGA and automation"),
    # VehicleStructuralIntelligencePanel
    ("AI Structural Intelligence Narrative", "KINGA Structural Intelligence Narrative"),
    # AdminDashboard
    ("better AI accuracy", "better KINGA accuracy"),
    ("The AI learns", "KINGA learns"),
    ("The AI continuously learns", "KINGA continuously learns"),
    ("confirms or refutes AI predictions", "confirms or refutes KINGA predictions"),
    # AssessmentResults
    ("AI Component Total", "KINGA Component Total"),
    ("AI has successfully extracted", "KINGA has successfully extracted"),
    # AssessorClaimDetails
    ("AI Co-Pilot Assessment", "KINGA Co-Pilot Assessment"),
    ("AI Co-Pilot", "KINGA Co-Pilot"),
    ("AI Disagreement Section", "KINGA Disagreement Section"),
    ("disagree with the AI's analysis", "disagree with KINGA's analysis"),
    ("disagree with the AI", "disagree with KINGA"),
    # AutomationPolicies
    ("Controls AI-only approval", "Controls KINGA-only approval"),
    ("processed by AI versus", "processed by KINGA versus"),
    ("AI-only threshold", "KINGA-only threshold"),
    ("AI-only approval", "KINGA-only approval"),
    ("AI versus requiring", "KINGA versus requiring"),
    # ClaimDecisionReport
    ("AI Reconstructed", "KINGA Reconstructed"),
    ("differs from AI total estimate", "differs from KINGA total estimate"),
    ("The AI total is used", "The KINGA total is used"),
    ("AI recommended", "KINGA recommended"),
    ("AI total", "KINGA total"),
    # ClaimsProcessorDashboard comments
    ("Trigger AI or Assign", "Trigger KINGA or Assign"),
    ("AI FLAGGED:", "KINGA FLAGGED:"),
    # ExternalAssessorDashboard
    ("AI Summary", "KINGA Summary"),
    # FraudAnalyticsDashboard
    ("powered by AI and physics", "powered by KINGA and physics"),
    ("AI + Physics analysis", "KINGA + Physics analysis"),
    # InsurerComparisonView
    ("Re-run KINGA", "Re-run KINGA"),  # already done, skip
    # Generic remaining patterns
    ("AI Structural Narrative", "KINGA Structural Narrative"),
    ("AI Narrative", "KINGA Narrative"),
    ("AI narrative", "KINGA narrative"),
    ("AI Reasoning", "KINGA Reasoning"),
    ("AI reasoning", "KINGA reasoning"),
    ("AI-powered", "KINGA-powered"),
    ("AI powered", "KINGA powered"),
    ("AI-only", "KINGA-only"),
    ("AI only", "KINGA only"),
    ("AI accuracy", "KINGA accuracy"),
    ("AI predictions", "KINGA predictions"),
    ("AI learns", "KINGA learns"),
    ("AI continuously", "KINGA continuously"),
    ("AI has ", "KINGA has "),
    ("AI's ", "KINGA's "),
    # Standalone " AI " in JSX text nodes
    ("> AI <", "> KINGA <"),
    (">AI<", ">KINGA<"),
    ("{ AI }", "{ KINGA }"),
    # Remaining "AI" in strings
    ('"AI"', '"KINGA"'),
    ("'AI'", "'KINGA'"),
    ("`AI`", "`KINGA`"),
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

    print(f"\n✅ Pass 3 done: {total_changes} replacements across {total_files} files")


if __name__ == "__main__":
    main()
