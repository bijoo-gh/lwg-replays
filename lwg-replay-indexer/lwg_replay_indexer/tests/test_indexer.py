import json
import re
from pathlib import Path

import pytest

from lwg_replay_indexer.indexer import ReplayIndexer

FIXTURE = Path(__file__).parent / 'fixtures' / 'live_index_snapshot.json'

# Paths the old categorizer got wrong; their fields are allowed to change.
BROKEN_S9 = 'draft prep proleague s9'


def make_categorizer(tmp_path):
    return ReplayIndexer(str(tmp_path), str(tmp_path / 'index.json'))


@pytest.fixture(scope='module')
def snapshot():
    with open(FIXTURE, 'r', encoding='utf-8') as f:
        return json.load(f)


@pytest.fixture()
def categorizer(tmp_path):
    return make_categorizer(tmp_path)


def write_replay(path, **overrides):
    replay = {
        'map': 'Test Map',
        'players': [{'name': 'Player1', 'team': 1, 'clan': ''}],
        'gameVersion': '5.0.0',
    }
    replay.update(overrides)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(replay))


def test_indexer_creates_index(tmp_path):
    replay_dir = tmp_path / 'replays'
    write_replay(replay_dir / 'test_replay.json')

    output_file = tmp_path / 'index.json'
    indexer = ReplayIndexer(str(replay_dir), str(output_file))
    count = indexer.create_index()

    assert count == 1
    index = json.loads(output_file.read_text())
    assert len(index['replays']) == 1
    entry = index['replays'][0]
    assert entry['map'] == 'Test Map'
    assert entry['players'] == [{'name': 'Player1', 'team': 1, 'clan': ''}]


def test_collection_totals_are_populated(tmp_path):
    replay_dir = tmp_path / 'replays'
    write_replay(replay_dir / 'a.json')
    write_replay(replay_dir / 'sub' / 'b.json')

    output_file = tmp_path / 'index.json'
    ReplayIndexer(str(replay_dir), str(output_file)).create_index()

    index = json.loads(output_file.read_text())
    info = index['collection_info']
    assert info['total_replays'] == 2
    assert info['total_size'] == sum(
        r['file_size'] for r in index['replays'])
    assert info['total_size'] > 0


def test_corrupt_replay_skipped_and_counted(tmp_path):
    replay_dir = tmp_path / 'replays'
    write_replay(replay_dir / 'good.json')
    (replay_dir / 'empty.json').write_text('')

    output_file = tmp_path / 'index.json'
    count = ReplayIndexer(str(replay_dir), str(output_file)).create_index()

    assert count == 1
    index = json.loads(output_file.read_text())
    assert index['collection_info']['skipped_files'] == 1


def test_file_date_comes_from_manifest(tmp_path):
    replay_dir = tmp_path / 'replays'
    write_replay(replay_dir / 'prefix' / 'game.json')
    manifest = {
        'sources': [{
            'remote': 'test:',
            'prefix': 'prefix',
            'files': [{'Path': 'game.json',
                       'ModTime': '2026-05-27T16:25:00.000Z',
                       'Size': 12345}],
        }]
    }
    (replay_dir / '.sync-manifest.json').write_text(json.dumps(manifest))

    output_file = tmp_path / 'index.json'
    ReplayIndexer(str(replay_dir), str(output_file)).create_index()

    index = json.loads(output_file.read_text())
    entry = index['replays'][0]
    assert entry['file_date'] == '2026-05-27T16:25:00.000Z'
    assert entry['file_size'] == 12345


def test_index_is_deterministic(tmp_path):
    replay_dir = tmp_path / 'replays'
    write_replay(replay_dir / 'z.json')
    write_replay(replay_dir / 'a' / 'x.json')

    output_file = tmp_path / 'index.json'
    ReplayIndexer(str(replay_dir), str(output_file)).create_index()
    urls = [r['url'] for r in json.loads(output_file.read_text())['replays']]
    assert urls == sorted(urls)


