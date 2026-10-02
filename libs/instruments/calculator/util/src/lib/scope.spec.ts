import { describe, expect, it } from 'vitest';
import { PFX } from './scope';

describe('scope', () => {
  it('mirrors the lib path', () => {
    expect(PFX).toBe('@instruments/calculator/util.');
  });
});
