import type Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { CalcError } from './calculator-domain';
import { decimalDomain, Dec } from './calculator-decimal';
import { formatDecimal } from './calculator-format';
import { infixDisplay, initInfix, pressInfix } from './calculator-infix';
import { CalcKey } from './calculator.model';
import { programmerDomain, ProgrammerOptions } from './calculator-programmer';
import { calcView, isIgnoredKeyTarget } from './calculator-view';
import { DEFAULT_SETTINGS, initialCalcState, pasteText, pressKey } from './calculator.state';

const deg = decimalDomain({ angle: 'deg', locale: 'en' });
const rad = decimalDomain({ angle: 'rad', locale: 'en' });

function timed<T>(fn: () => T): { ms: number; result: T | Error } {
  const t0 = Date.now();
  let result: T | Error;
  try { result = fn(); } catch (e) { result = e as Error; }
  return { ms: Date.now() - t0, result };
}

describe('review #1 — hyperbolic functions stay fast on large inputs', () => {
  it('tanh saturates to ±1', () => {
    const r = timed(() => deg.unary('tanh', new Dec(1000000)));
    expect(r.ms).toBeLessThan(500);
    expect(String(r.result)).toBe('1');
    expect(String(deg.unary('tanh', new Dec(-1e9)))).toBe('-1');
  });

  it('sinh and cosh stay fast, and overflow to an error past the exponent limit', () => {
    for (const op of ['sinh', 'cosh'] as const) {
      const big = timed(() => deg.unary(op, new Dec('1e15')));
      expect(big.ms).toBeLessThan(500);
      expect((big.result as Decimal).isFinite()).toBe(true);
      const over = timed(() => deg.unary(op, new Dec('1e17')));
      expect(over.ms).toBeLessThan(500);
      expect(over.result).toBeInstanceOf(CalcError);
    }
    expect(deg.unary('sinh', new Dec('-1e15')).isNeg()).toBe(true);
  });

  it('asinh and acosh of huge values return quickly', () => {
    const r = timed(() => deg.unary('asinh', new Dec('1e9999')));
    expect(r.ms).toBeLessThan(500);
    expect(new Dec(r.result as never).toSignificantDigits(6).toString()).toBe('23024.2');
    expect(new Dec(deg.unary('asinh', new Dec('-1e9999'))).isNeg()).toBe(true);
    expect(timed(() => deg.unary('acosh', new Dec('1e9999'))).ms).toBeLessThan(500);
  });
});

describe('review #2 — no non-CalcError escapes the decimal domain', () => {
  it('reduces degrees before converting', () => {
    expect(deg.unary('sin', new Dec('1e1100')).isFinite()).toBe(true);
  });

  it('maps decimal.js errors to CalcError', () => {
    expect(() => rad.unary('sin', new Dec('1e1100'))).toThrow(CalcError);
  });
});

describe('review #3 — huge pasted exponents and non-finite values', () => {
  it('ignores a paste that is not finite', () => {
    const st = initialCalcState();
    expect(pasteText(st, '1e99999999999999999', 'en')).toBe(st);
  });

  it('formats non-finite values without throwing', () => {
    expect(() => formatDecimal(new Dec(Infinity), 'en')).not.toThrow();
  });

  it('does not store a non-finite memory value', () => {
    const big = pasteText(initialCalcState({ ...DEFAULT_SETTINGS, profile: 'scientific' }), '9e9000000000000000', 'en');
    let st = pressKey(big, 'mplus', 'en');
    st = pressKey(st, 'mplus', 'en');
    expect(new Dec(st.memory).isFinite()).toBe(true);
    expect(() => calcView(pressKey(st, 'mr', 'en'), 'en')).not.toThrow();
  });
});

describe('review #4 — 2\'s on a typed programmer entry', () => {
  function run(o: ProgrammerOptions, keys: CalcKey[]): string {
    const d = programmerDomain(o);
    let s = initInfix(d);
    for (const k of keys) s = pressInfix(s, k, d).state;
    return infixDisplay(s, d);
  }

  it('applies two\'s complement in HEX', () => {
    expect(run({ base: 16, wordSize: 8, signed: true }, ['F', 'F', 'neg'])).toBe('1');
    expect(run({ base: 16, wordSize: 8, signed: true }, ['2', 'neg'])).toBe('FE');
  });

  it('applies two\'s complement in unsigned DEC', () => {
    expect(run({ base: 10, wordSize: 8, signed: false }, ['5', 'neg'])).toBe('251');
  });

  it('keeps toggling the typed sign in signed DEC', () => {
    expect(run({ base: 10, wordSize: 8, signed: true }, ['5', 'neg'])).toBe('-5');
  });
});

describe('review #5 — keys inside overlays are ignored', () => {
  it('ignores fields and anything inside an Ionic overlay', () => {
    const popover = document.createElement('ion-popover');
    const option = document.createElement('ion-radio');
    popover.appendChild(option);
    document.body.appendChild(popover);
    expect(isIgnoredKeyTarget(option)).toBe(true);
    expect(isIgnoredKeyTarget(document.createElement('input'))).toBe(true);
    expect(isIgnoredKeyTarget(document.createElement('div'))).toBe(false);
    expect(isIgnoredKeyTarget(null)).toBe(false);
  });
});
