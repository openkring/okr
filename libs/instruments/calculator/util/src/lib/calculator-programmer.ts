import type Decimal from 'decimal.js';

import { Dec } from './calculator-decimal';
import { CalcDomain, CalcError } from './calculator-domain';
import { groupDigits } from './calculator-format';
import { BinaryOp, ProgBase, UnaryOp, WordSize } from './calculator.model';

export interface ProgrammerOptions {
  readonly base: ProgBase;
  readonly wordSize: WordSize;
  readonly signed: boolean;
}

const DIGITS = '0123456789ABCDEF';

/** C operator order: × ÷ mod > + − > shifts > AND > XOR > OR/NOR. */
const PRECEDENCE: Partial<Record<BinaryOp, number>> = {
  mul: 6, div: 6, mod: 6, add: 5, sub: 5, shl: 4, shr: 4, and: 3, xor: 2, or: 1, nor: 1,
};

export function mask(wordSize: WordSize): bigint {
  return (1n << BigInt(wordSize)) - 1n;
}

/** Values are held unsigned in [0, 2^w); `&` with the mask also maps negatives to two's complement. */
export function wrap(value: bigint, wordSize: WordSize): bigint {
  return value & mask(wordSize);
}

export function toSigned(value: bigint, wordSize: WordSize): bigint {
  return value >= 1n << BigInt(wordSize - 1) ? value - (1n << BigInt(wordSize)) : value;
}

export function interpret(value: bigint, o: ProgrammerOptions): bigint {
  return o.signed ? toSigned(value, o.wordSize) : value;
}

export function toggleBit(value: bigint, index: number, wordSize: WordSize): bigint {
  return wrap(value ^ (1n << BigInt(index)), wordSize);
}

/** Bit `i` of the value at array index `i` (index 0 = least significant). */
export function bitsOf(value: bigint, wordSize: WordSize): boolean[] {
  return Array.from({ length: wordSize }, (_, i) => ((value >> BigInt(i)) & 1n) === 1n);
}

/** DEC shows the interpreted (signed or unsigned) value; HEX/OCT/BIN show the raw bits. */
export function programmerRaw(value: bigint, o: ProgrammerOptions): string {
  return o.base === 10 ? interpret(value, o).toString() : value.toString(o.base).toUpperCase();
}

function groupSize(base: ProgBase): number {
  return base === 16 || base === 2 ? 4 : 3;
}

function groupWithSign(text: string, size: number): string {
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  return (negative ? '-' : '') + groupDigits(body || '0', ' ', size);
}

export function formatProgrammer(value: bigint, o: ProgrammerOptions): string {
  return groupWithSign(programmerRaw(value, o), groupSize(o.base));
}

function parseDigits(text: string, base: ProgBase): bigint {
  const negative = text.startsWith('-');
  let n = 0n;
  for (const ch of negative ? text.slice(1) : text) n = n * BigInt(base) + BigInt(DIGITS.indexOf(ch));
  return negative ? -n : n;
}

/** Truncates toward zero and wraps to the word size. */
export function decimalToProgrammer(value: Decimal, wordSize: WordSize): bigint {
  return wrap(BigInt(value.trunc().toFixed()), wordSize);
}

export function programmerToDecimal(value: bigint, o: ProgrammerOptions): Decimal {
  return new Dec(interpret(value, o).toString());
}

export function programmerDomain(o: ProgrammerOptions): CalcDomain<bigint> {
  const w = o.wordSize;
  const width = BigInt(w);
  const signedValue = (v: bigint): bigint => interpret(v, o);
  const shiftCount = (b: bigint): bigint => {
    const n = signedValue(b);
    return n < 0n ? 0n : n > width ? width : n;
  };
  const shiftRight = (a: bigint, n: bigint): bigint =>
    o.signed ? wrap(toSigned(a, w) >> n, w) : a >> n;

  const binary = (op: BinaryOp, a: bigint, b: bigint): bigint => {
    switch (op) {
      case 'add': return wrap(a + b, w);
      case 'sub': return wrap(a - b, w);
      case 'mul': return wrap(signedValue(a) * signedValue(b), w);
      case 'div':
        if (b === 0n) throw new CalcError('div0');
        return wrap(signedValue(a) / signedValue(b), w);
      case 'mod':
        if (b === 0n) throw new CalcError('div0');
        return wrap(signedValue(a) % signedValue(b), w);
      case 'and': return a & b;
      case 'or': return a | b;
      case 'xor': return a ^ b;
      case 'nor': return wrap(~(a | b), w);
      case 'shl': return wrap(a << shiftCount(b), w);
      case 'shr': return shiftRight(a, shiftCount(b));
      default: throw new CalcError('unsupported');
    }
  };

  const unary = (op: UnaryOp, x: bigint): bigint => {
    switch (op) {
      case 'neg': return wrap(-x, w);
      case 'ones': return wrap(~x, w);
      case 'shl1': return wrap(x << 1n, w);
      case 'shr1': return shiftRight(x, 1n);
      case 'rol': return wrap((x << 1n) | (x >> (width - 1n)), w);
      case 'ror': return wrap((x >> 1n) | ((x & 1n) << (width - 1n)), w);
      default: throw new CalcError('unsupported');
    }
  };

  const unsupported = (): never => { throw new CalcError('unsupported'); };

  return {
    zero: 0n,
    allowsPoint: false,
    allowsExponent: false,
    signEditsEntry: o.base === 10 && o.signed,
    parse: entry => wrap(parseDigits(entry || '0', o.base), w),
    accepts: entry => {
      const body = o.base === 10 && entry.startsWith('-') ? entry.slice(1) : entry;
      if (!body || [...body].some(ch => { const i = DIGITS.indexOf(ch); return i < 0 || i >= o.base; })) return false;
      return parseDigits(body, o.base) <= mask(w);
    },
    binary,
    unary,
    constant: unsupported,
    percent: unsupported,
    percentOf: unsupported,
    precedence: op => PRECEDENCE[op] ?? 0,
    rightAssoc: () => false,
    format: v => formatProgrammer(v, o),
    formatEntry: entry => groupWithSign(entry || '0', groupSize(o.base)),
    toRaw: v => programmerRaw(v, o),
  };
}
