import json
import pytest
from pathlib import Path
from lwg_replay_indexer.indexer import ReplayIndexer

def test_indexer_creates_index(tmp_path):
    # Create test replay file
    replay_dir = tmp_path / "replays"
    replay_dir.mkdir()
    
    test_replay = {
        "map": "Test Map",
        "players": [
            {"name": "Player1", "team": 1, "clan": ""}
        ],
        "gameVersion": "5.0.0"
    }
    
    replay_file = replay_dir / "test_replay.json"
    replay_file.write_text(json.dumps(test_replay))
    
    # Create index
    output_file = tmp_path / "index.json"
    indexer = ReplayIndexer(str(replay_dir), str(output_file))
    count = indexer.create_index()
    
    assert count == 1
    assert output_file.exists()
    
    # Verify content
    with open(output_file) as f:
        index = json.load(f)
    assert len(index['replays']) == 1
    assert index['replays'][0]['map'] == "Test Map"

