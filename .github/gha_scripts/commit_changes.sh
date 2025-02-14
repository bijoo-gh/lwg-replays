#!/bin/bash
set -euo pipefail

echo "=== Checking for Real Changes ==="

# Function to get checksum of a file or directory
get_checksum() {
    if [ -d "$1" ]; then
        # For directories, checksum all files recursively
        find "$1" -type f -exec sha256sum {} + | sort | sha256sum
    else
        # For single files, if it's index.json, remove timestamp before checksum
        if [[ "$1" == *"index.json" ]]; then
            jq 'del(.collection_info.timestamp)' "$1" | sha256sum
        else
            sha256sum "$1"
        fi
    fi
}

# Check index.json changes
INDEX_PATH="docs/replays/index.json"
REPLAYS_PATH="docs/replays/ce_replay_folder/CE Replay Folder"

# Store current checksums
if [ -f "$INDEX_PATH" ]; then
    CURRENT_INDEX_CHECKSUM=$(get_checksum "$INDEX_PATH")
    echo "Current index checksum: $CURRENT_INDEX_CHECKSUM"
else
    echo "Index file doesn't exist yet"
    CURRENT_INDEX_CHECKSUM=""
fi

if [ -d "$REPLAYS_PATH" ]; then
    CURRENT_REPLAYS_CHECKSUM=$(get_checksum "$REPLAYS_PATH")
    echo "Current replays folder checksum: $CURRENT_REPLAYS_CHECKSUM"
else
    echo "Replays folder doesn't exist yet"
    CURRENT_REPLAYS_CHECKSUM=""
fi

chmod +x .github/gha_scripts/run_indexer.sh
.github/gha_scripts/run_indexer.sh

# Stage the files
git add "$INDEX_PATH" "$REPLAYS_PATH"

# Get checksums after staging
if [ -f "$INDEX_PATH" ]; then
    NEW_INDEX_CHECKSUM=$(get_checksum "$INDEX_PATH")
    echo "New index checksum: $NEW_INDEX_CHECKSUM"
else
    NEW_INDEX_CHECKSUM=""
fi

if [ -d "$REPLAYS_PATH" ]; then
    NEW_REPLAYS_CHECKSUM=$(get_checksum "$REPLAYS_PATH")
    echo "New replays folder checksum: $NEW_REPLAYS_CHECKSUM"
else
    NEW_REPLAYS_CHECKSUM=""
fi

# Check if there are real changes
INDEX_CHANGED=false
REPLAYS_CHANGED=false

if [ "$CURRENT_INDEX_CHECKSUM" != "$NEW_INDEX_CHECKSUM" ]; then
    INDEX_CHANGED=true
    echo "Index file has real changes"
fi

if [ "$CURRENT_REPLAYS_CHECKSUM" != "$NEW_REPLAYS_CHECKSUM" ]; then
    REPLAYS_CHANGED=true
    echo "Replays folder has real changes"
fi

if [ "$INDEX_CHANGED" = false ] && [ "$REPLAYS_CHANGED" = false ]; then
    echo "No real changes detected (checksums match)"
    exit 0
fi

# If we get here, there are real changes
echo -e "\n=== Changes Detected ==="
echo "Index changed: $INDEX_CHANGED"
echo "Replays changed: $REPLAYS_CHANGED"

# Configure git
git config --global user.name 'GitHub Action'
git config --global user.email 'action@github.com'

# Show what we're about to commit
echo -e "\n=== Commit Details ==="
echo "Creating commit with the following message:"

# Create and show commit message
tee commit_msg.txt << EOF
Update replay files and index [skip ci]

Changes:
$([ "$INDEX_CHANGED" = true ] && echo "- Updated index.json")
$([ "$REPLAYS_CHANGED" = true ] && echo "- Updated replay files")

Details:
- Index checksum: ${NEW_INDEX_CHECKSUM:-none}
- Replays checksum: ${NEW_REPLAYS_CHECKSUM:-none}
EOF

# Commit using the message file
git commit -F commit_msg.txt

echo -e "\n=== Pushing Changes ==="
git push

echo -e "\n=== Commit Complete ==="
echo "Commit hash: $(git rev-parse HEAD)"
