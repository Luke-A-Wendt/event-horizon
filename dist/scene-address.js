// Only a built-in preset can be reconstructed from the public URL. File
// imports keep their objects and camera locally, even if based on a preset.
export function replaceSceneAddress(id, browser = window) {
 if (!browser.history?.replaceState || !browser.location?.href) return;
 const url = new URL(browser.location.href);
 if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
 if (id && url.searchParams.getAll('scene').length === 1 && url.searchParams.get('scene') === id) return;
 if (!id && !url.searchParams.has('scene')) return;
 if (id) url.searchParams.set('scene', id);
 else url.searchParams.delete('scene');
 try {
  browser.history.replaceState(browser.history.state, '', url.pathname + url.search + url.hash);
 } catch (error) {
  // Embedded viewers can prohibit history changes while still running scenes.
  if (error?.name !== 'SecurityError') throw error;
 }
}
