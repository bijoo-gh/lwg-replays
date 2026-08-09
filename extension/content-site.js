// Lets the replay archive know the loader is installed, so it can offer
// one-click watching instead of a download link. Runs at document_start, and
// also fires an event for pages that finish scripting before this point.
(() => {
  const api = globalThis.browser || globalThis.chrome;
  const version = api.runtime.getManifest().version;
  const announce = () => {
    document.documentElement.setAttribute('data-lwg-loader', version);
    window.dispatchEvent(new CustomEvent('lwg-loader-ready', { detail: { version } }));
  };
  announce();
  document.addEventListener('DOMContentLoaded', announce, { once: true });
})();
