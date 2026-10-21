import { describe, expect, it } from 'vitest';

import { activePins, ActivePin, canUnpinEvent, expiredSharedPins, isEventPinned, isPinActive, PIN_DURATIONS, pinPreviewOf, pinUntil, unpinnableScopes, withoutPersonalPin, withPersonalPin } from './pin.util';

describe('pinUntil', () => {
  it('adds the duration to now', () => {
    expect(pinUntil('24h', 0)).toBe(86_400_000);
    expect(pinUntil('7d', 0)).toBe(604_800_000);
    expect(pinUntil('30d', 0)).toBe(2_592_000_000);
    expect(pinUntil('7d', 1000)).toBe(604_801_000);
  });

  it('never expires for forever', () => {
    expect(pinUntil('forever', 5)).toBeNull();
  });

  it('lists the durations in order', () => {
    expect(PIN_DURATIONS).toEqual(['24h', '7d', '30d', 'forever']);
  });
});

describe('isPinActive', () => {
  it('is active strictly before until', () => {
    expect(isPinActive(1000, 1000)).toBe(false);
    expect(isPinActive(1001, 1000)).toBe(true);
  });

  it('is active without an expiry', () => {
    expect(isPinActive(null, 1000)).toBe(true);
    expect(isPinActive(undefined, 1000)).toBe(true);
  });
});

describe('activePins', () => {
  it('orders shared before personal, newest first within each', () => {
    const pins = activePins({ p1: 500, p2: null, p3: 900 }, ['s1', 's2'], undefined, 100);
    expect(pins.map((p) => `${p.scope}:${p.eventId}`)).toEqual(['shared:s2', 'shared:s1', 'personal:p2', 'personal:p3', 'personal:p1']);
    expect(pins.map((p) => p.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('carries the expiry and treats a missing shared expiry as forever', () => {
    const pins = activePins({ p: 500 }, ['s', 't'], { s: 700 }, 100);
    expect(pins.find((x) => x.eventId === 's')?.until).toBe(700);
    expect(pins.find((x) => x.eventId === 't')?.until).toBeNull();
    expect(pins.find((x) => x.eventId === 'p')?.until).toBe(500);
  });

  it('drops expired pins in both scopes', () => {
    const pins = activePins({ p: 50 }, ['s'], { s: 100 }, 100);
    expect(pins).toEqual([]);
  });

  it('lists an event pinned in both scopes twice', () => {
    const pins = activePins({ a: null }, ['a'], undefined, 0);
    expect(pins.map((p) => p.scope)).toEqual(['shared', 'personal']);
  });

  it('ignores malformed personal values', () => {
    const pins = activePins({ bad: 'x', neg: -5, ok: 200 } as Record<string, unknown>, undefined, undefined, 100);
    expect(pins.map((p) => p.eventId)).toEqual(['ok']);
  });

  it('copes with missing input', () => {
    expect(activePins(undefined, undefined, undefined, 0)).toEqual([]);
  });
});

describe('expiredSharedPins', () => {
  it('returns the shared pins whose expiry has passed', () => {
    expect(expiredSharedPins(['a', 'b'], { a: 5, b: null }, 10)).toEqual(['a']);
  });

  it('keeps pins without an expiry entry', () => {
    expect(expiredSharedPins(['a'], undefined, 10)).toEqual([]);
    expect(expiredSharedPins(undefined, { a: 1 }, 10)).toEqual([]);
  });
});

describe('withPersonalPin', () => {
  it('adds the entry and prunes expired ones', () => {
    const before = { old: 5, keep: 500, forever: null };
    expect(withPersonalPin(before, 'new', 900, 100)).toEqual({ keep: 500, forever: null, new: 900 });
    expect(before).toEqual({ old: 5, keep: 500, forever: null });
  });

  it('starts from nothing and supports forever', () => {
    expect(withPersonalPin(undefined, 'a', null, 0)).toEqual({ a: null });
  });

  it('replaces an existing entry', () => {
    expect(withPersonalPin({ a: 500 }, 'a', 900, 100)).toEqual({ a: 900 });
  });
});

describe('withoutPersonalPin', () => {
  it('removes the entry and prunes expired ones', () => {
    expect(withoutPersonalPin({ a: 500, old: 5, b: null }, 'a', 100)).toEqual({ b: null });
  });

  it('copes with missing content', () => {
    expect(withoutPersonalPin(undefined, 'a', 0)).toEqual({});
  });
});

describe('unpinnableScopes', () => {
  const pin = (eventId: string, scope: 'personal' | 'shared'): ActivePin => ({ eventId, scope, until: null, order: 0 });
  const both = [pin('$a', 'shared'), pin('$a', 'personal'), pin('$b', 'personal'), pin('$c', 'shared')];

  it('offers both scopes when pinned twice and the shared right is there', () => {
    expect(unpinnableScopes('$a', both, true)).toEqual(['shared', 'personal']);
  });

  it('drops the shared scope without the right', () => {
    expect(unpinnableScopes('$a', both, false)).toEqual(['personal']);
    expect(unpinnableScopes('$c', both, false)).toEqual([]);
  });

  it('returns the single scope a pin has', () => {
    expect(unpinnableScopes('$b', both, true)).toEqual(['personal']);
    expect(unpinnableScopes('$c', both, true)).toEqual(['shared']);
  });

  it('is empty for an unpinned event', () => {
    expect(unpinnableScopes('$x', both, true)).toEqual([]);
  });

  it('canUnpinEvent is false for a shared-only pin without the right', () => {
    expect(canUnpinEvent('$c', both, false)).toBe(false);
    expect(canUnpinEvent('$c', both, true)).toBe(true);
    expect(canUnpinEvent('$a', both, false)).toBe(true);
    expect(canUnpinEvent('$b', both, false)).toBe(true);
    expect(canUnpinEvent('$x', both, true)).toBe(false);
  });

  it('isEventPinned looks at both scopes', () => {
    expect(isEventPinned('$c', both)).toBe(true);
    expect(isEventPinned('$x', both)).toBe(false);
  });
});

describe('pinPreviewOf', () => {
  it('uses the body of a text message', () => {
    expect(pinPreviewOf('m.room.message', { msgtype: 'm.text', body: '  Hallo\n  zusammen ' }, 'Anna'))
      .toEqual({ senderName: 'Anna', snippet: 'Hallo zusammen' });
  });

  it('marks media with a clip and the file name', () => {
    expect(pinPreviewOf('m.room.message', { msgtype: 'm.file', body: 'plan.pdf' }, 'Bea')?.snippet).toBe('📎 plan.pdf');
  });

  it('shows the question of a poll', () => {
    const content = { 'org.matrix.msc3381.poll': { question: { body: 'Wann?' }, answers: [] } };
    expect(pinPreviewOf('org.matrix.msc3381.poll.start', content, 'Cem')?.snippet).toBe('Wann?');
  });

  it('is undefined for encrypted, redacted or missing content', () => {
    expect(pinPreviewOf('m.room.encrypted', { ciphertext: 'x' }, 'A')).toBeUndefined();
    expect(pinPreviewOf('m.room.message', {}, 'A')).toBeUndefined();
    expect(pinPreviewOf('m.room.message', undefined, 'A')).toBeUndefined();
  });
});
