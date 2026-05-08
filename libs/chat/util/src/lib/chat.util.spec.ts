import { describe, it, expect } from 'vitest';
import { buildReceiptAriaLabel, hashUserIdToColor, formatReceiptTime } from './chat.util';

describe('buildReceiptAriaLabel', () => {
  it('returns empty string for no receipts', () => {
    expect(buildReceiptAriaLabel([])).toBe('');
  });

  it('returns single name for one receipt', () => {
    expect(buildReceiptAriaLabel([{ displayName: 'Alice' }])).toBe('Gelesen von Alice');
  });

  it('returns two names for two receipts', () => {
    expect(buildReceiptAriaLabel([
      { displayName: 'Alice' },
      { displayName: 'Bob' },
    ])).toBe('Gelesen von Alice, Bob');
  });

  it('returns overflow notation for three or more receipts', () => {
    expect(buildReceiptAriaLabel([
      { displayName: 'Alice' },
      { displayName: 'Bob' },
      { displayName: 'Carol' },
    ])).toBe('Gelesen von Alice, Bob (+1 weitere)');
  });

  it('counts overflow correctly for five receipts', () => {
    const receipts = ['Alice','Bob','Carol','Dave','Eve'].map(n => ({ displayName: n }));
    expect(buildReceiptAriaLabel(receipts)).toBe('Gelesen von Alice, Bob (+3 weitere)');
  });
});

describe('hashUserIdToColor', () => {
  it('returns a hex color string', () => {
    expect(hashUserIdToColor('@alice:example.org')).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('returns a consistent color for the same userId', () => {
    const userId = '@alice:example.org';
    expect(hashUserIdToColor(userId)).toBe(hashUserIdToColor(userId));
  });

  it('returns a value from the fixed palette (one of 8 colors)', () => {
    const COLORS = ['#e57373','#f06292','#ba68c8','#7986cb','#4fc3f7','#4db6ac','#81c784','#ffb74d'];
    expect(COLORS).toContain(hashUserIdToColor('@alice:example.org'));
  });
});

describe('formatReceiptTime', () => {
  it('includes "Gelesen" prefix', () => {
    expect(formatReceiptTime(1700000000000)).toContain('Gelesen');
  });

  it('includes HH:mm time pattern', () => {
    expect(formatReceiptTime(1700000000000)).toMatch(/\d{2}:\d{2}/);
  });
});
