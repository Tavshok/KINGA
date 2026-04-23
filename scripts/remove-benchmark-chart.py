with open('client/src/components/ForensicAuditReport.tsx', 'r') as f:
    content = f.read()

start_marker = "      {/* 3.3 Cost Benchmark Deviation"
# Find the closing })()}  followed by the 3.2 section
import re
# Match from start_marker to the closing })()}
pattern = r'      \{/\* 3\.3 Cost Benchmark Deviation.*?\}\)\(\)\}\n\n'
m = re.search(pattern, content, re.DOTALL)
if not m:
    print("ERROR: pattern not found")
    # Debug
    idx = content.find("3.3 Cost Benchmark")
    if idx >= 0:
        print(f"Found at {idx}: {repr(content[idx-5:idx+50])}")
    exit(1)

new_content = content[:m.start()] + content[m.end():]
with open('client/src/components/ForensicAuditReport.tsx', 'w') as f:
    f.write(new_content)
print(f"SUCCESS: Removed {m.end()-m.start()} chars of dead benchmark chart code")
