import { describe, expect, it } from 'vitest';

import { encodeQr } from './qr-encoder';

describe('encodeQr', () => {
  it('produces a square module matrix of the reported size', () => {
    const qr = encodeQr('https://app.seeclub.org/s/qr/Ab3xK9');
    expect(qr.modules).toHaveLength(qr.size);
    for (const row of qr.modules) expect(row).toHaveLength(qr.size);
  });

  it('sizes the symbol as 4 * version + 17', () => {
    const qr = encodeQr('HELLO');
    expect((qr.size - 17) % 4).toBe(0);
    expect(qr.size).toBeGreaterThanOrEqual(21);   // version 1
    expect(qr.size).toBeLessThanOrEqual(177);     // version 40
  });

  it('draws the three finder patterns — dark 7x7 rings at the corners', () => {
    const { modules, size } = encodeQr('https://app.seeclub.org/s/qr/Ab3xK9');
    for (const [oy, ox] of [[0, 0], [0, size - 7], [size - 7, 0]] as const) {
      expect(modules[oy][ox]).toBe(true);          // outer ring
      expect(modules[oy + 1][ox + 1]).toBe(false); // white separator ring
      expect(modules[oy + 3][ox + 3]).toBe(true);  // 3x3 core
    }
  });

  it('keeps the fixed dark module at (4*version+9, 8)', () => {
    const qr = encodeQr('HELLO');
    const version = (qr.size - 17) / 4;
    expect(qr.modules[4 * version + 9][8]).toBe(true);
  });

  it('grows the symbol for a higher error correction level', () => {
    const text = 'https://app.seeclub.org/s/qr/Ab3xK9';
    expect(encodeQr(text, 'H').size).toBeGreaterThanOrEqual(encodeQr(text, 'M').size);
  });

  it('is deterministic — the same text and level give the same matrix', () => {
    const a = encodeQr('https://app.seeclub.org/s/qr/Ab3xK9', 'M');
    const b = encodeQr('https://app.seeclub.org/s/qr/Ab3xK9', 'M');
    expect(a.modules).toEqual(b.modules);
  });

  it('encodes an empty string rather than throwing', () => {
    expect(encodeQr('').size).toBe(21);
  });

  it('throws when the text exceeds the largest symbol', () => {
    expect(() => encodeQr('x'.repeat(8000), 'H')).toThrowError(/too long|capacity/i);
  });
});
