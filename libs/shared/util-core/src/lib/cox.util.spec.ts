import { describe, expect, it } from 'vitest';
import { boatHasCox, canHaveCox } from './cox.util';

describe('canHaveCox', () => {
  it('is true for a rowing 8x only', () => {
    expect(canHaveCox('rboat', 'b8x')).toBe(true);
    expect(canHaveCox('rboat', 'b8p')).toBe(false);
    expect(canHaveCox('rboat', 'b4x')).toBe(false);
    expect(canHaveCox('boat', 'b8x')).toBe(false);
    expect(canHaveCox(undefined, undefined)).toBe(false);
  });
});

describe('boatHasCox', () => {
  it('needs an 8x with the checkmark', () => {
    expect(boatHasCox({ type: 'rboat', subType: 'b8x', hasCox: true })).toBe(true);
    expect(boatHasCox({ type: 'rboat', subType: 'b8x', hasCox: false })).toBe(false);
  });

  it('treats a legacy doc without the field as no cox', () => {
    expect(boatHasCox({ type: 'rboat', subType: 'b8x' } as never)).toBe(false);
    expect(boatHasCox(undefined)).toBe(false);
  });

  it('ignores a stale checkmark after the type changed', () => {
    expect(boatHasCox({ type: 'rboat', subType: 'b4x', hasCox: true })).toBe(false);
  });
});
