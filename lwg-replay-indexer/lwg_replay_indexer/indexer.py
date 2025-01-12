import json
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, List

class ReplayIndexer:
    def __init__(self, input_dir: str, output_file: str):
        self.input_dir = Path(input_dir)
        self.output_file = Path(output_file)

    def create_index(self) -> int:
        """Create index of replay files"""
        index = {
            'last_updated': datetime.now().isoformat(),
            'replays': []
        }

        # Skip the index file itself
        output_filename = self.output_file.name
        for filepath in self.input_dir.rglob('*.json'):
            if filepath.name != output_filename:  # Skip the index file
                try:
                    replay_entry = self._process_replay_file(filepath)
                    index['replays'].append(replay_entry)
                except Exception as e:
                    print(f"Error processing {filepath}: {e}")

        self._save_index(index)
        return len(index['replays'])

    def _process_replay_file(self, filepath: Path) -> Dict:
        """Process a single replay file"""
        rel_path = filepath.relative_to(self.input_dir)
        file_stat = filepath.stat()
        
        with open(filepath, 'r', encoding='utf-8') as f:
            replay_data = json.load(f)

        return {
            'filename': filepath.name,
            'url': str(rel_path),
            'file_date': datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
            'map': replay_data.get('map'),
            'players': [
                {
                    'name': p.get('name'),
                    'team': p.get('team'),
                    'clan': p.get('clan')
                } for p in replay_data.get('players', [])
            ],
            'game_version': replay_data.get('gameVersion'),
            'tournament_info': {
                'is_tournament': any(t in str(rel_path.parent) for t in 
                    ['Cup', 'League', 'Tournament', 'Season']),
                'tournament_path': str(rel_path.parent)
            }
        }

    def _save_index(self, index: Dict) -> None:
        """Save index to file"""
        with open(self.output_file, 'w', encoding='utf-8') as f:
            json.dump(index, f, indent=2)

def main():
    """CLI entry point"""
    import argparse
    parser = argparse.ArgumentParser(description='Index LWG replay files')
    parser.add_argument('input_dir', help='Directory containing replay files')
    parser.add_argument('output_file', help='Output index file path')
    args = parser.parse_args()

    indexer = ReplayIndexer(args.input_dir, args.output_file)
    count = indexer.create_index()
    print(f"Processed {count} replay files")

if __name__ == "__main__":
    main()

