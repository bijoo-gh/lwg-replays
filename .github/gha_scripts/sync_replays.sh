#!/bin/bash
set -euo pipefail

# Works on GitHub Actions and locally (defaults to the repo root).
WORKSPACE="${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")/../.." && pwd)}"
RCLONE_CONFIG="$WORKSPACE/.rclone/rclone.conf"
REPLAYS_ROOT="$WORKSPACE/docs/replays"
MANIFEST="$REPLAYS_ROOT/.sync-manifest.json"

# Source Drive folder and where it lands under docs/replays/.
# To add another Drive folder, add a remote to rclone.conf/setup_rclone.sh
# and a second sync+manifest line here.
REMOTE="lwg_replays_by_ce:"
PREFIX="ce_replay_folder/CE Replay Folder"

TARGET="$REPLAYS_ROOT/$PREFIX"
mkdir -p "$TARGET"

# copy, never sync: the collection is append-only. Replays deleted from the
# Drive folder stay on the site (their dates live on in the manifest).
echo "=== Copying $REMOTE -> $TARGET ==="
rclone --config="$RCLONE_CONFIG" copy "$REMOTE" "$TARGET" \
    --exclude ".DS_Store" --verbose

echo "=== Building sync manifest ==="
LISTING=$(mktemp)
trap 'rm -f "$LISTING"' EXIT
rclone --config="$RCLONE_CONFIG" lsjson -R --files-only \
    --exclude ".DS_Store" "$REMOTE" > "$LISTING"
python3 "$WORKSPACE/.github/gha_scripts/build_manifest.py" \
    "$MANIFEST" "$REPLAYS_ROOT" "$REMOTE" "$PREFIX" "$LISTING"

echo "Synced $(find "$TARGET" -type f | wc -l) files"
