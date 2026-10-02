import { CalcDomain, CalcError, EngineResult } from './calculator-domain';
import { appendDigit, appendPoint, backspace, startExponent, toggleSign } from './calculator-entry';
import {
  BinaryOp, CalcKey, CONST_SYMBOLS, FN_NAMES, isBinaryOp, isConstantKey, isDigitKey, isUnaryOp, OP_SYMBOLS,
} from './calculator.model';

type StackOp = BinaryOp | '(';

/**
 * Two-stack operator-precedence calculator (macOS behaviour): intermediate results appear as soon
 * as they can be computed. `current` is the operand when nothing is being typed; `expr` is the
 * committed expression text, `operandText` the text of `current`.
 */
export interface InfixState<V> {
  readonly values: readonly V[];
  readonly ops: readonly StackOp[];
  readonly marks: readonly number[];
  readonly expr: string;
  readonly entry: string | null;
  readonly current: V;
  readonly operandText: string | null;
  readonly awaitingOperand: boolean;
  readonly evaluated: boolean;
  readonly repeat: { readonly op: BinaryOp; readonly operand: V } | null;
  readonly error: boolean;
}

type Result<V> = EngineResult<InfixState<V>, V>;

export function initInfix<V>(d: CalcDomain<V>, value?: V): InfixState<V> {
  return {
    values: [], ops: [], marks: [], expr: '', entry: null,
    current: value ?? d.zero, operandText: null,
    awaitingOperand: false, evaluated: false, repeat: null, error: false,
  };
}

function none<V>(state: InfixState<V>): Result<V> {
  return { state, completed: null };
}

function takeOperand<V>(s: InfixState<V>, d: CalcDomain<V>): { value: V; text: string } {
  if (s.entry !== null) {
    const value = d.parse(s.entry);
    return { value, text: d.format(value) };
  }
  return { value: s.current, text: s.operandText ?? d.format(s.current) };
}

function applyTop<V>(values: V[], ops: StackOp[], d: CalcDomain<V>): void {
  const op = ops.pop() as BinaryOp;
  const b = values.pop() as V;
  const a = values.pop() as V;
  values.push(d.binary(op, a, b));
}

function reduceFor<V>(op: BinaryOp, values: V[], ops: StackOp[], d: CalcDomain<V>): void {
  for (;;) {
    const top = ops[ops.length - 1];
    if (top === undefined || top === '(') return;
    const pTop = d.precedence(top);
    const pOp = d.precedence(op);
    if (pTop > pOp || (pTop === pOp && !d.rightAssoc(op))) applyTop(values, ops, d);
    else return;
  }
}

function pressBinary<V>(s: InfixState<V>, op: BinaryOp, d: CalcDomain<V>): Result<V> {
  const top = s.ops[s.ops.length - 1];
  if (s.awaitingOperand && s.entry === null && top !== undefined && top !== '(') {
    // Two operators in a row: the second replaces the first.
    const values = [...s.values];
    const ops = s.ops.slice(0, -1);
    reduceFor(op, values, ops, d);
    ops.push(op);
    const expr = s.expr.slice(0, -(OP_SYMBOLS[top].length + 2)) + ` ${OP_SYMBOLS[op]} `;
    return none({ ...s, values, ops, expr, current: values[values.length - 1] });
  }
  const base = s.evaluated ? { ...s, evaluated: false, repeat: null } : s;
  const { value, text } = takeOperand(base, d);
  const values = [...base.values, value];
  const ops = [...base.ops];
  reduceFor(op, values, ops, d);
  ops.push(op);
  return none({
    ...base, values, ops, expr: base.expr + text + ` ${OP_SYMBOLS[op]} `,
    entry: null, current: values[values.length - 1], operandText: null, awaitingOperand: true,
  });
}

function pressEquals<V>(s: InfixState<V>, d: CalcDomain<V>): Result<V> {
  if (s.evaluated) {
    if (!s.repeat) return none(s);
    const value = d.binary(s.repeat.op, s.current, s.repeat.operand);
    const expression = `${d.format(s.current)} ${OP_SYMBOLS[s.repeat.op]} ${d.format(s.repeat.operand)}`;
    return { state: { ...s, current: value, operandText: null }, completed: { expression, value } };
  }
  const { value, text } = takeOperand(s, d);
  if (s.ops.length === 0) {
    const completed = s.entry === null && s.operandText !== null ? { expression: text, value } : null;
    return { state: { ...initInfix(d, value), evaluated: true }, completed };
  }
  const values = [...s.values, value];
  const ops = [...s.ops];
  const lastOp = [...ops].reverse().find((o): o is BinaryOp => o !== '(');
  while (ops.length > 0) {
    if (ops[ops.length - 1] === '(') ops.pop();
    else applyTop(values, ops, d);
  }
  const result = values[0];
  const expression = s.expr + text + ')'.repeat(s.marks.length);
  return {
    state: { ...initInfix(d, result), evaluated: true, repeat: lastOp ? { op: lastOp, operand: value } : null },
    completed: { expression, value: result },
  };
}

