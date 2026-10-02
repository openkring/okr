import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { Completed } from './calculator-domain';
import { decimalDomain } from './calculator-decimal';
import { CalcKey } from './calculator.model';
import { infixDisplay, initInfix, InfixState, pressInfix } from './calculator-infix';

const d = decimalDomain({ angle: 'deg', locale: 'en' });

function run(keys: CalcKey[], start: InfixState<Decimal> = initInfix(d)) {
  let s = start;
  let last: Completed<Decimal> | null = null;
  for (const key of keys) {
    const r = pressInfix(s, key, d);
    s = r.state;
    if (r.completed) last = r.completed;
  }
  return { s, last, shown: infixDisplay(s, d) };
}

describe('infix engine — evaluation', () => {
  it('computes 0.1 + 0.2 exactly', () => {
    expect(run(['0', 'point', '1', 'add', '0', 'point', '2', 'eq']).shown).toBe('0.3');
  });

  it('respects precedence and shows intermediate results', () => {
    expect(run(['2', 'add', '3', 'mul', '4', 'eq']).shown).toBe('14');
    expect(run(['2', 'add', '3', 'mul']).shown).toBe('3');
    expect(run(['2', 'mul', '3', 'add']).shown).toBe('6');
  });

  it('evaluates powers right-associatively', () => {
    expect(run(['2', 'pow', '3', 'pow', '2', 'eq']).shown).toBe('512');
  });

  it('handles brackets and closes open ones on =', () => {
    expect(run(['open', '2', 'add', '3', 'close', 'mul', '4', 'eq']).shown).toBe('20');
    const r = run(['2', 'mul', 'open', '3', 'add', '4', 'eq']);
    expect(r.shown).toBe('14');
    expect(r.last?.expression).toBe('2 × (3 + 4)');
  });

  it('ignores an unmatched close bracket', () => {
    expect(run(['5', 'close', 'add', '1', 'eq']).shown).toBe('6');
  });

  it('repeats the last operation on repeated =', () => {
    expect(run(['5', 'add', '2', 'eq', 'eq', 'eq']).shown).toBe('11');
  });

  it('uses the shown value when = follows an operator', () => {
    expect(run(['2', 'add', 'eq']).shown).toBe('4');
  });

  it('replaces an operator pressed twice', () => {
    expect(run(['2', 'add', 'mul', '3', 'eq']).shown).toBe('6');
    expect(run(['2', 'add', '3', 'mul', 'add']).shown).toBe('5');
  });

  it('reports the completed expression', () => {
    const r = run(['2', 'add', '3', 'mul', '4', 'eq']);
    expect(r.last?.expression).toBe('2 + 3 × 4');
    expect(r.last?.value.toString()).toBe('14');
  });
});

describe('infix engine — percent, functions, constants', () => {
  it('reads % after + as percent of the left operand', () => {
    expect(run(['2', '0', '0', 'add', '1', '0', 'pct']).shown).toBe('20');
    expect(run(['2', '0', '0', 'add', '1', '0', 'pct', 'eq']).shown).toBe('220');
    expect(run(['5', '0', 'pct']).shown).toBe('0.5');
  });

  it('applies functions to the shown value', () => {
    expect(run(['9', 'sqrt']).shown).toBe('3');
    expect(run(['2', 'add', '9', 'sqrt', 'eq']).shown).toBe('5');
    expect(run(['9', 'sqrt', 'add', '1', 'eq']).last?.expression).toBe('√(9) + 1');
  });

  it('inserts constants', () => {
    expect(run(['pi']).shown).toBe('3.141592653589793');
  });

  it('enters exponents with EE', () => {
    expect(run(['1', 'point', '5', 'ee', '3', 'eq']).shown).toBe('1,500');
  });
});

describe('infix engine — editing', () => {
  it('toggles the sign of an entry and of a result', () => {
    expect(run(['5', 'neg']).shown).toBe('-5');
    expect(run(['2', 'add', '3', 'eq', 'neg']).shown).toBe('-5');
  });

  it('deletes digits with backspace', () => {
    expect(run(['1', '2', '3', 'bs']).shown).toBe('12');
    expect(run(['5', 'bs']).shown).toBe('0');
  });

  it('ignores a 17th digit', () => {
    const keys = Array.from({ length: 17 }, () => '9' as CalcKey);
    expect(run(keys).s.entry).toBe('9999999999999999');
  });

  it('clears the entry with C, everything with AC', () => {
    const c = run(['5', 'add', '3', 'ac']);
    expect(c.shown).toBe('0');
    expect(run(['eq'], c.s).shown).toBe('5');
    expect(run(['5', 'add', '3', 'ac', 'ac']).s.ops).toEqual([]);
  });

  it('starts over after = with a digit, continues with an operator', () => {
    expect(run(['2', 'add', '3', 'eq', '4']).shown).toBe('4');
    expect(run(['2', 'add', '3', 'eq', 'mul', '2', 'eq']).shown).toBe('10');
  });
});

describe('infix engine — errors', () => {
  it('shows an error and recovers on the next key', () => {
    const r = run(['1', 'div', '0', 'eq']);
    expect(r.s.error).toBe(true);
    const next = run(['7'], r.s);
    expect(next.s.error).toBe(false);
    expect(next.shown).toBe('7');
  });

  it('clears the error without input on backspace', () => {
    const r = run(['1', 'div', '0', 'eq', 'bs']);
    expect(r.s.error).toBe(false);
    expect(r.shown).toBe('0');
  });
});
