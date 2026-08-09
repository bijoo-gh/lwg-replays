// Content scripts run in an isolated world, so patching the page's own
// HTMLInputElement.prototype from here would be invisible to the game. Inject
// the loader as a page script instead.
(() => {
  const api = globalThis.browser || globalThis.chrome;
  const script = document.createElement('script');
  script.src = api.runtime.getURL('lwg-loader.js');
  script.async = false;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
})();
