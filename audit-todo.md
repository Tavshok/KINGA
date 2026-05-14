# KINGA System Comprehensive Audit

## Cost Extraction & Optimisation
- [ ] Vision fallback wired into stage-3 for all-zero price quotes
- [ ] $0 price exclusion in buildCompositeQuote
- [ ] Zone mapping populates correctly (not dashes)
- [ ] Advisory tables: quotedNotDamaged and damagedNotQuoted populate with real data
- [ ] KINGA Optimised total reflects real best prices (not $0 picks)
- [ ] L3 Market Benchmark populated

## Physics / Structural Analysis
- [ ] Stage-6 structural analysis output verified
- [ ] Physics fields render in report (not dashes/empty)
- [ ] Structural integrity score populates

## Fraud Detection
- [ ] Stage-7 fraud signals populate
- [ ] Fraud indicators render in report
- [ ] Fraud risk level and confidence score correct

## Report Fields
- [ ] Claim reference / claim number
- [ ] Insurer name
- [ ] Claimant / policyholder name
- [ ] Vehicle details (make, model, reg)
- [ ] Damage zones (not dashes)
- [ ] Policy number
- [ ] Report date
- [ ] Estimated cost
- [ ] Damaged-Not-Quoted: estimated cost, source, probability columns populated
- [ ] Quoted-Not-Damaged: repairer, quoted amount, flag columns populated

## Pipeline Reliability
- [ ] No silent failures at any stage
- [ ] All stages log errors properly
- [ ] Recovery job handles all stuck states
- [ ] Large PDFs (4MB+) process without timeout
