#!/usr/bin/env python3
"""Add calibration rationale comment to grade band constants in claimQualityScorer.ts."""
import re

path = "server/pipeline-v2/claimQualityScorer.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = ('/** Minimum overall score for grade A */\n'
       'const GRADE_A_MIN = 85;\n'
       '/** Minimum overall score for grade B */\n'
       'const GRADE_B_MIN = 70;\n'
       '/** Minimum overall score for grade C */\n'
       'const GRADE_C_MIN = 55;\n'
       '/** Minimum overall score for grade D */\n'
       'const GRADE_D_MIN = 40;')

new = ('// CALIBRATION: origin unknown, do not change without benchmarking.\n'
       '// These bands map the 0\u2013100 overall score to a letter grade shown in the\n'
       '// portal and used in the decision recommendation engine. The thresholds\n'
       '// were set during initial development and have not been validated against\n'
       '// a labelled dataset. If the grade distribution in production is skewed\n'
       '// (e.g. most claims grade C or below), recalibrate against a sample of\n'
       '// manually-reviewed claims before adjusting.\n'
       '/** Minimum overall score for grade A (CALIBRATION: engineering-judgment) */\n'
       'const GRADE_A_MIN = 85;\n'
       '/** Minimum overall score for grade B (CALIBRATION: engineering-judgment) */\n'
       'const GRADE_B_MIN = 70;\n'
       '/** Minimum overall score for grade C (CALIBRATION: engineering-judgment) */\n'
       'const GRADE_C_MIN = 55;\n'
       '/** Minimum overall score for grade D (CALIBRATION: engineering-judgment) */\n'
       'const GRADE_D_MIN = 40;')

if old in content:
    content = content.replace(old, new, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("PATCHED: grade band calibration comment added")
else:
    print("ERROR: target text not found")
