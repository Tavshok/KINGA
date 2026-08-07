
import re, sys
router_name = sys.argv[1]
output_file = sys.argv[2]
lines = open("server/routers.ts").readlines()
start = None
for i, line in enumerate(lines):
    if line.strip() == f"{router_name}: router({{": 
        start = i
        break
if start is None:
    print(f"ERROR: Could not find {router_name}: router({{ in routers.ts")
    sys.exit(1)
depth = 0
end = None
for i in range(start, len(lines)):
    depth += lines[i].count("{") - lines[i].count("}")
    if depth <= 0 and i > start:
        end = i
        break
print(f"Found {router_name}: lines {start+1}-{end+1} ({end-start+1} lines)")
block_lines = lines[start:end+1]
block_content = "".join(block_lines)
block_content = re.sub(r"import\("\./", "import("../", block_content)
block_content = re.sub(r"import\('\./", "import('../", block_content)
inner_lines = block_lines[1:-1]
inner_content = "".join(inner_lines)
inner_content = re.sub(r"^  ", "", inner_content, flags=re.MULTILINE)
open(output_file, "w").write(inner_content)
print(f"Written {len(inner_content.splitlines())} lines to {output_file}")
new_lines = lines[:start] + [f"  {router_name}: {router_name}Router,
"] + lines[end+1:]
open("server/routers.ts", "w").writelines(new_lines)
print(f"routers.ts updated: {len(new_lines)} lines")
