#!/bin/bash
set -euo pipefail

RCLONE_CONFIG="$GITHUB_WORKSPACE/.rclone/rclone.conf"
TARGET_DIR="$GITHUB_WORKSPACE/docs/replays/ce_replay_folder/CE Replay Folder"

# For local testing, create a mock GITHUB_OUTPUT if it doesn't exist
if [[ -z "${GITHUB_OUTPUT:-}" ]]; then
    GITHUB_OUTPUT="/tmp/github_output"
    export GITHUB_OUTPUT
fi

echo "=== Debug Information ==="
echo "Current directory: $(pwd)"
echo "Using rclone config: $RCLONE_CONFIG"
echo "Target directory: $TARGET_DIR"
echo "========================"

# Create output directory if it doesn't exist
mkdir -p "$TARGET_DIR"

# Do a dry run first to check for differences
echo "=== Performing Dry Run ==="
# Just use the remote name, the root_folder_id in config handles the rest
CHANGES=$(rclone --config="$RCLONE_CONFIG" --dry-run sync "lwg_replays_by_ce:" "$TARGET_DIR" 2>&1 || true)

# Debug output
echo "Dry run output:"
echo "$CHANGES"
echo "========================"

if [ -n "$CHANGES" ]; then
    echo "Changes detected"
    echo "changes_detected=true" >> "$GITHUB_OUTPUT"
    
    echo "=== Performing Sync ==="
    # Actually perform the sync since changes were found
    rclone --config="$RCLONE_CONFIG" sync "lwg_replays_by_ce:" "$TARGET_DIR" --progress --verbose
    
    # Debug output after sync
    echo "=== Directory Contents After Sync ==="
    ls -la "$TARGET_DIR"
    echo "Total files: $(find "$TARGET_DIR" -type f | wc -l)"
    echo "========================"
else
    echo "No changes detected"
    echo "changes_detected=false" >> "$GITHUB_OUTPUT"
    
    echo "=== Current Directory Contents ==="
    ls -la "$TARGET_DIR"
    echo "Total files: $(find "$TARGET_DIR" -type f | wc -l)"
    echo "========================"
fi
