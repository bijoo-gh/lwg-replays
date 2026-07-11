#!/bin/bash
set -euo pipefail

git add -A docs/replays

# The index timestamp changes every run; only commit when replay files or the
# index minus that line actually changed.
CHANGED=false
git diff --cached --quiet -- "docs/replays/ce_replay_folder" || CHANGED=true
git diff --cached --quiet -- "docs/replays/.sync-manifest.json" || CHANGED=true
git diff --cached --quiet -I '"timestamp":' -- docs/replays/index.json || CHANGED=true

if [ "$CHANGED" = false ]; then
    echo "No real changes; skipping commit"
    exit 0
fi

git config --global user.name 'GitHub Action'
git config --global user.email 'action@github.com'
git commit -m "Update replay files and index [skip ci]"
git push
echo "Pushed $(git rev-parse --short HEAD)"
