import { BinaryOp, ConstantKey, UnaryOp } from './calculator.model';

export type CalcErrorReason = 'div0' | 'domain' | 'range' | 'unsupported';

/** Thrown by a domain for anything the display shows as «Fehler». Engines catch it. */
export class CalcError extends Error {
  public readonly reason: CalcErrorReason;

  constructor(reason: CalcErrorReason) {
    super(reason);
    this.name = 'CalcError';
    this.reason = reason;
  }
}

/**
 * The arithmetic an engine runs on. The decimal domain (decimal.js) serves basic/scientific, the
 * programmer domain (BigInt) serves programmer mode. Engines never do arithmetic themselves.
 */
export interface CalcDomain<V> {
  readonly zero: V;
  readonly allowsPoint: boolean;
  readonly allowsExponent: boolean;
  /** Whether `±` toggles the sign of the typed text (decimal, signed DEC) or negates the value (two's complement). */
  readonly signEditsEntry: boolean;
  /** Typed entry text (e.g. `-12.5e3`, `FF`) → value. Tolerates a trailing `.` or `e`. */
  parse(entry: string): V;
  /** Whether the candidate entry text is valid (digits allowed, length/width limits). */
  accepts(entry: string): boolean;
  binary(op: BinaryOp, a: V, b: V): V;
  unary(op: UnaryOp, x: V): V;
  constant(key: ConstantKey): V;
  percent(x: V): V;
  percentOf(base: V, pct: V): V;
  precedence(op: BinaryOp): number;
  rightAssoc(op: BinaryOp): boolean;
  format(v: V): string;
  formatEntry(entry: string): string;
  /** Unformatted text for copy and for starting an exponent entry. */
  toRaw(v: V): string;
}

export interface Completed<V> {
  readonly expression: string;
  readonly value: V;
}

export interface EngineResult<S, V> {
  readonly state: S;
  readonly completed: Completed<V> | null;
}
