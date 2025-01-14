#!/bin/bash

# Set up environment variables like in GitHub Actions
export GITHUB_WORKSPACE="/github/workspace"
export RCLONE_SERVICE_ACCOUNT=$(base64 -w 0 lwg-replays-1736763568731-e868f8f9d825.json)

# Run the container with similar mounts and environment as GitHub Actions
docker run --rm -it \
  -v "$(pwd):${GITHUB_WORKSPACE}" \
  -e GITHUB_WORKSPACE \
  -e RCLONE_SERVICE_ACCOUNT \
  --workdir "${GITHUB_WORKSPACE}" \
  --user root \
  --entrypoint sh \
  rclone/rclone:1.53 \
  -c '
    # Install bash (Alpine container)
    apk add --no-cache bash

    # Run the same steps as in the workflow
    bash .github/gha_scripts/setup_rclone.sh
    
    # Test configuration
    echo "Testing rclone configuration..."
    rclone --config=$GITHUB_WORKSPACE/.rclone/rclone.conf config show
    
    echo "Testing rclone access..."
    rclone --config=$GITHUB_WORKSPACE/.rclone/rclone.conf lsd lwg_replays_by_ce:
    rclone --config=$GITHUB_WORKSPACE/.rclone/rclone.conf ls lwg_replays_by_ce:

    
    echo "Testing rclone access..."
    rclone --config=$GITHUB_WORKSPACE/.rclone/rclone.conf ls lwg_replays_by_ce:
    
    # Run the sync check
    echo "Running sync check..."
    bash .github/gha_scripts/check_and_sync.sh
  '
