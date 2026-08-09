"""Merge rclone lsjson listings into the committed sync manifest.

Usage: build_manifest.py MANIFEST REPLAYS_ROOT REMOTE PREFIX LISTING [REMOTE PREFIX LISTING ...]

Each (REMOTE, PREFIX, LISTING) triple is one synced Drive folder: LISTING is
the output of `rclone lsjson -R --files-only REMOTE`, and PREFIX is where that
folder lives relative to REPLAYS_ROOT (docs/replays/). Drive's ModTime
recorded here is the authoritative replay date; filesystem mtimes do not
survive CI checkouts.

The collection is append-only: a file that disappears from Drive but is still
on disk keeps its previous manifest entry and gains "archived": true, so
Drive-side deletions never remove games (or their dates) from the site.

Sources with no listing on the command line (e.g. discord_replays, whose
files and dates are committed by hand) pass through unchanged: no listing
means no news, not deletion.
"""
import json
import sys
from pathlib import Path


def main() -> None:
    manifest_path = Path(sys.argv[1])
    replays_root = Path(sys.argv[2])
    triples = sys.argv[3:]
    if not triples or len(triples) % 3:
        sys.exit(__doc__)

    previous_sources = []
    if manifest_path.exists():
        with open(manifest_path, 'r', encoding='utf-8') as f:
            previous_sources = json.load(f).get('sources', [])
    previous = {src['prefix']: {e['Path']: e for e in src['files']}
                for src in previous_sources}

    sources = []
    synced_prefixes = set()
    for i in range(0, len(triples), 3):
        remote, prefix, listing_path = triples[i:i + 3]
        synced_prefixes.add(prefix)
        with open(listing_path, 'r', encoding='utf-8') as f:
            files = {e['Path']: e for e in json.load(f)}
        archived = 0
        for path, entry in previous.get(prefix, {}).items():
            if path not in files and (replays_root / prefix / path).exists():
                entry['archived'] = True
                files[path] = entry
                archived += 1
        ordered = sorted(files.values(), key=lambda e: e['Path'])
        sources.append({'remote': remote, 'prefix': prefix, 'files': ordered})
        print(f"{remote} -> {prefix}: {len(ordered)} files "
              f"({archived} archived, no longer on Drive)")

    for src in previous_sources:
        if src['prefix'] not in synced_prefixes:
            sources.append(src)
            print(f"{src['remote']} -> {src['prefix']}: "
                  f"{len(src['files'])} files (no listing; carried through)")

    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump({'sources': sources}, f, indent=1)


if __name__ == "__main__":
    main()
