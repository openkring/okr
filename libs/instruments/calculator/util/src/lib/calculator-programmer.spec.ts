import { describe, expect, it } from 'vitest';

import { CalcError } from './calculator-domain';
import { Dec } from './calculator-decimal';
import { infixDisplay, initInfix, pressInfix } from './calculator-infix';
import { CalcKey } from './calculator.model';
import {
  bitsOf, decimalToProgrammer, formatProgrammer, programmerDomain, ProgrammerOptions, programmerRaw,
  programmerToDecimal, toggleBit, wrap,
} from './calculator-programmer';

const hex64: ProgrammerOptions = { base: 16, wordSize: 64, signed: true };
const dec8s: ProgrammerOptions = { base: 10, wordSize: 8, signed: true };
const dec8u: ProgrammerOptions = { base: 10, wordSize: 8, signed: false };

function runHex(keys: CalcKey[]): string {
  const d = programmerDomain(hex64);
  let s = initInfix(d);
  for (const key of keys) s = pressInfix(s, key, d).state;
  return infixDisplay(s, d);
}

describe('programmer domain — arithmetic', () => {
  it('computes FF AND 0F in hex', () => {
    expect(runHex(['F', 'F', 'and', '0', 'F', 'eq'])).toBe('F');
  });

  it('wraps on overflow', () => {
    expect(programmerDomain(dec8u).binary('add', 255n, 1n)).toBe(0n);
    expect(programmerDomain(dec8s).binary('add', 127n, 1n)).toBe(128n);
    expect(formatProgrammer(128n, dec8s)).toBe('-128');
  });

  it('divides toward zero and keeps the dividend sign for mod', () => {
    const d = programmerDomain(dec8s);
    expect(formatProgrammer(d.binary('div', wrap(-7n, 8), 2n), dec8s)).toBe('-3');
    expect(d.binary('mod', 7n, 3n)).toBe(1n);
    expect(formatProgrammer(d.binary('mod', wrap(-7n, 8), 3n), dec8s)).toBe('-1');
    expect(() => d.binary('div', 1n, 0n)).toThrow(CalcError);
    expect(() => d.binary('mod', 1n, 0n)).toThrow(CalcError);
  });

  it('shifts and rotates within the word size', () => {
    const s = programmerDomain(dec8s);
    const u = programmerDomain(dec8u);
    expect(s.binary('shl', 1n, 4n)).toBe(16n);
    expect(s.binary('shl', 1n, 8n)).toBe(0n);
    expect(formatProgrammer(s.binary('shr', wrap(-16n, 8), 2n), dec8s)).toBe('-4');
    expect(u.binary('shr', 240n, 2n)).toBe(60n);
    expect(u.unary('rol', 0b10000001n)).toBe(0b00000011n);
    expect(u.unary('ror', 0b00000011n)).toBe(0b10000001n);
    expect(u.unary('shl1', 0b10000000n)).toBe(0n);
  });

  it('negates and inverts', () => {
    const u = programmerDomain(dec8u);
    expect(u.unary('ones', 0n)).toBe(255n);
    expect(u.unary('neg', 1n)).toBe(255n);
    expect(u.binary('nor', 0n, 0n)).toBe(255n);
    expect(u.binary('xor', 0b1100n, 0b1010n)).toBe(0b0110n);
  });

  it('does not support decimal-only keys', () => {
    const d = programmerDomain(hex64);
    expect(() => d.unary('sin', 1n)).toThrow(CalcError);
    expect(() => d.constant('pi')).toThrow(CalcError);
    expect(() => d.percent(1n)).toThrow(CalcError);
  });
});

describe('programmer domain — entry', () => {
  it('accepts only digits of the base within the word size', () => {
    expect(programmerDomain({ base: 16, wordSize: 8, signed: true }).accepts('FF')).toBe(true);
    expect(programmerDomain({ base: 16, wordSize: 8, signed: true }).accepts('100')).toBe(false);
    expect(programmerDomain({ base: 8, wordSize: 64, signed: true }).accepts('8')).toBe(false);
    expect(programmerDomain({ base: 2, wordSize: 64, signed: true }).accepts('102')).toBe(false);
    expect(programmerDomain(dec8s).accepts('255')).toBe(true);
    expect(programmerDomain(dec8s).accepts('256')).toBe(false);
  });

  it('parses a negative DEC entry as two\'s complement', () => {
    expect(programmerDomain(dec8s).parse('-1')).toBe(255n);
  });
});

describe('programmer formatting and conversion', () => {
  it('groups digits per base', () => {
    expect(formatProgrammer(0x12345n, hex64)).toBe('1 2345');
    expect(formatProgrammer(0b10110n, { base: 2, wordSize: 64, signed: true })).toBe('1 0110');
    expect(formatProgrammer(1234567n, { base: 10, wordSize: 64, signed: true })).toBe('1 234 567');
  });

  it('shows negative values as two\'s complement outside DEC', () => {
    expect(formatProgrammer(wrap(-1n, 8), { base: 16, wordSize: 8, signed: true })).toBe('FF');
    expect(programmerRaw(255n, { base: 16, wordSize: 8, signed: true })).toBe('FF');
    expect(formatProgrammer(255n, dec8u)).toBe('255');
  });

  it('converts to and from decimals', () => {
    expect(decimalToProgrammer(new Dec('-3.7'), 8)).toBe(253n);
    expect(decimalToProgrammer(new Dec('12.9'), 64)).toBe(12n);
    expect(programmerToDecimal(253n, dec8s).toString()).toBe('-3');
    expect(programmerToDecimal(253n, dec8u).toString()).toBe('253');
  });

  it('reads and toggles bits', () => {
    expect(toggleBit(0n, 3, 8)).toBe(8n);
    expect(toggleBit(8n, 3, 8)).toBe(0n);
    expect(bitsOf(5n, 8)).toEqual([true, false, true, false, false, false, false, false]);
  });
});
