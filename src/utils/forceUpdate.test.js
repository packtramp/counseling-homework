import { describe, it, expect, vi } from 'vitest';
import { forceAppUpdate } from './forceUpdate';

// The "Get latest version" Settings button (8/2, issue #22: stale cached PWA
// showed already-fixed bugs). Must unregister SWs, clear caches, then reload.
describe('forceAppUpdate', () => {
  it('unregisters all service workers, clears all caches, reloads', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const nav = { serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }, { unregister }]) } };
    const cacheStore = { keys: vi.fn().mockResolvedValue(['a', 'b', 'c']), delete: vi.fn().mockResolvedValue(true) };
    const reload = vi.fn();
    const res = await forceAppUpdate(nav, cacheStore, reload);
    expect(res).toEqual({ swUnregistered: 2, cachesCleared: 3 });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads when SW/caches APIs are unavailable (old browsers)', async () => {
    const reload = vi.fn();
    const res = await forceAppUpdate(undefined, undefined, reload);
    expect(res).toEqual({ swUnregistered: 0, cachesCleared: 0 });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('keeps going when one unregister/delete throws', async () => {
    const nav = { serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([
      { unregister: vi.fn().mockRejectedValue(new Error('boom')) },
      { unregister: vi.fn().mockResolvedValue(true) }
    ]) } };
    const cacheStore = { keys: vi.fn().mockResolvedValue(['x']), delete: vi.fn().mockRejectedValue(new Error('boom')) };
    const reload = vi.fn();
    const res = await forceAppUpdate(nav, cacheStore, reload);
    expect(res.swUnregistered).toBe(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
