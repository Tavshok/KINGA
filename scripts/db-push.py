#!/usr/bin/env python3
"""
Auto-answer drizzle-kit generate prompts by selecting 'create column' (first option)
for all rename/create questions, then run migrate.
"""
import pexpect
import sys
import os

os.chdir("/home/ubuntu/kinga-replit")

# Run drizzle-kit generate
print("=== Running drizzle-kit generate ===")
child = pexpect.spawn("npx drizzle-kit generate", timeout=120, encoding="utf-8")
child.logfile_read = sys.stdout

while True:
    try:
        # Wait for either a prompt or EOF
        index = child.expect([
            r"created or renamed from another column\?",  # Column rename question
            r"created or renamed from another table\?",   # Table rename question
            pexpect.EOF,
            pexpect.TIMEOUT
        ], timeout=60)
        
        if index == 0 or index == 1:
            # Press Enter to select first option (create)
            child.sendline("")
        elif index == 2:
            # Process finished
            break
        elif index == 3:
            print("\nTIMEOUT waiting for prompt")
            break
    except Exception as e:
        print(f"\nException: {e}")
        break

child.close()
print(f"\n=== Generate exit status: {child.exitstatus} ===")

# Run drizzle-kit migrate
print("\n=== Running drizzle-kit migrate ===")
child2 = pexpect.spawn("npx drizzle-kit migrate", timeout=120, encoding="utf-8")
child2.logfile_read = sys.stdout

child2.expect(pexpect.EOF, timeout=120)
child2.close()
print(f"\n=== Migrate exit status: {child2.exitstatus} ===")
