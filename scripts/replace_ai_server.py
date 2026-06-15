#!/usr/bin/env python3
"""Replace user-visible 'AI' labels in server-side files."""

REPLACEMENTS = {
    "/home/ubuntu/kinga-replit/server/assessment-processor.ts": [
        ("label: 'AI Component Estimate'", "label: 'KINGA Component Estimate'"),
        ("description: 'Sum of individual component repair/replace estimates by AI'",
         "description: 'Sum of individual component repair/replace estimates by KINGA'"),
    ],
    "/home/ubuntu/kinga-replit/server/assessment-processor.test.ts": [
        ("if (aiEstimate > 0) quotes.push({ label: 'AI', amount: aiEstimate, source: 'KINGA', type: 'ai' });",
         "if (aiEstimate > 0) quotes.push({ label: 'KINGA', amount: aiEstimate, source: 'KINGA', type: 'ai' });"),
    ],
    "/home/ubuntu/kinga-replit/server/claim-lifecycle-e2e.test.ts": [
        ("changeDescription: `AI optimisation completed.",
         "changeDescription: `KINGA optimisation completed."),
    ],
    "/home/ubuntu/kinga-replit/server/claim-pdf-export.ts": [
        ("The AI causal analysis identified", "The KINGA causal analysis identified"),
        ('<h2 class="section-title">AI Quote Optimisation Summary</h2>',
         '<h2 class="section-title">KINGA Quote Optimisation Summary</h2>'),
        ('<div class="opt-metric-label">AI Recommended Repairer</div>',
         '<div class="opt-metric-label">KINGA Recommended Repairer</div>'),
        ('<h3 class="section-subtitle">AI Narrative Summary</h3>',
         '<h3 class="section-subtitle">KINGA Narrative Summary</h3>'),
        ('<div class="report-subtitle">KINGA AI — Insurer Export</div>',
         '<div class="report-subtitle">KINGA — Insurer Export</div>'),
        ("No AI optimisation performed.", "No KINGA optimisation performed."),
        ("AI Quote Optimisation Summary", "KINGA Quote Optimisation Summary"),
    ],
    "/home/ubuntu/kinga-replit/server/claim-pdf-export.test.ts": [
        ('expect(text).toBe("No AI optimisation performed.")',
         'expect(text).toBe("No KINGA optimisation performed.")'),
        ('expect(text).toBe("AI Quote Optimisation Summary")',
         'expect(text).toBe("KINGA Quote Optimisation Summary")'),
    ],
    "/home/ubuntu/kinga-replit/server/continuous-learning.ts": [
        ('sourceALabel: "AI Prediction"', 'sourceALabel: "KINGA Prediction"'),
    ],
    "/home/ubuntu/kinga-replit/server/cost-extraction-engine.ts": [
        ("source_label: `Component-based estimate (${severity} severity, no quote or AI extraction available)`",
         "source_label: `Component-based estimate (${severity} severity, no quote or KINGA extraction available)`"),
    ],
}

total = 0
for filepath, rules in REPLACEMENTS.items():
    try:
        with open(filepath, "r") as f:
            content = f.read()
        original = content
        for old, new in rules:
            if old in content:
                content = content.replace(old, new)
                total += 1
                print(f"  ✅ {filepath.split('/')[-1]}: {old[:60]}...")
            else:
                print(f"  ⚠ NOT FOUND in {filepath.split('/')[-1]}: {old[:60]}...")
        if content != original:
            with open(filepath, "w") as f:
                f.write(content)
    except FileNotFoundError:
        print(f"  ❌ File not found: {filepath}")

print(f"\n✅ Done: {total} replacements")
