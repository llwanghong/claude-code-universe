#!/bin/bash
# Check what changed in upstream book since our last translation
# Compares the translation base commit against current upstream HEAD
set -euo pipefail

cd "$(dirname "$0")/.."

BOOK_UPSTREAM="upstream/claude-code-from-source"
TRANSLATION_BASE="a6d5e45"  # Last translation sync commit

echo "=== Translation Sync Check ==="
echo "Translation base commit: $TRANSLATION_BASE"
echo ""

cd "$BOOK_UPSTREAM"
CURRENT=$(git rev-parse HEAD)
echo "Current upstream HEAD: $CURRENT"
echo ""

# Check if there are new commits since translation base
NEW_COMMITS=$(git log --oneline "$TRANSLATION_BASE..HEAD" 2>/dev/null | wc -l | tr -d ' ')
if [ "$NEW_COMMITS" -eq 0 ]; then
  echo "✅ No new upstream commits since last translation. All book-zh files are current."
  exit 0
fi

echo "⚠️  $NEW_COMMITS new upstream commit(s) since last translation:"
echo ""
git log --oneline "$TRANSLATION_BASE..HEAD"
echo ""

# Show which book files changed
echo "--- Changed book files ---"
CHANGED_FILES=$(git diff --name-only "$TRANSLATION_BASE" HEAD -- book/ 2>/dev/null)
if [ -z "$CHANGED_FILES" ]; then
  echo "(no book files changed — only non-book files)"
  exit 0
fi

echo "$CHANGED_FILES"
echo ""

# For each changed English file, show corresponding Chinese file
echo "--- Files needing translation update ---"
for eng_file in $CHANGED_FILES; do
  base=$(basename "$eng_file")
  zh_file="../../book-zh/$base"
  echo ""
  echo "  EN: $eng_file"
  echo "  ZH: $zh_file"
  if [ -f "$zh_file" ]; then
    echo "  Status: ⚠️  needs review"
    echo "  Diff (summary):"
    git diff --stat "$TRANSLATION_BASE" HEAD -- "$eng_file"
  else
    echo "  Status: 🔴 Chinese translation missing!"
  fi
done

echo ""
echo "=== To update ==="
echo "1. Review the diffs above"
echo "2. Update book-zh/*.md with new content"
echo "3. Update TRANSLATION_BASE commit in book-zh/TRANSLATION_LOG.md"
echo "4. Commit: 'docs: sync book-zh with upstream ($CURRENT)'"
