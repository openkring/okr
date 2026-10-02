import { CalcDomain, CalcError, EngineResult } from './calculator-domain';
import { appendDigit, appendPoint, backspace, startExponent, toggleSign } from './calculator-entry';
import { CalcKey, isBinaryOp, isConstantKey, isDigitKey, isUnaryOp, OP_SYMBOLS } from './calculator.model';

/** Stack calculator: X is the entry while typing, else the top of the stack. */
export interface RpnState<V> {
  readonly stack: readonly V[];
  readonly entry: string | null;
  readonly error: boolean;
}

type Result<V> = EngineResult<RpnState<V>, V>;

export function initRpn<V>(value?: V): RpnState<V> {
  return { stack: value === undefined ? [] : [value], entry: null, error: false };
}

function none<V>(state: RpnState<V>): Result<V> {
  return { state, completed: null };
}

function pushEntry<V>(s: RpnState<V>, d: CalcDomain<V>): V[] {
  return s.entry !== null ? [...s.stack, d.parse(s.entry)] : [...s.stack];
}

function committed<V>(stack: V[]): RpnState<V> {
  return { stack, entry: null, error: false };
}

function step<V>(s: RpnState<V>, key: CalcKey, d: CalcDomain<V>): Result<V> {
  if (isDigitKey(key)) return none({ ...s, entry: appendDigit(s.entry, key, d) });
  if (isBinaryOp(key)) {
    const stack = pushEntry(s, d);
    if (stack.length < 2) return none(committed(stack));
    const b = stack.pop() as V;
    const a = stack.pop() as V;
    const value = d.binary(key, a, b);
    stack.push(value);
    return {
      state: committed(stack),
      completed: { expression: `${d.format(a)} ${OP_SYMBOLS[key]} ${d.format(b)}`, value },
    };
  }
  if (key === 'neg' && s.entry !== null) return none({ ...s, entry: toggleSign(s.entry) });
  if (isUnaryOp(key)) {
    const stack = pushEntry(s, d);
    if (stack.length === 0) return none(s);
    stack.push(d.unary(key, stack.pop() as V));
    return none(committed(stack));
  }
  if (isConstantKey(key)) return none(committed([...pushEntry(s, d), d.constant(key)]));
  switch (key) {
    case 'point': return none({ ...s, entry: appendPoint(s.entry, d) });
    case 'ee': return none({ ...s, entry: startExponent(s.entry, '1', d) });
    case 'eq': {
      if (s.entry !== null) return none(committed(pushEntry(s, d)));
      return none(s.stack.length > 0 ? committed([...s.stack, s.stack[s.stack.length - 1]]) : s);
    }
    case 'pct': {
      const stack = pushEntry(s, d);
      if (stack.length >= 2) {
        const x = stack.pop() as V;
        stack.push(d.percentOf(stack[stack.length - 1], x));
      } else if (stack.length === 1) {
        stack.push(d.percent(stack.pop() as V));
      }
      return none(committed(stack));
    }
    case 'swap': {
      const stack = pushEntry(s, d);
      if (stack.length >= 2) {
        const x = stack.pop() as V;
        const y = stack.pop() as V;
        stack.push(x, y);
      }
      return none(committed(stack));
    }
    case 'roll': {
      const stack = pushEntry(s, d);
      if (stack.length >= 2) stack.unshift(stack.pop() as V);
      return none(committed(stack));
    }
    case 'drop': return none(s.entry !== null ? { ...s, entry: null } : committed(s.stack.slice(0, -1)));
    case 'bs': return none(s.entry !== null ? { ...s, entry: backspace(s.entry) } : committed(s.stack.slice(0, -1)));
    case 'ac': return none(initRpn<V>());
    default: return none(s);
  }
}

export function pressRpn<V>(state: RpnState<V>, key: CalcKey, d: CalcDomain<V>): Result<V> {
  let s = state;
  if (s.error) {
    s = { ...s, error: false };
    if (key === 'bs') return none(s);
  }
  try {
    return step(s, key, d);
  } catch (e) {
    if (e instanceof CalcError) return none({ stack: s.stack, entry: null, error: true });
    throw e;
  }
}

export function currentRpnValue<V>(s: RpnState<V>, d: CalcDomain<V>): V {
  if (s.entry !== null) return d.parse(s.entry);
  return s.stack.length > 0 ? s.stack[s.stack.length - 1] : d.zero;
}

export function rpnDisplay<V>(s: RpnState<V>, d: CalcDomain<V>): string {
  return s.entry !== null ? d.formatEntry(s.entry) : d.format(currentRpnValue(s, d));
}

/** The registers above X, nearest first: `[Y, Z, T]` (fewer when the stack is short). */
export function rpnStackView<V>(s: RpnState<V>, d: CalcDomain<V>): string[] {
  const below = s.entry !== null ? s.stack : s.stack.slice(0, -1);
  return below.slice(-3).reverse().map(v => d.format(v));
}

/** Pushes a value as the new X (memory recall, history). A pending entry is pushed first. */
export function loadRpnValue<V>(s: RpnState<V>, value: V, d: CalcDomain<V>): RpnState<V> {
  return committed([...pushEntry(s, d), value]);
}

/** Replaces X with a value (bit toggle); a pending entry is discarded in favour of it. */
export function replaceRpnX<V>(s: RpnState<V>, value: V): RpnState<V> {
  if (s.entry !== null || s.stack.length === 0) return committed([...s.stack, value]);
  return committed([...s.stack.slice(0, -1), value]);
}

export function setRpnEntry<V>(s: RpnState<V>, entry: string): RpnState<V> {
  return { ...s, entry, error: false };
}