function pressOpen<V>(state: InfixState<V>, d: CalcDomain<V>): Result<V> {
  const s = state.evaluated ? initInfix(d) : state;
  const atStart = s.ops.length === 0 && s.values.length === 0;
  if (s.entry !== null || !(s.awaitingOperand || atStart)) return none(s);
  return none({
    ...s, ops: [...s.ops, '('], marks: [...s.marks, s.expr.length], expr: s.expr + '(', awaitingOperand: true,
  });
}

function pressClose<V>(s: InfixState<V>, d: CalcDomain<V>): Result<V> {
  if (!s.ops.includes('(') || (s.awaitingOperand && s.entry === null)) return none(s);
  const { value, text } = takeOperand(s, d);
  const values = [...s.values, value];
  const ops = [...s.ops];
  while (ops[ops.length - 1] !== '(') applyTop(values, ops, d);
  ops.pop();
  const mark = s.marks[s.marks.length - 1];
  const current = values.pop() as V;
  return none({
    ...s, values, ops, marks: s.marks.slice(0, -1), expr: s.expr.slice(0, mark),
    entry: null, current, operandText: s.expr.slice(mark) + text + ')', awaitingOperand: false,
  });
}

function pressPercent<V>(s: InfixState<V>, d: CalcDomain<V>): Result<V> {
  const { value } = takeOperand(s, d);
  const top = s.ops[s.ops.length - 1];
  const result = (top === 'add' || top === 'sub') && !s.awaitingOperand
    ? d.percentOf(s.values[s.values.length - 1], value)
    : d.percent(value);
  return none({
    ...s, entry: null, current: result, operandText: d.format(result), awaitingOperand: false, evaluated: false,
  });
}

function pressClear<V>(s: InfixState<V>, d: CalcDomain<V>): Result<V> {
  if (s.entry === null) return none(initInfix(d));
  return none({ ...s, entry: null, current: d.zero, operandText: null, awaitingOperand: s.ops.length > 0 });
}

function step<V>(s: InfixState<V>, key: CalcKey, d: CalcDomain<V>): Result<V> {
  if (isDigitKey(key)) {
    const base = s.evaluated ? initInfix(d) : s;
    return none({ ...base, entry: appendDigit(base.entry, key, d), awaitingOperand: false });
  }
  if (isBinaryOp(key)) return pressBinary(s, key, d);
  if (key === 'neg' && s.entry !== null) return none({ ...s, entry: toggleSign(s.entry) });
  if (isUnaryOp(key)) {
    const { value, text } = takeOperand(s, d);
    const result = d.unary(key, value);
    return none({
      ...s, entry: null, current: result, operandText: `${FN_NAMES[key]}(${text})`,
      awaitingOperand: false, evaluated: false,
    });
  }
  if (isConstantKey(key)) {
    const base = s.evaluated ? initInfix(d) : s;
    const value = d.constant(key);
    const text = key === 'rand' ? d.format(value) : CONST_SYMBOLS[key];
    return none({ ...base, entry: null, current: value, operandText: text, awaitingOperand: false });
  }
  switch (key) {
    case 'point': {
      const base = s.evaluated ? initInfix(d) : s;
      return none({ ...base, entry: appendPoint(base.entry, d), awaitingOperand: false });
    }
    case 'ee': {
      const base = s.evaluated ? { ...initInfix(d, s.current) } : s;
      return none({ ...base, entry: startExponent(base.entry, d.toRaw(base.current), d), awaitingOperand: false });
    }
    case 'pct': return pressPercent(s, d);
    case 'eq': return pressEquals(s, d);
    case 'open': return pressOpen(s, d);
    case 'close': return pressClose(s, d);
    case 'ac': return pressClear(s, d);
    case 'bs': return none(s.entry !== null ? { ...s, entry: backspace(s.entry) } : s);
    default: return none(s);
  }
}

export function pressInfix<V>(state: InfixState<V>, key: CalcKey, d: CalcDomain<V>): Result<V> {
  let s = state;
  if (s.error) {
    s = initInfix(d);
    if (key === 'ac' || key === 'bs') return none(s);
  }
  try {
    return step(s, key, d);
  } catch (e) {
    if (e instanceof CalcError) return none({ ...initInfix(d), error: true });
    throw e;
  }
}

export function infixDisplay<V>(s: InfixState<V>, d: CalcDomain<V>): string {
  return s.entry !== null ? d.formatEntry(s.entry) : d.format(s.current);
}

export function currentInfixValue<V>(s: InfixState<V>, d: CalcDomain<V>): V {
  return s.entry !== null ? d.parse(s.entry) : s.current;
}

/** Puts a value in place of the current operand (memory recall, history, bit toggle). */
export function loadInfixValue<V>(s: InfixState<V>, value: V, d: CalcDomain<V>): InfixState<V> {
  const base = s.evaluated ? initInfix(d) : s;
  return { ...base, entry: null, current: value, operandText: null, awaitingOperand: false, error: false };
}

/** Puts typed text in place of the current operand (paste), so typing can continue. */
export function setInfixEntry<V>(s: InfixState<V>, entry: string, d: CalcDomain<V>): InfixState<V> {
  const base = s.evaluated ? initInfix(d) : s;
  return { ...base, entry, awaitingOperand: false, error: false };
}
