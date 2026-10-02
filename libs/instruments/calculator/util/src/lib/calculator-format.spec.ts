import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import {
  fitFontSize, formatDecimal, formatDecimalEntry, groupDigits, localeFor, parsePastedDecimal,
  parsePastedProgrammer, separatorsFor,
} from './calculator-format';

const D = Decimal.clone({ precision: 34 });

describe('localeFor', () => {
  it('uses the Swiss variant for de/fr/it', () => {
    expect(localeFor('de')).toBe('de-CH');
    expect(localeFor('fr')).toBe('fr-CH');
    expect(localeFor('it')).toBe('it-CH');
    expect(localeFor('en')).toBe('en');
    expect(localeFor('es')).toBe('es');
  });
});

describe('groupDigits', () => {
  it('groups from the right', () => {
    expect(groupDigits('1234567', ',')).toBe('1,234,567');
    expect(groupDigits('123', ',')).toBe('123');
    expect(groupDigits('10110', ' ', 4)).toBe('1 0110');
  });
});

describe('formatDecimal', () => {
  it('formats with locale separators', () => {
    expect(formatDecimal(new D('1234567.5'), 'en')).toBe('1,234,567.5');
    const { group } = separatorsFor('de-CH');
    expect(group).not.toBe('');
    expect(formatDecimal(new D('1234.5'), 'de-CH')).toBe(`1${group}234.5`);
  });

  it('shows exact decimals', () => {
    expect(formatDecimal(new D('0.1').add('0.2'), 'en')).toBe('0.3');
  });

  it('rounds to 16 significant digits', () => {
    expect(formatDecimal(new D(1).div(3), 'en')).toBe('0.3333333333333333');
    expect(formatDecimal(new D(2).div(3), 'en')).toBe('0.6666666666666667');
  });

  it('switches to exponent notation outside 1e-9 … 1e16', () => {
    expect(formatDecimal(new D('1e20'), 'en')).toBe('1e20');
    expect(formatDecimal(new D('1.5e-12'), 'en')).toBe('1.5e-12');
    expect(formatDecimal(new D('9999999999999999'), 'en')).toBe('9,999,999,999,999,999');
  });

  it('formats zero and negatives', () => {
    expect(formatDecimal(new D(0), 'en')).toBe('0');
    expect(formatDecimal(new D(-0), 'en')).toBe('0');
    expect(formatDecimal(new D(-42), 'en')).toBe('-42');
  });
});

describe('formatDecimalEntry', () => {
  it('keeps what was typed', () => {
    expect(formatDecimalEntry('1234.', 'en')).toBe('1,234.');
    expect(formatDecimalEntry('-0.50', 'en')).toBe('-0.50');
    expect(formatDecimalEntry('1.5e-3', 'en')).toBe('1.5e-3');
    expect(formatDecimalEntry('12e', 'en')).toBe('12e');
  });
});

describe('parsePastedDecimal', () => {
  it('normalises separators and exponent', () => {
    expect(parsePastedDecimal("1'234.50")).toBe('1234.50');
    expect(parsePastedDecimal('1’234.50')).toBe('1234.50');
    expect(parsePastedDecimal('3,14')).toBe('3.14');
    expect(parsePastedDecimal(' -2.5E+3 ')).toBe('-2.5e3');
  });

  it('rejects anything that is not one number', () => {
    expect(parsePastedDecimal('1,234.5')).toBeNull();
    expect(parsePastedDecimal('abc')).toBeNull();
    expect(parsePastedDecimal('')).toBeNull();
  });
});

describe('parsePastedProgrammer', () => {
  it('parses in the current base', () => {
    expect(parsePastedProgrammer('0xff', 16)).toBe('FF');
    expect(parsePastedProgrammer('1010 0101', 2)).toBe('10100101');
    expect(parsePastedProgrammer('-12', 10)).toBe('-12');
  });

  it('rejects digits outside the base', () => {
    expect(parsePastedProgrammer('19', 8)).toBeNull();
    expect(parsePastedProgrammer('-FF', 16)).toBeNull();
    expect(parsePastedProgrammer('1.5', 10)).toBeNull();
  });
});

describe('fitFontSize', () => {
  it('shrinks long numbers', () => {
    expect(fitFontSize(10)).toBe(3.2);
    expect(fitFontSize(24)).toBeCloseTo(1.6);
    expect(fitFontSize(100)).toBe(1.2);
  });
});
