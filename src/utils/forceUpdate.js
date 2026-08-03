/**
 * Force the PWA to fetch the newest deployed version (Roby 8/2, after issue #22:
 * a phone clung to a stale cached copy and the user saw already-fixed bugs).
 *
 * Nuclear-but-reliable sequence:
 *   1. Unregister every service worker (kills the stale precache controller)
 *   2. Delete all CacheStorage entries (the old app shell + assets)
 *   3. Hard reload — the next load fetches fresh from the network and
 *      re-registers a fresh service worker.
 *
 * Pure-ish and injectable for tests: pass fakes for nav/cacheStore/reload.
 * @returns {Promise<{swUnregistered:number, cachesCleared:number}>}
 */
export async function forceAppUpdate(
  nav = typeof navigator !== 'undefined' ? navigator : undefined,
  cacheStore = typeof caches !== 'undefined' ? caches : undefined,
  reload = () => window.location.reload()
) {
  let swUnregistered = 0;
  let cachesCleared = 0;

  if (nav?.serviceWorker?.getRegistrations) {
    const regs = await nav.serviceWorker.getRegistrations();
    for (const reg of regs) {
      try { if (await reg.unregister()) swUnregistered++; } catch (e) { /* keep going */ }
    }
  }

  if (cacheStore?.keys) {
    const keys = await cacheStore.keys();
    for (const key of keys) {
      try { if (await cacheStore.delete(key)) cachesCleared++; } catch (e) { /* keep going */ }
    }
  }

  reload();
  return { swUnregistered, cachesCleared };
}
