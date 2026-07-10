#!/usr/bin/env python3
"""
Batch 9a: Magic Number Scanner
Scans pipeline-critical files for bare numeric literals that should be named constants.
Produces a structured worklist grouped by file.
"""
import re, os, json

BASE = "/home/ubuntu/kinga-replit"

# Priority files to scan (Groups A–H scope)
FILES = [
    # Group A — Ingestion & Extraction
    "server/pipeline-v2/stage-1-ingestion.ts",
    "server/pipeline-v2/stage-2-extraction.ts",
    "server/pipeline-v2/stage-3-structured-extraction.ts",
    "server/pdf-image-extractor.ts",
    "server/pipeline-v2/quoteExtractionEngine.ts",
    # Group B — Image Intelligence
    "server/pipeline-v2/imageIntelligence.ts",
    "server/pipeline-v2/imageClassifier.ts",
    "server/pipeline-v2/stage-6-damage-analysis.ts",
    "server/pipeline-v2/photoForensicsEngine.ts",
    # Group C — Physics & Causal
    "server/pipeline-v2/stage-7-physics.ts",
    "server/pipeline-v2/stage-7-unified.ts",
    "server/pipeline-v2/stage-7b-causal-reasoning.ts",
    "server/pipeline-v2/speedInferenceEnsemble.ts",
    "server/pipeline-v2/severityConsensusEngine.ts",
    # Group D — Fraud Scoring
    "server/pipeline-v2/stage-8-fraud.ts",
    "server/pipeline-v2/scenarioFraudEngine.ts",
    "server/pipeline-v2/fraudPatternLearningEngine.ts",
    "shared/fraudScoring.ts",
    # Group E — Cost Intelligence
    "server/pipeline-v2/stage-9-cost.ts",
    "server/pipeline-v2/pipelineCostConstants.ts",
    "server/pipeline-v2/costDecisionEngine.ts",
    "server/pipeline-v2/quoteOptimisationEngine.ts",
    "server/pipeline-v2/mechanicalAlignmentEvaluator.ts",
    # Group F — Assembly & Decision
    "server/pipeline-v2/stage-5-assembly.ts",
    "server/pipeline-v2/decisionReadinessEngine.ts",
    "server/pipeline-v2/decisionOptimisationEngine.ts",
    "server/pipeline-v2/evidenceStrengthScorer.ts",
    "server/pipeline-v2/forensicCDI.ts",
    # Group G — Orchestrator & Pipeline
    "server/pipeline-v2/orchestrator.ts",
    "server/pipeline-v2/pipelineContractRegistry.ts",
    "server/pipeline-v2/pipelineGateController.ts",
    "server/pipeline-v2/stage-4-validation.ts",
    # Group H — Core Infrastructure
    "server/pipeline-v2/types.ts",
    "server/pipeline-v2/incidentClassificationEngine.ts",
    "server/pipeline-v2/fieldValidationEngine.ts",
    "server/pipeline-v2/extractionQualityScorer.ts",
]

# Patterns that indicate a magic number (not just arithmetic)
# Key heuristics:
# 1. Comparison against a numeric literal (threshold)
# 2. Assignment to a variable with a threshold-like name
# 3. Decimal multiplier (weight/factor)
# 4. Large round numbers (timeouts, batch sizes, caps)
THRESHOLD_NAMES = re.compile(
    r'\b(threshold|cap|max|min|limit|timeout|batch|rate|score|weight|penalty|factor|ratio|'
    r'pct|percent|confidence|dpi|pages?|count|size|delay|interval|ttl|expir|budget|'
    r'meanBrightness|colourVariance|overlap|deviation|spread|band|range|tier|level)\b',
    re.IGNORECASE
)

COMPARISON_PATTERN = re.compile(
    r'(?:>=|<=|>|<|===|!==|==|!=)\s*(\d+(?:\.\d+)?)\b'
)

ASSIGNMENT_PATTERN = re.compile(
    r'(?:const|let|var)\s+\w*(?:threshold|cap|max|min|limit|timeout|batch|rate|score|weight|'
    r'penalty|factor|ratio|pct|percent|confidence|dpi|pages?|count|size|delay|interval|'
    r'brightness|variance|overlap|deviation|band|range|tier|level)\w*\s*=\s*(\d+(?:\.\d+)?)',
    re.IGNORECASE
)

