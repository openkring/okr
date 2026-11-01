import { describe, expect, it } from 'vitest';
import { cleanOcrText, isReadableBlock, LIVE_MAX_BLOCKS, pendingTexts, toView, visibleRect } from './translator-overlay';

describe('visibleRect', () => {
  it('crops the sides of a landscape frame in a portrait view', () => {
    // 1920×1080 frame, 390×844 view: scale = 844/1080, visible width = 390/scale = 499
    const r = visibleRect(1920, 1080, 390, 844);
    expect(r.h).toBeCloseTo(1080);
    expect(r.w).toBeCloseTo(499.05, 1);
    expect(r.x).toBeCloseTo((1920 - 499.05) / 2, 1);
    expect(r.y).toBeCloseTo(0);
  });
  it('shrinks around the centre with digital zoom', () => {
    const r = visibleRect(1000, 1000, 500, 500, 2);
    expect(r).toEqual({ x: 250, y: 250, w: 500, h: 500 });
  });
  it('treats zoom below 1 as 1', () => {
    expect(visibleRect(1000, 1000, 500, 500, 0.5)).toEqual({ x: 0, y: 0, w: 1000, h: 1000 });
  });
  it('is empty for an empty frame or view', () => {
    expect(visibleRect(0, 1080, 390, 844)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe('toView', () => {
  it('scales a box from the crop into the view', () => {
    expect(toView({ x: 10, y: 20, w: 100, h: 50 }, { x: 0, y: 0, w: 500, h: 1000 }, 250, 500))
      .toEqual({ x: 5, y: 10, w: 50, h: 25 });
  });
});

describe('cleanOcrText', () => {
  it('joins hyphenated line breaks and collapses whitespace', () => {
    expect(cleanOcrText('Bahn-\nhof  geschlossen\n')).toBe('Bahnhof geschlossen');
  });
});

describe('isReadableBlock', () => {
  it('drops low confidence and letterless noise', () => {
    expect(isReadableBlock('Ausgang', 85)).toBe(true);
    expect(isReadableBlock('Ausgang', 40)).toBe(false);
    expect(isReadableBlock('| —', 95)).toBe(false);
    expect(isReadableBlock('A', 95)).toBe(false);
  });
});

describe('pendingTexts', () => {
  it('keeps only new texts, once each', () => {
    expect(pendingTexts(['a1', 'b2', 'a1', 'c3'], new Set(['b2']))).toEqual(['a1', 'c3']);
  });
  it('stops at the block and character limits', () => {
    const many = Array.from({ length: 30 }, (_, i) => `text ${i}`);
    expect(pendingTexts(many, new Set())).toHaveLength(LIVE_MAX_BLOCKS);
    expect(pendingTexts(['x'.repeat(1500), 'y'.repeat(600), 'z'], new Set())).toEqual(['x'.repeat(1500)]);
  });
});
