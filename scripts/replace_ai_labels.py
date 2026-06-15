#!/usr/bin/env python3
"""
Replace user-facing "AI" labels with KINGA-branded equivalents across all client tsx/ts files.
Rules (applied in order — most specific first):
  - "AI Optimised"          → "KINGA Optimised"
  - "AI Estimated Cost"     → "KINGA Estimated Cost"
  - "AI Estimate"           → "KINGA Estimate"
  - "AI estimated"          → "KINGA estimated"
  - "AI estimation"         → "KINGA estimation"
  - "AI Total"              → "KINGA Total"
  - "AI Damage Analysis"    → "KINGA Damage Analysis"
  - "AI vs Assessor"        → "KINGA vs Assessor"
  - "AI vs your"            → "KINGA vs your"
  - "AI recommendation"     → "KINGA recommendation"
  - "AI findings"           → "KINGA findings"
  - "AI classification"     → "KINGA classification"
  - "AI extraction"         → "KINGA extraction"
  - "AI extracts"           → "KINGA extracts"
  - "AI analysis"           → "KINGA analysis"
  - "AI analyzing"          → "KINGA analyzing"
  - "AI is analyzing"       → "KINGA is analyzing"
  - "AI assessment"         → "KINGA assessment"
  - "AI-Only"               → "KINGA-Only"
  - "AI-determined"         → "KINGA-determined"
  - "AI Fast-Track"         → "KINGA Fast-Track"
  - "AI Stability"          → "KINGA Stability"
  - "AI Predicted"          → "KINGA Predicted"
  - "AI Ready"              → "KINGA Ready"
  - "AI model"              → "KINGA model"
  - "AI Reasoning Engine"   → "KINGA Reasoning Engine"
  - "AI Limit:"             → "KINGA Limit:"
  - "Re-run AI"             → "Re-run KINGA"
  - "with AI"               → "with KINGA"
  - "for AI"                → "for KINGA"
  - "the AI"                → "KINGA"
  - "the AI has"            → "KINGA has"
  - "Quick Fill with AI"    → "Quick Fill with KINGA"
  - "AI image analysis"     → "KINGA image analysis"
  - "AI analysis of"        → "KINGA analysis of"
  - "AI extraction"         → "KINGA extraction"
  - "AI cost estimate"      → "KINGA cost estimate"
  - "AI cost estimates"     → "KINGA cost estimates"
  - "AI report"             → "KINGA report"
  - "AI variance"           → "KINGA variance"
  - "AI Variance"           → "KINGA Variance"
  - "Avg Variance from AI Est." → "Avg Variance from KINGA Est."
  - "No quote data with AI estimates yet" → "No quote data with KINGA estimates yet"
  - "alignment between AI and human" → "alignment between KINGA and human"
  - "the AI assessment"     → "the KINGA assessment"
  - "Start a conversation with AI" → "Start a conversation with KINGA"
  - "AI damage assessment"  → "KINGA damage assessment"
  - "AI-Only Assessments"   → "KINGA-Only Assessments"
  - "AI-Only Rate"          → "KINGA-Only Rate"
  - "AI Extraction & Confidence" → "KINGA Extraction & Confidence"
  - "AI underestimated"     → "KINGA underestimated"
  - "AI overestimated"      → "KINGA overestimated"
  - "AI-generated"          → "KINGA-generated"
  - "AI generation"         → "KINGA generation"
  - "AI generated"          → "KINGA generated"
  - "AI-powered"            → "KINGA-powered"
  - "AI powered"            → "KINGA powered"
  - "AI processing"         → "KINGA processing"
  - "AI has been processing" → "KINGA has been processing"
  - "AI optimisation"       → "KINGA optimisation"
  - "AI optimized"          → "KINGA optimized"
  - "AI optimised"          → "KINGA optimised"
  - "AI-triggered"          → "KINGA-triggered"
  - "AI re-triggered"       → "KINGA re-triggered"
  - "AI Re-Analysis"        → "KINGA Re-Analysis"
  - "AI re-analysis"        → "KINGA re-analysis"
  - "AI reanalysis"         → "KINGA reanalysis"
  - "AI Reanalysis"         → "KINGA Reanalysis"
  - "AI calibration"        → "KINGA calibration"
  - "AI Calibration"        → "KINGA Calibration"
  - "AI cost"               → "KINGA cost"
  - "AI Cost"               → "KINGA Cost"
  - "AI-based"              → "KINGA-based"
  - "AI-driven"             → "KINGA-driven"
  - "AI-assisted"           → "KINGA-assisted"
  - "AI-enabled"            → "KINGA-enabled"
  - "AI-supported"          → "KINGA-supported"
  - "AI-backed"             → "KINGA-backed"
  - "AI-led"                → "KINGA-led"
  - "AI-guided"             → "KINGA-guided"
  - "AI-informed"           → "KINGA-informed"
  - "AI-validated"          → "KINGA-validated"
  - "AI-verified"           → "KINGA-verified"
  - "AI-checked"            → "KINGA-checked"
  - "AI-reviewed"           → "KINGA-reviewed"
  - "AI-approved"           → "KINGA-approved"
  - "AI-flagged"            → "KINGA-flagged"
  - "AI-scored"             → "KINGA-scored"
  - "AI-rated"              → "KINGA-rated"
  - "AI-ranked"             → "KINGA-ranked"
  - "AI-sorted"             → "KINGA-sorted"
  - "AI-filtered"           → "KINGA-filtered"
  - "AI-selected"           → "KINGA-selected"
  - "AI-matched"            → "KINGA-matched"
  - "AI-detected"           → "KINGA-detected"
  - "AI-identified"         → "KINGA-identified"
  - "AI-classified"         → "KINGA-classified"
  - "AI-extracted"          → "KINGA-extracted"
  - "AI-processed"          → "KINGA-processed"
  - "AI-computed"           → "KINGA-computed"
  - "AI-calculated"         → "KINGA-calculated"
  - "AI-predicted"          → "KINGA-predicted"
  - "AI-estimated"          → "KINGA-estimated"
  - "AI-inferred"           → "KINGA-inferred"
  - "AI-derived"            → "KINGA-derived"
  - "AI-produced"           → "KINGA-produced"
  - "AI-created"            → "KINGA-created"
  - "AI-built"              → "KINGA-built"
  - "AI-trained"            → "KINGA-trained"
  - "AI-learned"            → "KINGA-learned"
  - "AI-tuned"              → "KINGA-tuned"
  - "AI-optimised"          → "KINGA-optimised"
  - "AI-optimized"          → "KINGA-optimized"
  - "AI-enhanced"           → "KINGA-enhanced"
  - "AI-augmented"          → "KINGA-augmented"
  - "AI-accelerated"        → "KINGA-accelerated"
  - "AI-automated"          → "KINGA-automated"
  - "AI-assisted"           → "KINGA-assisted"
  - "AI-enabled"            → "KINGA-enabled"
  - "AI-supported"          → "KINGA-supported"
  - "AI-backed"             → "KINGA-backed"
  - "AI-led"                → "KINGA-led"
  - "AI-guided"             → "KINGA-guided"
  - "AI-informed"           → "KINGA-informed"
  - "AI-validated"          → "KINGA-validated"
  - "AI-verified"           → "KINGA-verified"
  - "AI-checked"            → "KINGA-checked"
  - "AI-reviewed"           → "KINGA-reviewed"
  - "AI-approved"           → "KINGA-approved"
  - "AI-flagged"            → "KINGA-flagged"
  - "AI-scored"             → "KINGA-scored"
  - "AI-rated"              → "KINGA-rated"
  - "AI-ranked"             → "KINGA-ranked"
  - "AI-sorted"             → "KINGA-sorted"
  - "AI-filtered"           → "KINGA-filtered"
  - "AI-selected"           → "KINGA-selected"
  - "AI-matched"            → "KINGA-matched"
  - "AI-detected"           → "KINGA-detected"
  - "AI-identified"         → "KINGA-identified"
  - "AI-classified"         → "KINGA-classified"
  - "AI-extracted"          → "KINGA-extracted"
  - "AI-processed"          → "KINGA-processed"
  - "AI-computed"           → "KINGA-computed"
  - "AI-calculated"         → "KINGA-calculated"
  - "AI-predicted"          → "KINGA-predicted"
  - "AI-estimated"          → "KINGA-estimated"
  - "AI-inferred"           → "KINGA-inferred"
  - "AI-derived"            → "KINGA-derived"
  - "AI-produced"           → "KINGA-produced"
  - "AI-created"            → "KINGA-created"
  - "AI-built"              → "KINGA-built"
  - "AI-trained"            → "KINGA-trained"
  - "AI-learned"            → "KINGA-learned"
  - "AI-tuned"              → "KINGA-tuned"
"""