DECIMAL_WEIGHT = re.compile(r'[=:]\s*(0\.[1-9]\d*)\b')

LARGE_NUMBER = re.compile(r'\b(\d{4,})\b')  # 4+ digit numbers

# Numbers that are almost certainly not magic (pure math, array indices, HTTP codes)
SKIP_VALUES = {0, 1, 2, 3, 4, 5, 100, 1000, 10000}
SKIP_PATTERNS = re.compile(
    r'(?:status|http|code|version|index|length|size|count)\s*[=:]\s*\d+'
    r'|Math\.(round|floor|ceil|abs|pow|sqrt|max|min)\('
    r'|\btoFixed\(\d\)'
    r'|\bslice\(\d'
    r'|\bsubstring\(\d'
    r'|\.length\s*[><=]'
    r'|i\s*[+\-]=\s*\d'
    r'|i\s*<\s*\d+\s*;'
    r'|page\s*\+\s*1'
    r'|index\s*[+\-]\s*1'
    , re.IGNORECASE
)

results = {}

for rel_path in FILES:
    fpath = os.path.join(BASE, rel_path)
    if not os.path.exists(fpath):
        continue
    
    with open(fpath) as f:
        lines = f.readlines()
    
    file_findings = []
    
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        
        # Skip pure comments, imports, type declarations, test lines
        if (stripped.startswith('//') or stripped.startswith('*') or 
            stripped.startswith('import ') or stripped.startswith('export type') or
            stripped.startswith('export interface') or stripped.startswith('interface ') or
            stripped.startswith('type ') or stripped.startswith('describe(') or
            stripped.startswith('it(') or stripped.startswith('expect(')):
            continue
        
        # Skip lines that are clearly not magic numbers
        if SKIP_PATTERNS.search(stripped):
            continue
        
        # Check for threshold-like variable names with numeric values
        if THRESHOLD_NAMES.search(stripped):
            nums = COMPARISON_PATTERN.findall(stripped) + DECIMAL_WEIGHT.findall(stripped)
            large = LARGE_NUMBER.findall(stripped)
            all_nums = nums + large
            if all_nums:
                for n in all_nums:
                    try:
                        v = float(n)
                        if v not in SKIP_VALUES and v > 0:
                            file_findings.append({
                                'line': i,
                                'value': n,
                                'context': stripped[:120],
                            })
                            break
                    except:
                        pass
        
        # Check for comparisons against numeric literals (thresholds)
        elif COMPARISON_PATTERN.search(stripped):
            nums = COMPARISON_PATTERN.findall(stripped)
            for n in nums:
                try:
                    v = float(n)
                    if v not in SKIP_VALUES and v > 5:  # skip trivial comparisons
                        file_findings.append({
                            'line': i,
                            'value': n,
                            'context': stripped[:120],
                        })
                        break
                except:
                    pass
        
        # Check for large round numbers (timeouts, batch sizes)
        elif LARGE_NUMBER.search(stripped) and not stripped.startswith('//'):
            nums = LARGE_NUMBER.findall(stripped)
            for n in nums:
                try:
                    v = int(n)
                    # Only flag numbers that look like timeouts/caps (not cents math)
                    if v >= 1000 and v not in {1000, 10000, 100000} and '_' not in stripped:
                        if any(kw in stripped.lower() for kw in 
                               ['timeout', 'delay', 'interval', 'batch', 'max', 'cap', 'limit', 'dpi', 'pages']):
                            file_findings.append({
                                'line': i,
                                'value': n,
                                'context': stripped[:120],
                            })
                            break
                except:
                    pass
    
    if file_findings:
        results[rel_path] = file_findings

# Print structured output
total = sum(len(v) for v in results.values())
print(f"=== MAGIC NUMBER SCAN RESULTS ===")
print(f"Files with findings: {len(results)}")
print(f"Total candidate lines: {total}")
print()

for fpath, findings in sorted(results.items()):
    print(f"\n{'='*60}")
    print(f"FILE: {fpath} ({len(findings)} candidates)")
    print(f"{'='*60}")
    for f in findings:
        print(f"  L{f['line']:4d}  val={f['value']:>12}  {f['context']}")

# Save JSON for later use
with open('/home/ubuntu/kinga-replit/scripts/magic-numbers-raw.json', 'w') as jf:
    json.dump(results, jf, indent=2)
print(f"\n\nJSON saved to scripts/magic-numbers-raw.json")
