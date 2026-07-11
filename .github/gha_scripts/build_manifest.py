"""Merge rclone lsjson listings into the sync manifest the indexer reads.

Usage: build_manifest.py MANIFEST REMOTE PREFIX LISTING [REMOTE PREFIX LISTING ...]

Each (REMOTE, PREFIX, LISTING) triple is one synced Drive folder: LISTING is
the output of `rclone lsjson -R --files-only REMOTE`, and PREFIX is where that
folder lives relative to docs/replays/. Drive's ModTime recorded here is the
authoritative replay date; filesystem mtimes do not survive CI checkouts.
"""
import json
import sys


def main() -> None:
    manifest_path = sys.argv[1]
    triples = sys.argv[2:]
    if not triples or len(triples) % 3:
        sys.exit(__doc__)

    sources = []
    for i in range(0, len(triples), 3):
        remote, prefix, listing_path = triples[i:i + 3]
        with open(listing_path, 'r', encoding='utf-8') as f:
            files = json.load(f)
        sources.append({'remote': remote, 'prefix': prefix, 'files': files})
        print(f"{remote} -> {prefix}: {len(files)} files")

    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump({'sources': sources}, f, indent=1)


if __name__ == '__main__':
    main()