import os
import re
import sys

# Ordered replacement rules: (pattern, replacement)
# More specific patterns must come FIRST to avoid partial replacements
RULES = [
    # Compound / specific phrases first
    ("AI Extraction & Confidence Breakdown", "KINGA Extraction & Confidence Breakdown"),
    ("AI Extraction & Confidence", "KINGA Extraction & Confidence"),
    ("AI Damage Analysis Summary", "KINGA Damage Analysis Summary"),
    ("AI Damage Analysis", "KINGA Damage Analysis"),
    ("AI damage assessment", "KINGA damage assessment"),
    ("AI damage", "KINGA damage"),
    ("AI Estimated Cost", "KINGA Estimated Cost"),
    ("AI estimated repair cost", "KINGA estimated repair cost"),
    ("AI estimated", "KINGA estimated"),
    ("AI estimation", "KINGA estimation"),
    ("AI Estimate", "KINGA Estimate"),
    ("AI estimate", "KINGA estimate"),
    ("AI estimates", "KINGA estimates"),
    ("AI Optimised", "KINGA Optimised"),
    ("AI optimised", "KINGA optimised"),
    ("AI Optimized", "KINGA Optimized"),
    ("AI optimized", "KINGA optimized"),
    ("AI optimisation re-triggered", "KINGA optimisation re-triggered"),
    ("AI optimisation", "KINGA optimisation"),
    ("AI optimization", "KINGA optimization"),
    ("AI Total", "KINGA Total"),
    ("AI vs Assessor", "KINGA vs Assessor"),
    ("AI vs your", "KINGA vs your"),
    ("AI recommendation", "KINGA recommendation"),
    ("AI findings", "KINGA findings"),
    ("AI classification", "KINGA classification"),
    ("AI extraction", "KINGA extraction"),
    ("AI extracts", "KINGA extracts"),
    ("AI is analyzing", "KINGA is analyzing"),
    ("AI is analysing", "KINGA is analysing"),
    ("AI analyzing", "KINGA analyzing"),
    ("AI analysing", "KINGA analysing"),
    ("AI analysis of", "KINGA analysis of"),
    ("AI analysis", "KINGA analysis"),
    ("AI assessment", "KINGA assessment"),
    ("AI-Only Assessments", "KINGA-Only Assessments"),
    ("AI-Only Rate", "KINGA-Only Rate"),
    ("AI-Only", "KINGA-Only"),
    ("AI-determined", "KINGA-determined"),
    ("AI Fast-Track", "KINGA Fast-Track"),
    ("AI Stability", "KINGA Stability"),
    ("AI Predicted", "KINGA Predicted"),
    ("AI predicted", "KINGA predicted"),
    ("AI Ready", "KINGA Ready"),
    ("AI model will learn", "KINGA model will learn"),
    ("AI model", "KINGA model"),
    ("AI Reasoning Engine", "KINGA Reasoning Engine"),
    ("AI Limit:", "KINGA Limit:"),
    ("Re-run AI", "Re-run KINGA"),
    ("Quick Fill with AI", "Quick Fill with KINGA"),
    ("with AI", "with KINGA"),
    ("AI image analysis", "KINGA image analysis"),
    ("AI cost estimate", "KINGA cost estimate"),
    ("AI cost estimates", "KINGA cost estimates"),
    ("AI Cost", "KINGA Cost"),
    ("AI cost", "KINGA cost"),
    ("AI report", "KINGA report"),
    ("AI Variance", "KINGA Variance"),
    ("AI variance", "KINGA variance"),
    ("Avg Variance from AI Est.", "Avg Variance from KINGA Est."),
    ("No quote data with AI estimates yet", "No quote data with KINGA estimates yet"),
    ("alignment between AI and human", "alignment between KINGA and human"),
    ("Start a conversation with AI", "Start a conversation with KINGA"),
    ("AI underestimated", "KINGA underestimated"),
    ("AI overestimated", "KINGA overestimated"),
    ("AI-generated", "KINGA-generated"),
    ("AI generated", "KINGA generated"),
    ("AI generation", "KINGA generation"),
    ("AI-powered", "KINGA-powered"),
    ("AI powered", "KINGA powered"),
    ("AI processing", "KINGA processing"),
    ("AI has been processing", "KINGA has been processing"),
    ("AI-triggered", "KINGA-triggered"),
    ("AI re-triggered", "KINGA re-triggered"),
    ("AI Re-Analysis Failed", "KINGA Re-Analysis Failed"),
    ("AI Re-Analysis", "KINGA Re-Analysis"),
    ("AI re-analysis", "KINGA re-analysis"),
    ("AI Reanalysis", "KINGA Reanalysis"),
    ("AI reanalysis", "KINGA reanalysis"),
    ("AI calibration", "KINGA calibration"),
    ("AI Calibration", "KINGA Calibration"),
    ("AI-based", "KINGA-based"),
    ("AI-driven", "KINGA-driven"),
    ("AI-assisted", "KINGA-assisted"),
    ("AI-enabled", "KINGA-enabled"),
    ("AI-supported", "KINGA-supported"),
    ("AI-backed", "KINGA-backed"),
    ("AI-led", "KINGA-led"),
    ("AI-guided", "KINGA-guided"),
    ("AI-informed", "KINGA-informed"),
    ("AI-validated", "KINGA-validated"),
    ("AI-verified", "KINGA-verified"),
    ("AI-checked", "KINGA-checked"),
    ("AI-reviewed", "KINGA-reviewed"),
    ("AI-approved", "KINGA-approved"),
    ("AI-flagged", "KINGA-flagged"),
    ("AI-scored", "KINGA-scored"),
    ("AI-rated", "KINGA-rated"),
    ("AI-ranked", "KINGA-ranked"),
    ("AI-sorted", "KINGA-sorted"),
    ("AI-filtered", "KINGA-filtered"),
    ("AI-selected", "KINGA-selected"),
    ("AI-matched", "KINGA-matched"),
    ("AI-detected", "KINGA-detected"),
    ("AI-identified", "KINGA-identified"),
    ("AI-classified", "KINGA-classified"),
    ("AI-extracted", "KINGA-extracted"),
    ("AI-processed", "KINGA-processed"),
    ("AI-computed", "KINGA-computed"),
    ("AI-calculated", "KINGA-calculated"),
    ("AI-predicted", "KINGA-predicted"),
    ("AI-estimated", "KINGA-estimated"),
    ("AI-inferred", "KINGA-inferred"),
    ("AI-derived", "KINGA-derived"),
    ("AI-produced", "KINGA-produced"),
    ("AI-created", "KINGA-created"),
    ("AI-built", "KINGA-built"),
    ("AI-trained", "KINGA-trained"),
    ("AI-learned", "KINGA-learned"),
    ("AI-tuned", "KINGA-tuned"),
    ("AI-optimised", "KINGA-optimised"),
    ("AI-optimized", "KINGA-optimized"),
    ("AI-enhanced", "KINGA-enhanced"),
    ("AI-augmented", "KINGA-augmented"),
    ("AI-accelerated", "KINGA-accelerated"),
    ("AI-automated", "KINGA-automated"),
    # Standalone "the AI" → "KINGA" (no article needed)
    ("the AI has", "KINGA has"),
    ("the AI ", "KINGA "),
    # Remaining standalone "AI" in user-visible contexts (inside JSX text / strings)
    # We do a word-boundary replacement but only in string literals / JSX text
    # to avoid touching variable names like aiAssessment
]

# Files to skip (internal variable names, not user-visible)
SKIP_FILES = {
    "AIChatBox.tsx",
    "AiReanalysisPanel.tsx",
}

# Directories to process
SRC_DIR = "/home/ubuntu/kinga-replit/client/src"

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
        # Skip node_modules or hidden dirs
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "node_modules"]
        for fname in files:
            if fname.endswith((".tsx", ".ts")):
                fpath = os.path.join(root, fname)
                n = process_file(fpath)
                if n > 0:
                    total_files += 1
                    total_changes += n

    print(f"\n✅ Done: {total_changes} replacements across {total_files} files")


if __name__ == "__main__":
    main()
