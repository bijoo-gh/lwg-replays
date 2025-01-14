#!/bin/bash
set -euo pipefail

# Create config directory relative to workspace
mkdir -p "$GITHUB_WORKSPACE/.rclone"

# Setup configuration and service account
echo "$RCLONE_SERVICE_ACCOUNT" | base64 -d > "$GITHUB_WORKSPACE/.rclone/service-account.json"

cat > "$GITHUB_WORKSPACE/.rclone/rclone.conf" << EOF
[lwg_replays_by_ce]
type = drive
scope = drive.readonly
service_account_file = $GITHUB_WORKSPACE/.rclone/service-account.json
root_folder_id = 1AeRCATKwpiD87BxAnOpwRZca-IMtg6ED
EOF

# Debug output
echo "=== Rclone Configuration ==="
ls -la "$GITHUB_WORKSPACE/.rclone/"
cat "$GITHUB_WORKSPACE/.rclone/rclone.conf"
