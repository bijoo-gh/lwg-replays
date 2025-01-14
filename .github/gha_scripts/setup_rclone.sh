#!/bin/bash
set -euo pipefail

# Install rclone
sudo apt-get install rclone
mkdir -p ~/.config/rclone

# Setup configuration
echo "$RCLONE_SERVICE_ACCOUNT" | base64 -d > service-account.json
cat > ~/.config/rclone/rclone.conf << EOF
[lwg_replays_by_ce]
type = drive
scope = drive.readonly
service_account_file = service-account.json
root_folder_id = 1AeRCATKwpiD87BxAnOpwRZca-IMtg6Ed
EOF
