#!/bin/bash
# Update all upstream submodules to their latest versions
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Checking for upstream updates ==="
echo ""

# Update learn-claude-code
echo "--- learn-claude-code ---"
git submodule update --remote upstream/learn-claude-code
LEARN_DIFF=$(git diff --submodule upstream/learn-claude-code 2>/dev/null)
if [ -n "$LEARN_DIFF" ]; then
  echo "⚠️  learn-claude-code has updates:"
  echo "$LEARN_DIFF"
else
  echo "✅ Already up to date"
fi

echo ""

# Update claude-code-from-source
echo "--- claude-code-from-source ---"
git submodule update --remote upstream/claude-code-from-source
BOOK_DIFF=$(git diff --submodule upstream/claude-code-from-source 2>/dev/null)
if [ -n "$BOOK_DIFF" ]; then
  echo "⚠️  claude-code-from-source has updates:"
  echo "$BOOK_DIFF"
else
  echo "✅ Already up to date"
fi

echo ""
echo "=== Done ==="
echo "If submodules were updated, run: git add upstream/ && git commit -m 'chore: update upstream submodules'"
