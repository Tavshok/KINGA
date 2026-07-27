#!/usr/bin/env python3
"""
Patch stage-7-unified.ts to add the direction contradiction flag logic
after the Promise.all block and before the return statement.
"""

import re

path = '/home/ubuntu/kinga-replit/server/pipeline-v2/stage-7-unified.ts'

with open(path, 'r') as f:
    content = f.read()

# The marker we inserted (just the comment header with dashes, truncated)
# We need to replace everything from "// -- Signal 2..." up to "  return {"
# with the full implementation

# Find the Signal 2 comment block
signal2_start = content.find('  // \u2500\u2500 Signal 2: Direction Contradiction Flag')
if signal2_start == -1:
    # Try the ASCII version that was actually inserted
    signal2_start = content.find('  // Signal 2: Direction Contradiction Flag')
    if signal2_start == -1:
        print("ERROR: Could not find Signal 2 marker")
        exit(1)

# Find the return statement after it
return_idx = content.find('\n  return {', signal2_start)
if return_idx == -1:
    print("ERROR: Could not find return statement after Signal 2 marker")
    exit(1)

# The replacement: full direction contradiction logic + return
replacement = '''  // -- Signal 2: Direction Contradiction Flag --
  // Compare narrative-implied direction against physics-classified direction.
  // This is a data-quality signal, not a fraud flag on its own.
  let directionContradictionFlag: {
    narrativeDirection: string | null;
    physicsDirection: string | null;
    contradicts: boolean;
    explanation: string;
  } | null = null;

  try {
    const narrativeDir: string | null =
      (narrativeAnalysis as any)?.extracted_facts?.implied_direction ?? null;
    const physicsDir: string | null =
      (physicsResult as any)?.data?.physicsAnalysis?.collisionDirection ?? null;

    if (narrativeDir && physicsDir) {
      // Normalise to lowercase tokens for comparison
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
      const nDir = norm(narrativeDir);
      const pDir = norm(physicsDir);

      // Direction families: front, rear, side (left/right), rollover, unknown
      const family = (d: string): string => {
        if (d.includes('front') || d.includes('head')) return 'front';
        if (d.includes('rear') || d.includes('back')) return 'rear';
        if (d.includes('side') || d.includes('left') || d.includes('right') || d.includes('lateral')) return 'side';
        if (d.includes('roll')) return 'rollover';
        return 'unknown';
      };

      const nFamily = family(nDir);
      const pFamily = family(pDir);

      const contradicts =
        nFamily !== 'unknown' &&
        pFamily !== 'unknown' &&
        nFamily !== pFamily;

      directionContradictionFlag = {
        narrativeDirection: narrativeDir,
        physicsDirection: physicsDir,
        contradicts,
        explanation: contradicts
          ? `Narrative implies ${narrativeDir} impact but physics engine classified ${physicsDir}. ` +
            `This may indicate a multi-impact event, misidentified impact zone, or narrative inaccuracy. ` +
            `Manual review recommended.`
          : `Narrative direction (${narrativeDir}) is consistent with physics classification (${physicsDir}).`,
      };
    }
  } catch (err) {
    // Non-fatal: direction contradiction check is advisory only
  }

  return {'''

# Replace from signal2_start to (but not including) the '\n  return {' text
old_section = content[signal2_start:return_idx]
new_content = content[:signal2_start] + replacement + content[return_idx + len('\n  return {'):]

# Verify the replacement happened
if '// -- Signal 2: Direction Contradiction Flag --' in new_content:
    with open(path, 'w') as f:
        f.write(new_content)
    print("SUCCESS: Direction contradiction flag logic inserted")
    # Show the inserted block
    idx = new_content.find('// -- Signal 2: Direction Contradiction Flag --')
    print(new_content[idx:idx+1500])
else:
    print("ERROR: Replacement failed")
    exit(1)
