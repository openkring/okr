import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';

import { addressWindowRect, drawAddressGuide, toAddressGuideSide } from './address-guide';

const A4: [number, number] = [595.28, 841.89];
const mm = (pt: number) => pt * 25.4 / 72;

describe('addressWindowRect', () => {
  it('places the left window 20 mm from the left and 50 mm from the top', () => {
    const r = addressWindowRect('left', ...A4);
    expect(mm(r.x)).toBeCloseTo(20, 1);
    expect(mm(A4[1] - r.y - r.height)).toBeCloseTo(50, 1);
    expect(mm(r.width)).toBeCloseTo(100, 1);
    expect(mm(r.height)).toBeCloseTo(45, 1);
  });

  it('mirrors the right window 20 mm from the right edge', () => {
    const r = addressWindowRect('right', ...A4);
    expect(mm(A4[0] - r.x - r.width)).toBeCloseTo(20, 1);
    expect(mm(r.x)).toBeCloseTo(90, 1);
  });
});

describe('toAddressGuideSide', () => {
  it('accepts only left and right', () => {
    expect(toAddressGuideSide('left')).toBe('left');
    expect(toAddressGuideSide('right')).toBe('right');
    expect(toAddressGuideSide('none')).toBeUndefined();
    expect(toAddressGuideSide(true)).toBeUndefined();
  });
});

describe('drawAddressGuide', () => {
  it('keeps the page count and changes the first page only on portrait', async () => {
    const doc = await PDFDocument.create();
    doc.addPage(A4);
    doc.addPage(A4);
    const src = await doc.save();
    const out = await drawAddressGuide(src, 'right');
    expect(out).not.toEqual(src);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it('leaves a landscape document untouched', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([A4[1], A4[0]]);
    const src = await doc.save();
    expect(await drawAddressGuide(src, 'left')).toBe(src);
  });
});
