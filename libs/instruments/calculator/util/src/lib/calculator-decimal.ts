import Decimal from 'decimal.js';

import { CalcDomain, CalcError } from './calculator-domain';
import { formatDecimal, formatDecimalEntry } from './calculator-format';
import { AngleMode, BinaryOp, ConstantKey, UnaryOp } from './calculator.model';

/** Private decimal.js configuration — the global Decimal is never reconfigured. */
export const Dec = Decimal.clone({
  precision: 34,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpPos: 40,
  toExpNeg: -40,
});

const MAX_ENTRY_DIGITS = 16;
const ENTRY_PATTERN = /^-?\d*(\.\d*)?(e-?\d{0,4})?$/;
const PI = Dec.acos(-1);
const E = new Dec(1).exp();

const PRECEDENCE: Partial<Record<BinaryOp, number>> = {
  add: 1, sub: 1, mul: 2, div: 2, pow: 3, ypowx: 3, root: 3, logy: 3,
};

/** Infinity/NaN (overflow, domain errors) become a CalcError. */
function finite(value: Decimal): Decimal {
  if (!value.isFinite()) throw new CalcError('range');
  return value;
}

function positive(value: Decimal): Decimal {
  if (value.lte(0)) throw new CalcError('domain');
  return value;
}

export function parseDecimalEntry(entry: string): Decimal {
  let text = entry.replace(/e-?$/, '').replace(/\.(?=e|$)/, '');
  if (text === '' || text === '-') text = '0';
  return new Dec(text);
}

function toRadians(x: Decimal, angle: AngleMode): Decimal {
  return angle === 'deg' ? x.mul(PI).div(180) : x;
}

function fromRadians(x: Decimal, angle: AngleMode): Decimal {
  return angle === 'deg' ? x.mul(180).div(PI) : x;
}

/** sin/cos/tan; in degrees, multiples of 90° are exact (sin 180° = 0, tan 90° = error). */
function trig(op: 'sin' | 'cos' | 'tan', x: Decimal, angle: AngleMode): Decimal {
  let argument = x;
  if (angle === 'deg') {
    const reduced = x.mod(360);
    const d = reduced.isNeg() ? reduced.add(360) : reduced;
    if (d.mod(90).isZero()) {
      const quadrant = d.div(90).toNumber();
      const sin = [0, 1, 0, -1][quadrant];
      const cos = [1, 0, -1, 0][quadrant];
      if (op === 'sin') return new Dec(sin);
      if (op === 'cos') return new Dec(cos);
      if (cos === 0) throw new CalcError('domain');
      return new Dec(0);
    }
    // Convert the reduced angle: exact, and keeps decimal.js away from huge radian arguments.
    argument = d;
  }
  const r = toRadians(argument, angle);
  return finite(op === 'sin' ? r.sin() : op === 'cos' ? r.cos() : r.tan());
}

/** Beyond this, decimal.js's series for sinh/cosh/tanh become pathologically slow (seconds to minutes). */
const HYPERBOLIC_SERIES_LIMIT = 1000;
/** Beyond this, asinh(x) = ln(2|x|) and acosh(x) = ln(2x) to well past 34 digits. */
const INVERSE_HYPERBOLIC_LIMIT = new Dec('1e17');

function hyperbolic(op: 'sinh' | 'cosh' | 'tanh', x: Decimal): Decimal {
  if (x.abs().lte(HYPERBOLIC_SERIES_LIMIT)) return finite(op === 'sinh' ? x.sinh() : op === 'cosh' ? x.cosh() : x.tanh());
  if (op === 'tanh') return new Dec(x.isNeg() ? -1 : 1);
  // e^-|x| is negligible here; e^|x| overflows to Infinity quickly, which finite() turns into «Fehler».
  const half = x.abs().exp().div(2);
  return finite(op === 'sinh' && x.isNeg() ? half.neg() : half);
}

function inverseHyperbolic(op: 'asinh' | 'acosh', x: Decimal): Decimal {
  if (x.abs().lt(INVERSE_HYPERBOLIC_LIMIT)) return finite(op === 'asinh' ? x.asinh() : x.acosh());
  if (op === 'acosh' && x.isNeg()) throw new CalcError('domain');
  const ln = x.abs().mul(2).ln();
  return x.isNeg() ? ln.neg() : ln;
}

