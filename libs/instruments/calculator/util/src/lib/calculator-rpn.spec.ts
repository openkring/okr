import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { Completed } from './calculator-domain';
import { decimalDomain } from './calculator-decimal';
import { CalcKey } from './calculator.model';
import { initRpn, pressRpn, rpnDisplay, RpnState, rpnStackView } from './calculator-rpn';

const d = decimalDomain({ angle: 'deg', locale: 'en' });

function run(keys: CalcKey[], start: RpnState<Decimal> = initRpn()) {
  let s = start;
  let last: Completed<Decimal> | null = null;
  for (const key of keys) {
    const r = pressRpn(s, key, d);
    s = r.state;
    if (r.completed) last = r.completed;
  }
  return { s, last, x: rpnDisplay(s, d), above: rpnStackView(s, d) };
}

describe('RPN engine', () => {
  it('adds two numbers', () => {
    const r = run(['3', 'eq', '4', 'add']);
    expect(r.x).toBe('7');
    expect(r.last?.expression).toBe('3 + 4');
  });

  it('evaluates a chained expression', () => {
    expect(run(['2', 'eq', '3', 'eq', '4', 'mul', 'add']).x).toBe('14');
  });

  it('shows Y, Z, T above the entry', () => {
    const r = run(['1', 'eq', '2', 'eq', '3']);
    expect(r.x).toBe('3');
    expect(r.above).toEqual(['2', '1']);
  });

  it('duplicates X on Enter without an entry', () => {
    expect(run(['5', 'eq', 'eq', 'add']).x).toBe('10');
  });

  it('swaps, rolls and drops', () => {
    const swapped = run(['1', 'eq', '2', 'swap']);
    expect(swapped.x).toBe('1');
    expect(swapped.above).toEqual(['2']);
    const rolled = run(['1', 'eq', '2', 'eq', '3', 'roll']);
    expect(rolled.x).toBe('2');
    expect(rolled.above).toEqual(['1', '3']);
    expect(run(['1', 'eq', '2', 'eq', 'drop']).x).toBe('1');
  });

  it('backspace edits an entry, otherwise drops X', () => {
    expect(run(['1', '2', 'bs']).x).toBe('1');
    expect(run(['1', 'eq', '2', 'eq', 'bs']).x).toBe('1');
  });

  it('ignores a binary operator with fewer than two values', () => {
    const r = run(['5', 'add']);
    expect(r.x).toBe('5');
    expect(r.s.stack).toHaveLength(1);
  });

  it('computes percent of Y and keeps Y', () => {
    const r = run(['2', '0', '0', 'eq', '1', '0', 'pct']);
    expect(r.x).toBe('20');
    expect(r.above).toEqual(['200']);
  });

  it('applies functions to X', () => {
    expect(run(['9', 'sqrt']).x).toBe('3');
    expect(run(['4', 'eq', 'neg']).x).toBe('-4');
  });

  it('keeps the stack on an error and recovers on the next key', () => {
    const r = run(['1', 'eq', '0', 'div']);
    expect(r.s.error).toBe(true);
    expect(r.s.stack).toHaveLength(1);
    const next = run(['7'], r.s);
    expect(next.s.error).toBe(false);
    expect(next.x).toBe('7');
  });

  it('clears everything with AC', () => {
    expect(run(['1', 'eq', '2', 'ac']).s.stack).toEqual([]);
  });
});
