// Runs in the page's own JS world on littlewargame.com/play.
//
// The game can already load a replay from disk ("Replays -> Load external"):
// it makes an <input type=file>, clicks it, and parses whatever the file
// picker hands back. Everything downstream of that -- the map request, the
// playback UI -- is the game's own code.
//
// So this does not reimplement any of it. It fetches the replay, hands it to
// that same file input as if the user had picked it, and lets the game take
// over. Nothing is written to localStorage, no reload is needed, and the
// session stays logged in.
(() => {
  'use strict';

  const HASH_PARAM = 'replay';
  const UI_TIMEOUT_MS = 45000;
  // Connecting can take a while on a cold load, and the content script runs
  // long before the socket is up.
  const CONNECT_TIMEOUT_MS = 90000;

  function replayUrlFromHash() {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return null;
    const value = new URLSearchParams(hash).get(HASH_PARAM);
    return value ? value.trim() : null;
  }

  const banner = (() => {
    let el = null;
    return {
      show(message, isError) {
        if (!el) {
          el = document.createElement('div');
          el.style.cssText =
              'position:fixed;top:8px;left:50%;transform:translateX(-50%);' +
              'z-index:99999;padding:8px 14px;border-radius:4px;' +
              'font:13px/1.4 sans-serif;color:#fff;background:#2b6cb0;' +
              'box-shadow:0 2px 8px rgba(0,0,0,.4);max-width:80vw';
          document.body.appendChild(el);
        }
        el.textContent = message;
        el.style.background = isError ? '#9b2c2c' : '#2b6cb0';
      },
      hide() {
        if (el) { el.remove(); el = null; }
      },
    };
  })();

  function waitFor(test, timeoutMs) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;
      (function poll() {
        let value = null;
        // A test throws to give up early -- e.g. the game reports it cannot
        // connect, and no amount of waiting will help.
        try { value = test(); } catch (e) { return reject(e); }
        if (value) return resolve(value);
        if (Date.now() > deadline) return reject(new Error('timed out waiting for the game UI'));
        setTimeout(poll, 200);
      })();
    });
  }

  // Feed `file` to the next file input the page clicks, instead of opening the
  // native picker. The game assigns its onchange handler *after* calling
  // click(), so the handoff is deferred a turn to let that happen.
  function interceptNextFilePicker(file) {
    const original = HTMLInputElement.prototype.click;
    let spent = false;
    const restore = () => { HTMLInputElement.prototype.click = original; };

    HTMLInputElement.prototype.click = function() {
      if (spent || this.type !== 'file') return original.apply(this, arguments);
      spent = true;
      const input = this;
      setTimeout(() => {
        try {
          const transfer = new DataTransfer();
          transfer.items.add(file);
          input.files = transfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } finally {
          restore();
        }
      }, 0);
    };

    setTimeout(() => { if (!spent) restore(); }, UI_TIMEOUT_MS);
  }

  // Starting a replay leaves the lobby windows drawn on top of the game -- the
  // game only takes them down when it transitions out of the lobby itself, and
  // watching a replay is not that transition. Tuck them away for the duration
  // and put them back when playback ends, so nothing is left hidden.
  function hideLobbyDuringPlayback() {
    const ids = ['#lobbyDiv', '#lobbyChatWindow', '#playersWindow', '#gamesWindow', '#accInfoWindow'];
    const restore = [];
    for (const id of ids) {
      const el = document.querySelector(id);
      if (!el) continue;
      restore.push([el, el.style.visibility]);
      el.style.visibility = 'hidden';
    }
    if (!restore.length) return;
    const timer = setInterval(() => {
      if (document.querySelector('#replayControlWindow')?.offsetParent) return;
      clearInterval(timer);
      for (const [el, previous] of restore) el.style.visibility = previous;
    }, 1000);
  }

  // Open the Replays window and click "Load external", with the file picker
  // intercepted so the game reads our replay instead of opening a dialog.
  async function handOffToGame(file) {
    interceptNextFilePicker(file);
    const replaysButton = await waitFor(
        () => { const b = document.querySelector('#replayButton'); return b?.offsetParent ? b : null; },
        UI_TIMEOUT_MS);
    replaysButton.click();
    const loadButton = await waitFor(
        () => document.querySelector('#loadExternalReplayButton'), UI_TIMEOUT_MS);
    loadButton.click();
  }

  function replayNameFromUrl(url) {
    let name = 'replay.json';
    try {
      name = decodeURIComponent(new URL(url, location.href).pathname.split('/').pop()) || name;
    } catch (e) { /* keep the default */ }
    return name.toLowerCase().endsWith('.json') ? name : name + '.json';
  }

  async function main() {
    const url = replayUrlFromHash();
    if (!url) return;

    // If something else already started playback (e.g. the game gains native
    // support for this link format), stay out of the way.
    if (document.querySelector('#replayControlWindow')?.offsetParent) return;

    banner.show('Loading replay…');
    try {
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) throw new Error(`could not fetch the replay (HTTP ${response.status})`);
      const text = await response.text();

      const replay = JSON.parse(text);
      if (!replay || typeof replay.map !== 'string' || !Array.isArray(replay.players)) {
        throw new Error('that file does not look like a replay');
      }

      // Loading a replay makes the game ask its server for the map, so the
      // socket has to be up first -- acting too early only earns a Connection
      // Error. The game shows #lobbyDiv exactly when it is connected and
      // sitting in the lobby, which is the state we need.
      // (Do not read #NoConnectionWindow to detect trouble: the game leaves a
      // collapsed one in the DOM after any transient startup hiccup, so it is
      // present and "visible" even on a perfectly healthy connection.)
      banner.show('Waiting for the game to connect…');
      await waitFor(() => document.querySelector('#lobbyDiv')?.offsetParent || null,
                    CONNECT_TIMEOUT_MS);

      banner.show(`Loading ${replay.map}…`);
      const file = new File([text], replayNameFromUrl(url), { type: 'application/json' });
      await handOffToGame(file);

      await waitFor(() => document.querySelector('#replayControlWindow')?.offsetParent || null,
                    UI_TIMEOUT_MS);
      banner.hide();
      hideLobbyDuringPlayback();
    } catch (err) {
      banner.show(`Replay loader: ${err.message}`, true);
      console.error('[LWG Replay Loader]', err);
    }
  }

  main();
})();