function factorial(x: Decimal): Decimal {
  if (!x.isInteger() || x.isNeg() || x.gt(1000)) throw new CalcError('domain');
  let result = new Dec(1);
  for (let i = 2; i <= x.toNumber(); i++) result = result.mul(i);
  return result;
}

function nthRoot(a: Decimal, n: Decimal): Decimal {
  if (n.isZero()) throw new CalcError('domain');
  if (a.isNeg()) {
    if (!n.isInteger() || !n.mod(2).abs().eq(1)) throw new CalcError('domain');
    return finite(a.neg().pow(new Dec(1).div(n)).neg());
  }
  return finite(a.pow(new Dec(1).div(n)));
}

function binary(op: BinaryOp, a: Decimal, b: Decimal): Decimal {
  switch (op) {
    case 'add': return finite(a.add(b));
    case 'sub': return finite(a.sub(b));
    case 'mul': return finite(a.mul(b));
    case 'div':
      if (b.isZero()) throw new CalcError('div0');
      return finite(a.div(b));
    case 'pow': return finite(a.pow(b));
    case 'ypowx': return finite(b.pow(a));
    case 'root': return nthRoot(a, b);
    case 'logy':
      if (b.eq(1)) throw new CalcError('domain');
      return finite(positive(a).log(positive(b)));
    default: throw new CalcError('unsupported');
  }
}

function unary(op: UnaryOp, x: Decimal, angle: AngleMode): Decimal {
  switch (op) {
    case 'neg': return x.neg();
    case 'sq': return finite(x.mul(x));
    case 'cube': return finite(x.pow(3));
    case 'exp': return finite(x.exp());
    case 'pow10': return finite(new Dec(10).pow(x));
    case 'pow2': return finite(new Dec(2).pow(x));
    case 'inv':
      if (x.isZero()) throw new CalcError('div0');
      return new Dec(1).div(x);
    case 'sqrt': return finite(x.sqrt());
    case 'cbrt': return finite(x.cbrt());
    case 'ln': return positive(x).ln();
    case 'log10': return positive(x).log(10);
    case 'log2': return positive(x).log(2);
    case 'fact': return factorial(x);
    case 'sin': case 'cos': case 'tan': return trig(op, x, angle);
    case 'asin': return fromRadians(finite(x.asin()), angle);
    case 'acos': return fromRadians(finite(x.acos()), angle);
    case 'atan': return fromRadians(finite(x.atan()), angle);
    case 'sinh': case 'cosh': case 'tanh': return hyperbolic(op, x);
    case 'asinh': case 'acosh': return inverseHyperbolic(op, x);
    case 'atanh': return finite(x.atanh());
    default: throw new CalcError('unsupported');
  }
}

/** decimal.js can throw its own errors (e.g. precision limit); the engines only know CalcError. */
function guarded<A extends unknown[]>(fn: (...args: A) => Decimal): (...args: A) => Decimal {
  return (...args: A): Decimal => {
    try {
      return fn(...args);
    } catch (e) {
      if (e instanceof CalcError) throw e;
      throw new CalcError('range');
    }
  };
}

export interface DecimalDomainOptions {
  readonly angle: AngleMode;
  readonly locale: string;
}

export function decimalDomain(options: DecimalDomainOptions): CalcDomain<Decimal> {
  return {
    zero: new Dec(0),
    allowsPoint: true,
    allowsExponent: true,
    signEditsEntry: true,
    parse: parseDecimalEntry,
    accepts: (entry: string): boolean => {
      if (!ENTRY_PATTERN.test(entry)) return false;
      const digits = entry.split('e')[0].replace(/[-.]/g, '').replace(/^0+/, '');
      return digits.length <= MAX_ENTRY_DIGITS;
    },
    binary: guarded(binary),
    unary: guarded((op: UnaryOp, x: Decimal) => unary(op, x, options.angle)),
    constant: (key: ConstantKey): Decimal => key === 'pi' ? PI : key === 'e' ? E : Dec.random(16),
    percent: x => x.div(100),
    percentOf: (base, pct) => finite(base.mul(pct).div(100)),
    precedence: op => PRECEDENCE[op] ?? 0,
    rightAssoc: op => (PRECEDENCE[op] ?? 0) === 3,
    format: v => formatDecimal(v, options.locale),
    formatEntry: entry => formatDecimalEntry(entry, options.locale),
    toRaw: v => v.toSignificantDigits(16).toString(),
  };
}
