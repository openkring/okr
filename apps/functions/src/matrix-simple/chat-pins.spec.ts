import { describe, expect, it } from 'vitest';

import { applyPinOp, MAX_SHARED_PINS } from './chat-pins';

const NOW = 1_000_000;

describe('applyPinOp', () => {
  it('pins at the end and records the expiry', () => {
    expect(applyPinOp(['$a'], { $a: null }, 'pin', '$b', NOW + 10, NOW, true)).toEqual({
      pinned: ['$a', '$b'],
      expiry: { $a: null, $b: NOW + 10 },
    });
  });

  it('re-pinning keeps the position and replaces the expiry', () => {
    expect(applyPinOp(['$a', '$b'], { $a: 5 }, 'pin', '$a', null, NOW, true)).toEqual({
      pinned: ['$a', '$b'],
      expiry: { $a: null },
    });
  });

  it('unpins and drops the expiry entry', () => {
    expect(applyPinOp(['$a', '$b'], { $a: null, $b: NOW + 1 }, 'unpin', '$b', undefined, NOW, true)).toEqual({
      pinned: ['$a'],
      expiry: { $a: null },
    });
  });

  it('cleanup by a member without the right removes only expired ids', () => {
    const expiry = { $old: NOW - 1, $edge: NOW, $live: NOW + 1, $forever: null, $bad: 'x' };
    expect(applyPinOp(['$old', '$edge', '$live', '$forever', '$bad', '$none'], expiry, 'cleanup', undefined, undefined, NOW, false)).toEqual({
      pinned: ['$live', '$forever', '$bad', '$none'],
      expiry: { $live: NOW + 1, $forever: null },
    });
  });

  it('prunes expiry entries of ids that are no longer pinned', () => {
    expect(applyPinOp(['$a'], { $a: null, $gone: NOW + 5 }, 'cleanup', undefined, undefined, NOW, false)).toEqual({
      pinned: ['$a'],
      expiry: { $a: null },
    });
  });

  it('refuses pin and unpin without the right', () => {
    expect(() => applyPinOp([], {}, 'pin', '$a', null, NOW, false)).toThrow(expect.objectContaining({ code: 'permission-denied' }));
    expect(() => applyPinOp(['$a'], {}, 'unpin', '$a', undefined, NOW, false)).toThrow(expect.objectContaining({ code: 'permission-denied' }));
  });

  it('refuses a pin that has already expired or has no event', () => {
    expect(() => applyPinOp([], {}, 'pin', '$a', NOW, NOW, true)).toThrow(expect.objectContaining({ code: 'invalid-argument' }));
    expect(() => applyPinOp([], {}, 'pin', undefined, null, NOW, true)).toThrow(expect.objectContaining({ code: 'invalid-argument' }));
  });

  it('caps the number of shared pins', () => {
    const full = Array.from({ length: MAX_SHARED_PINS }, (_, i) => `$${i}`);
    expect(() => applyPinOp(full, {}, 'pin', '$new', null, NOW, true)).toThrow(expect.objectContaining({ code: 'resource-exhausted' }));
    // re-pinning an existing one is fine
    expect(applyPinOp(full, {}, 'pin', '$0', null, NOW, true).pinned).toHaveLength(MAX_SHARED_PINS);
  });
});
