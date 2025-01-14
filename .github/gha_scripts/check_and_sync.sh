#!/bin/bash
set -euo pipefail

# Do a dry run first to check for differences
CHANGES=$(rclone --dry-run sync lwg_replays_by_ce: "./docs/replays/ce_replay_folder/CE Replay Folder/" 2>&1)
if [ -n "$CHANGES" ]; then
    echo "Changes detected"
    echo "changes_detected=true" >> $GITHUB_OUTPUT
    # Actually perform the sync since changes were found
    rclone sync lwg_replays_by_ce: "./docs/replays/ce_replay_folder/CE Replay Folder/" --progress
else
    echo "No changes detected"
    echo "changes_detected=false" >> $GITHUB_OUTPUT
fi
