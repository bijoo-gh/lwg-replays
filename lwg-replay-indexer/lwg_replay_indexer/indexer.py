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
            'collection_info': {
                'timestamp': datetime.now().isoformat(),
                'total_replays': 0,
                'total_size': 0
            },
            'replays': []
        }

        # Skip the index file itself
        output_filename = self.output_file.name
        for filepath in self.input_dir.rglob('*.json'):
            if filepath.name != output_filename:
                try:
                    replay_entry = self._process_replay_file(filepath)
                    index['replays'].append(replay_entry)
                except Exception as e:
                    print(f"Error processing {filepath}: {e}")

        self._save_index(index)
        return len(index['replays'])

    def _extract_tournament_info(self, rel_path: Path) -> Dict:
        """Extract tournament information from path"""
        path_parts = list(rel_path.parts)
        
        # Remove the common prefix parts
        while path_parts and path_parts[0] in ['ce_replay_folder', 'CE Replay Folder']:
            path_parts.pop(0)
        
        tournament_info = {
            'is_tournament': False,
            'tournament_path': str(rel_path.parent),
            'tournament_name': None,
            'tournament_type': None,
            'season': None,
            'week': None,
            'stage': None,
            'group': None,
            'match_info': None
        }

        if not path_parts:
            return tournament_info

        # ProLeague detection
        if 'ProLeague' in path_parts:
            tournament_info.update({
                'is_tournament': True,
                'tournament_type': 'Pro League',
                'tournament_name': 'Pro League'
            })
            
            # Extract season
            season_part = next((p for p in path_parts if p.lower().startswith('season')), None)
            if season_part:
                tournament_info['season'] = season_part.split()[-1]
            
            # Extract week
            week_part = next((p for p in path_parts if p.lower().startswith('week')), None)
            if week_part:
                tournament_info['week'] = week_part.split()[-1]
                
            # Extract match info (e.g., "bly holy", "neagat wr")
            if len(path_parts) > 3:  # season/week/match_name
                match_name = path_parts[-1]
                if ' vs ' in match_name.lower() or ' ' in match_name:
                    tournament_info['match_info'] = match_name

        # Closed Event Cup detection
        elif any(p.startswith('Closed Event Cup Vol') for p in path_parts):
            cup_part = next(p for p in path_parts if p.startswith('Closed Event Cup Vol'))
            tournament_info.update({
                'is_tournament': True,
                'tournament_type': 'Closed Event Cup',
                'tournament_name': cup_part,
                'season': cup_part.split('Vol')[-1].strip()
            })

        # Global League detection
        elif 'Global Littlewargame League Replays' in path_parts:
            tournament_info.update({
                'is_tournament': True,
                'tournament_type': 'Global League',
                'tournament_name': 'Global League'
            })
            
            if 'Group Stage' in path_parts:
                tournament_info['stage'] = 'Group Stage'
                group = next((p for p in path_parts if p.startswith('Group ')), None)
                if group:
                    tournament_info['group'] = group

        # Replaypack detection
        elif any(p.startswith('CE_s Replaypack No') for p in path_parts):
            pack_part = next(p for p in path_parts if p.startswith('CE_s Replaypack No'))
            tournament_info.update({
                'is_tournament': False,
                'tournament_type': 'Replay Pack',
                'tournament_name': pack_part
            })

        # LWGFiveHundred detection
        elif 'LWGFiveHundred792023' in path_parts:
            tournament_info.update({
                'is_tournament': True,
                'tournament_type': 'LWG500',
                'tournament_name': 'LWG 500 2023'
            })

        # Showmatch detection
        elif 'showmatch' in str(rel_path).lower():
            tournament_info.update({
                'is_tournament': False,
                'tournament_type': 'Showmatch',
                'tournament_name': 'Showmatch'
            })

        return tournament_info

    def _process_replay_file(self, filepath: Path) -> Dict:
        """Process a single replay file"""
        rel_path = filepath.relative_to(self.input_dir)
        file_stat = filepath.stat()
        
        with open(filepath, 'r', encoding='utf-8') as f:
            replay_data = json.load(f)

        # Filter out spectators (team 0)
        active_players = [
            {
                'name': p.get('name'),
                'team': p.get('team'),
                'clan': p.get('clan')
            } 
            for p in replay_data.get('players', [])
            if p.get('team', 0) != 0  # Only include non-spectators
        ]

        # Extract tournament information
        tournament_info = self._extract_tournament_info(rel_path)

        return {
            'filename': filepath.name,
            'url': str(rel_path),
            'file_date': datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
            'file_size': file_stat.st_size,  # File size in bytes
            'map': replay_data.get('map'),
            'players': active_players,
            'game_version': replay_data.get('gameVersion'),
            'tournament_info': tournament_info
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

