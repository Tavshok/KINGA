#!/bin/bash
# Auto-answer drizzle-kit generate prompts with "create column" (first option)
# by piping multiple newlines to stdin
cd /home/ubuntu/kinga-replit

# Use expect-like approach with yes/printf to auto-answer
printf '\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n' | npx drizzle-kit generate 2>&1

echo "---GENERATE DONE---"

npx drizzle-kit migrate 2>&1

echo "---MIGRATE DONE---"
