import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, initialCalcState, pressKey, setProgBase } from './calculator.state';
import { chipsFor, disabledKeysFor, keyFromKeyboard, keypadsFor } from './calculator-view';

describe('keypadsFor', () => {
  it('lays out each profile', () => {
    const basic = keypadsFor(initialCalcState(), 'en');
    expect(basic.map(p => [p.columns, p.keys.length])).toEqual([[4, 20]]);
    const sci = keypadsFor(initialCalcState({ ...DEFAULT_SETTINGS, profile: 'scientific' }), 'en');
    expect(sci.map(p => [p.columns, p.keys.length])).toEqual([[6, 30], [4, 20]]);
    const prog = keypadsFor(initialCalcState({ ...DEFAULT_SETTINGS, profile: 'programmer' }), 'en');
    expect(prog.map(p => p.columns)).toEqual([7]);
    expect(prog[0].keys.reduce((n, k) => n + (k.span ?? 1), 0)).toBe(42);
    const conv = keypadsFor(initialCalcState({ ...DEFAULT_SETTINGS, profile: 'convert' }), 'en');
    expect(conv.map(p => p.columns)).toEqual([3]);
  });

  it('switches to the RPN keys', () => {
    const st = initialCalcState({ ...DEFAULT_SETTINGS, rpn: true, profile: 'scientific' });
    const [sci, basic] = keypadsFor(st, 'en');
    expect(sci.keys.slice(0, 2).map(k => k.id)).toEqual(['swap', 'roll']);
    expect(basic.keys.find(k => k.id === 'eq')?.label).toBe('Enter');
    expect(basic.keys.some(k => k.id === 'pct')).toBe(false);
  });

  it('shows the alternate functions after 2nd', () => {
    const st = pressKey(initialCalcState({ ...DEFAULT_SETTINGS, profile: 'scientific' }), 'second', 'en');
    const ids = keypadsFor(st, 'en')[0].keys.map(k => k.id);
    expect(ids).toContain('asin');
    expect(ids).toContain('ypowx');
    expect(ids).not.toContain('sin');
  });

  it('shows C while typing', () => {
    const st = pressKey(initialCalcState(), '5', 'en');
    expect(keypadsFor(st, 'en')[0].keys[0].label).toBe('C');
  });
});

describe('disabledKeysFor', () => {
  it('disables digits outside the base', () => {
    const st = setProgBase(initialCalcState({ ...DEFAULT_SETTINGS, profile: 'programmer' }), 8);
    expect(disabledKeysFor(st)).toEqual(expect.arrayContaining(['8', '9', 'A', 'F', 'FF']));
    expect(disabledKeysFor(st)).not.toContain('7');
    expect(disabledKeysFor(initialCalcState())).toEqual([]);
  });
});

describe('chipsFor', () => {
  it('shows RPN, angle, 2nd and memory', () => {
    const st = pressKey(initialCalcState({ ...DEFAULT_SETTINGS, rpn: true, profile: 'scientific' }), 'second', 'en');
    expect(chipsFor(st)).toEqual(['RPN', 'Deg', '2nd']);
  });
});

describe('keyFromKeyboard', () => {
  it('maps keys per profile', () => {
    expect(keyFromKeyboard('7', 'basic')).toBe('7');
    expect(keyFromKeyboard('a', 'programmer')).toBe('A');
    expect(keyFromKeyboard('a', 'basic')).toBeNull();
    expect(keyFromKeyboard('*', 'basic')).toBe('mul');
    expect(keyFromKeyboard(',', 'basic')).toBe('point');
    expect(keyFromKeyboard('Enter', 'basic')).toBe('eq');
    expect(keyFromKeyboard('%', 'basic')).toBe('pct');
    expect(keyFromKeyboard('%', 'programmer')).toBe('mod');
    expect(keyFromKeyboard('^', 'scientific')).toBe('pow');
    expect(keyFromKeyboard('^', 'basic')).toBeNull();
    expect(keyFromKeyboard('Escape', 'convert')).toBe('ac');
  });
});
