# LWG Replay Loader

A small browser extension that lets a link open a Little War Game replay
directly in the game:

    https://littlewargame.com/play/#replay=<url-to-replay.json>

With it installed, every replay on <https://bijoo-gh.github.io/lwg-replays/>
is one click to watch instead of download-then-load-external.

This is a stopgap. The same link format has been suggested to the game's
developers ([#feature-discussion][suggestion]); if it ships natively the
extension becomes unnecessary, and the same links keep working.

[suggestion]: https://discord.com/channels/240304282241335296/1129361675045310594

## How it works

The game can already load a replay from disk: **Replays -> Load external**
makes an `<input type=file>`, clicks it, and parses whatever the picker returns.

The extension does not reimplement any of that. It fetches the replay named in
the URL hash and hands it to that same file input as if you had picked the file
yourself, then lets the game's own code take over. Consequences worth knowing:

- Nothing is written to `localStorage`, so your saved replays are untouched
  (the game's replay list is already near its storage quota).
- No page reload, so a logged-in session stays logged in.
- If playback is already running, or the hash is absent, it does nothing.

It only reads the replay: `fetch(url, {credentials: 'omit'})` from the game's
own origin, so it can only load files a host publishes with permissive CORS
headers (GitHub Pages does).

## Install

Unsigned, so both browsers load it as a temporary/unpacked add-on.

**Firefox** — `about:debugging` -> This Firefox -> Load Temporary Add-on ->
pick `manifest.json`. Firefox drops temporary add-ons on restart; a signed
build is needed to make it permanent.

**Chrome** — `chrome://extensions` -> enable Developer mode -> Load unpacked ->
pick this folder.

## Files

| File | World | Job |
| --- | --- | --- |
| `content-game.js` | isolated | injects `lwg-loader.js` into the game page |
| `lwg-loader.js` | page | the loader: fetch, validate, hand to the file input, drive the UI |
| `content-site.js` | isolated | tells the archive site the loader is present |

The injection hop in `content-game.js` is necessary: a content script's world
cannot patch the page's own `HTMLInputElement.prototype`, which is how the
file picker is intercepted.

## Site integration

`content-site.js` sets `data-lwg-loader="<version>"` on `<html>` and fires an
`lwg-loader-ready` event, so the archive can show one-click watch buttons only
when they will work:

```js
const hasLoader = () => document.documentElement.hasAttribute('data-lwg-loader');
window.addEventListener('lwg-loader-ready', enableWatchButtons);
```

## Permissions

None beyond running on two sites: `littlewargame.com/play/*` and the archive.
No `tabs`, no host permissions, no background script.