# --- categorizer unit cases -------------------------------------------------

CASES = [
    ('ce_replay_folder/CE Replay Folder/draft prep proleague s9/A_v_B_on_Ravaged.json',
     {'is_tournament': True, 'tournament_type': 'Pro League',
      'season': '9', 'stage': 'Draft Prep'}),
    ('ce_replay_folder/CE Replay Folder/ProLeague/ProLeague Season 8/Week2/Holy vs Neagat/g.json',
     {'is_tournament': True, 'tournament_type': 'Pro League',
      'season': '8', 'week': '2', 'match_info': 'Holy vs Neagat'}),
    ('ce_replay_folder/CE Replay Folder/ProLeague/season 3/Week5/slammerIV vs WeirdRat/g.json',
     {'is_tournament': True, 'tournament_type': 'Pro League',
      'season': '3', 'week': '5'}),
    ('ce_replay_folder/CE Replay Folder/Closed Event Cup Vol 9/Round 8/g.json',
     {'is_tournament': True, 'tournament_type': 'Closed Event Cup',
      'tournament_name': 'Closed Event Cup Vol 9', 'season': '9',
      'stage': 'Round 8'}),
    ('ce_replay_folder/CE Replay Folder/Closed Event Cup Vol 10/g.json',
     {'is_tournament': True, 'tournament_type': 'Closed Event Cup',
      'tournament_name': 'Closed Event Cup Vol 10', 'season': '10'}),
    ('ce_replay_folder/CE Replay Folder/casual_game.json',
     {'is_tournament': False, 'tournament_type': None}),
]


@pytest.mark.parametrize('url,expected', CASES)
def test_categorizer_cases(categorizer, url, expected):
    info = categorizer._extract_tournament_info(Path(url))
    for field, value in expected.items():
        assert info[field] == value, (url, field, info[field], value)


# --- regression against the full live collection ----------------------------

def test_no_proleague_without_season(categorizer, snapshot):
    for entry in snapshot:
        info = categorizer._extract_tournament_info(Path(entry['url']))
        if info['tournament_type'] == 'Pro League':
            assert info['season'] is not None, entry['url']


def test_draft_prep_s9_fully_categorized(categorizer, snapshot):
    s9 = [e for e in snapshot if BROKEN_S9 in e['url']]
    assert len(s9) > 50, 'fixture should contain the s9 draft prep replays'
    for entry in s9:
        info = categorizer._extract_tournament_info(Path(entry['url']))
        assert info['is_tournament'] is True
        assert info['tournament_type'] == 'Pro League'
        assert info['season'] == '9'
        assert info['stage'] == 'Draft Prep'


def test_no_regressions_against_live_snapshot(categorizer, snapshot):
    """New categorizer must never lose or alter a good old value.

    It may fill in fields the old code left empty (that is the point of the
    rewrite), but every non-empty value from the old categorizer must be
    preserved, except for paths/fields the old code got demonstrably wrong.
    """
    checked = 0
    for entry in snapshot:
        url = entry['url']
        old = entry['tournament_info']
        if BROKEN_S9 in url:
            continue  # old code left these completely uncategorized
        new = categorizer._extract_tournament_info(Path(url))
        for field in ('is_tournament', 'tournament_type', 'tournament_name',
                      'season', 'week', 'stage', 'group'):
            old_value = old.get(field)
            if old_value in (None, False):
                continue  # filling in blanks is an improvement, not a break
            if field == 'group' and old_value == 'Group Stage':
                continue  # old bug: group mirrored the stage folder name
            if field == 'week':
                # old bug: 'Week2' folders stored 'Week2', 'Week 5' stored '5';
                # new code normalizes both to the digits
                old_value = re.sub(r'(?i)^week\s*', '', str(old_value))
            assert new[field] == old_value, (url, field, old_value, new[field])
            checked += 1
    assert checked > 1000, 'snapshot regression should cover the collection'
