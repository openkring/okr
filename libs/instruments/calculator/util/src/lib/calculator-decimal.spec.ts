import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { CalcError } from './calculator-domain';
import { decimalDomain, Dec, parseDecimalEntry } from './calculator-decimal';

const deg = decimalDomain({ angle: 'deg', locale: 'en' });
const rad = decimalDomain({ angle: 'rad', locale: 'en' });
const n = (v: string | number) => new Dec(v);
const sd = (v: Decimal) => v.toSignificantDigits(16).toString();

describe('decimal domain — binary', () => {
  it('adds exactly', () => {
    expect(deg.binary('add', n('0.1'), n('0.2')).toString()).toBe('0.3');
  });

  it('rejects division by zero', () => {
    expect(() => deg.binary('div', n(1), n(0))).toThrow(CalcError);
  });

  it('computes powers and roots', () => {
    expect(deg.binary('pow', n(2), n(10)).toString()).toBe('1024');
    expect(deg.binary('ypowx', n(2), n(10)).toString()).toBe('100');
    expect(sd(deg.binary('root', n(27), n(3)))).toBe('3');
    expect(sd(deg.binary('root', n(-8), n(3)))).toBe('-2');
    expect(() => deg.binary('root', n(-8), n(2))).toThrow(CalcError);
    expect(() => deg.binary('root', n(8), n(0))).toThrow(CalcError);
  });

  it('computes log to any base', () => {
    expect(sd(deg.binary('logy', n(1000), n(10)))).toBe('3');
    expect(() => deg.binary('logy', n(5), n(1))).toThrow(CalcError);
    expect(() => deg.binary('logy', n(-5), n(10))).toThrow(CalcError);
  });

  it('reports overflow as an error', () => {
    expect(() => deg.binary('pow', n(10), n('1e17'))).toThrow(CalcError);
  });

  it('does not support programmer operators', () => {
    expect(() => deg.binary('and', n(1), n(1))).toThrow(CalcError);
  });
});

describe('decimal domain — unary', () => {
  it('handles trigonometry in degrees, exact on the axes', () => {
    expect(sd(deg.unary('sin', n(30)))).toBe('0.5');
    expect(sd(deg.unary('cos', n(60)))).toBe('0.5');
    expect(deg.unary('sin', n(180)).isZero()).toBe(true);
    expect(deg.unary('cos', n(-90)).isZero()).toBe(true);
    expect(sd(deg.unary('tan', n(45)))).toBe('1');
    expect(() => deg.unary('tan', n(90))).toThrow(CalcError);
    expect(() => deg.unary('tan', n(270))).toThrow(CalcError);
    expect(sd(deg.unary('asin', n('0.5')))).toBe('30');
  });

  it('handles trigonometry in radians', () => {
    expect(sd(rad.unary('sin', rad.constant('pi').div(2)))).toBe('1');
    expect(sd(rad.unary('sin', n(90)))).toBe('0.8939966636005579');
  });

  it('rejects arguments outside the domain', () => {
    expect(() => deg.unary('acos', n(2))).toThrow(CalcError);
    expect(() => deg.unary('ln', n(-1))).toThrow(CalcError);
    expect(() => deg.unary('ln', n(0))).toThrow(CalcError);
    expect(() => deg.unary('sqrt', n(-4))).toThrow(CalcError);
    expect(() => deg.unary('inv', n(0))).toThrow(CalcError);
    expect(() => deg.unary('atanh', n(1))).toThrow(CalcError);
  });

  it('computes roots, logs and powers', () => {
    expect(sd(deg.unary('sqrt', n(2)))).toBe('1.414213562373095');
    expect(deg.unary('cbrt', n(-27)).toString()).toBe('-3');
    expect(sd(deg.unary('log10', n(1000)))).toBe('3');
    expect(sd(deg.unary('log2', n(8)))).toBe('3');
    expect(deg.unary('exp', n(0)).toString()).toBe('1');
    expect(deg.unary('pow10', n(3)).toString()).toBe('1000');
    expect(deg.unary('pow2', n(10)).toString()).toBe('1024');
    expect(deg.unary('sq', n(-3)).toString()).toBe('9');
    expect(deg.unary('cube', n(-2)).toString()).toBe('-8');
    expect(deg.unary('neg', n(5)).toString()).toBe('-5');
  });

  it('computes factorials of integers 0…1000 only', () => {
    expect(deg.unary('fact', n(5)).toString()).toBe('120');
    expect(deg.unary('fact', n(0)).toString()).toBe('1');
    expect(() => deg.unary('fact', n('2.5'))).toThrow(CalcError);
    expect(() => deg.unary('fact', n(-1))).toThrow(CalcError);
    expect(() => deg.unary('fact', n(1001))).toThrow(CalcError);
  });

  it('does not support programmer functions', () => {
    expect(() => deg.unary('shl1', n(1))).toThrow(CalcError);
  });
});

describe('decimal domain — constants, percent, precedence', () => {
  it('provides constants', () => {
    expect(sd(deg.constant('pi'))).toBe('3.141592653589793');
    expect(sd(deg.constant('e'))).toBe('2.718281828459045');
    const r = deg.constant('rand');
    expect(r.gte(0) && r.lt(1)).toBe(true);
  });

  it('computes percent', () => {
    expect(deg.percent(n(50)).toString()).toBe('0.5');
    expect(deg.percentOf(n(200), n(10)).toString()).toBe('20');
  });

  it('orders operators', () => {
    expect(deg.precedence('mul')).toBeGreaterThan(deg.precedence('add'));
    expect(deg.precedence('pow')).toBeGreaterThan(deg.precedence('mul'));
    expect(deg.rightAssoc('pow')).toBe(true);
    expect(deg.rightAssoc('sub')).toBe(false);
  });
});

describe('decimal domain — entry', () => {
  it('accepts at most 16 significant digits and 4 exponent digits', () => {
    expect(deg.accepts('1234567890123456')).toBe(true);
    expect(deg.accepts('12345678901234567')).toBe(false);
    expect(deg.accepts('0.000001')).toBe(true);
    expect(deg.accepts('1.5e-12')).toBe(true);
    expect(deg.accepts('1.5e12345')).toBe(false);
    expect(deg.accepts('1..2')).toBe(false);
  });

  it('parses incomplete entries', () => {
    expect(parseDecimalEntry('12.').toString()).toBe('12');
    expect(parseDecimalEntry('1.5e').toString()).toBe('1.5');
    expect(parseDecimalEntry('1.e3').toString()).toBe('1000');
    expect(parseDecimalEntry('-0.').isZero()).toBe(true);
    expect(parseDecimalEntry('').isZero()).toBe(true);
  });

  it('formats and exports raw text', () => {
    expect(deg.format(n('1234.5'))).toBe('1,234.5');
    expect(deg.formatEntry('1234.')).toBe('1,234.');
    expect(deg.toRaw(n(1).div(3))).toBe('0.3333333333333333');
  });
});
