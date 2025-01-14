#!/bin/bash
set -euo pipefail

cd lwg-replay-indexer
poetry install
poetry run index-replays ../docs/replays/ ../docs/replays/index.json
cd ..
