import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureMessage = vi.fn();
vi.mock('@sentry/angular', () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}));

type Module = typeof import('./startup-timing');

/**
 * The stall check must tell a stalled boot from a suspended one. Both look the same to a
 * setTimeout callback — "the app is not ready" — the only difference is how late the timer ran.
 * Fake timers drive setTimeout; `clock` is the injected wall clock, advanced by hand to
 * simulate a suspend the timer cannot see.
 *
 * The module is re-imported per test: it reports a stall at most once per page load, and a
 * spec file is one page load.
 */
describe('armStartupStallCheck', () => {
  let wall = 0;
  let mod: Module;
  const clock = () => wall;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    mod = await import('./startup-timing');
    wall = 0;
    captureMessage.mockClear();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
  afterEach(() => vi.useRealTimers());

  /** Let the pending timer fire with the wall clock advanced by `elapsed`, then flush the report. */
  const fire = async (elapsed: number): Promise<void> => {
    wall += elapsed;
    await vi.advanceTimersByTimeAsync(mod.STARTUP_STALL_MS);
  };

  it('does nothing when the app became ready in time', async () => {
    mod.armStartupStallCheck(() => true, () => 'user-doc', clock);
    await fire(mod.STARTUP_STALL_MS);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('reports the open gate when the timer fired on schedule and the app is not ready', async () => {
    mod.armStartupStallCheck(() => false, () => 'user-doc', clock);
    await fire(mod.STARTUP_STALL_MS);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][0]).toBe('startup stalled at user-doc');
  });

  it('re-arms instead of reporting when the timer overshot (a suspend, SCS-AR)', async () => {
    mod.armStartupStallCheck(() => false, () => 'user-doc', clock);
    await fire(41 * 60_000); // the timer ran 41 minutes late
    expect(captureMessage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1); // a fresh window is pending
  });

  it('reports on the re-armed window if the boot is still not ready after a real wait', async () => {
    mod.armStartupStallCheck(() => false, () => 'session-restore', clock);
    await fire(41 * 60_000);
    await fire(mod.STARTUP_STALL_MS);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][0]).toBe('startup stalled at session-restore');
  });

  it('stays silent when the boot finished during the re-armed window', async () => {
    let ready = false;
    mod.armStartupStallCheck(() => ready, () => 'user-doc', clock);
    await fire(41 * 60_000);
    ready = true;
    await fire(mod.STARTUP_STALL_MS);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('re-arms instead of reporting when the open gate moved on (progress, SCS-AW)', async () => {
    let gate = 'session-restore';
    mod.armStartupStallCheck(() => false, () => gate, clock);
    gate = 'categories'; // auth restored + user doc read while the window was running
    await fire(mod.STARTUP_STALL_MS);
    expect(captureMessage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('reports the gate that stayed open for a full window of its own', async () => {
    let gate = 'session-restore';
    mod.armStartupStallCheck(() => false, () => gate, clock);
    gate = 'categories';
    await fire(mod.STARTUP_STALL_MS);
    await fire(mod.STARTUP_STALL_MS);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][0]).toBe('startup stalled at categories');
  });

  it('gives up re-arming after the cap so a throttled tab cannot hide a stall forever', async () => {
    mod.armStartupStallCheck(() => false, () => 'categories', clock);
    for (let i = 0; i <= mod.STARTUP_STALL_MAX_REARMS; i++) await fire(10 * mod.STARTUP_STALL_MS);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
