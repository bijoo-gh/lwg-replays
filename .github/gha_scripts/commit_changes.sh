#!/bin/bash
set -euo pipefail

git config --global user.name 'GitHub Action'
git config --global user.email 'action@github.com'
git add docs/replays/
git diff --staged --quiet || (git commit -m "Update replay files and index [skip ci]" && git push)
