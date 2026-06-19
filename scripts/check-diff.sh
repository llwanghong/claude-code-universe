#!/bin/bash
# Show what changed in upstream submodules since last update
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Upstream Diff Summary ==="
echo ""

for submodule in upstream/learn-claude-code upstream/claude-code-from-source; do
  echo "--- $submodule ---"
  cd "$submodule"

  # Show last 5 commits not yet in our tracked version
  git log --oneline -5

  # Show stat of pending changes
  OUR_VERSION=$(cd "$OLDPWD" && git submodule status "$submodule" | cut -d' ' -f2 | tr -d '+')
  if [ -n "$OUR_VERSION" ]; then
    echo ""
    echo "Files changed upstream since our tracked commit:"
    git diff --stat "$OUR_VERSION" HEAD 2>/dev/null || echo "(unable to compute diff)"
  fi

  cd "$OLDPWD"
  echo ""
done
