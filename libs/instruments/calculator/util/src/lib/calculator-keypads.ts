import { AngleMode, CalcKey, ProgBase } from './calculator.model';

export type KeyKind = 'digit' | 'op' | 'fn' | 'eq' | 'util';

export interface KeyDef {
  readonly id: CalcKey;
  readonly label: string;
  readonly kind: KeyKind;
  readonly span?: number;
  readonly active?: boolean;
}

export interface KeypadPanel {
  readonly keys: readonly KeyDef[];
  readonly columns: number;
}

export interface KeypadOptions {
  readonly rpn: boolean;
  readonly acLabel: 'AC' | 'C';
  readonly second: boolean;
  readonly angle: AngleMode;
  readonly decimalLabel: string;
}

const k = (id: CalcKey, label: string, kind: KeyKind, span?: number): KeyDef =>
  ({ id, label, kind, ...(span ? { span } : {}) });
const digit = (id: CalcKey): KeyDef => k(id, id, 'digit');

/** macOS basic layout, 4 columns. RPN: `%` becomes x↔y, `=` becomes Enter. */
export function basicKeys(o: KeypadOptions): KeyDef[] {
  return [
    k('ac', o.acLabel, 'util'), k('neg', '±', 'util'), o.rpn ? k('swap', 'x↔y', 'util') : k('pct', '%', 'util'), k('div', '÷', 'op'),
    digit('7'), digit('8'), digit('9'), k('mul', '×', 'op'),
    digit('4'), digit('5'), digit('6'), k('sub', '−', 'op'),
    digit('1'), digit('2'), digit('3'), k('add', '+', 'op'),
    digit('0'), k('point', o.decimalLabel, 'digit'), k('bs', '⌫', 'util'), k('eq', o.rpn ? 'Enter' : '=', 'eq'),
  ];
}

/** Scientific panel, 6 columns, left of the basic keypad. `2nd` swaps in the alternate functions. */
export function scientificKeys(o: KeypadOptions): KeyDef[] {
  const alt = o.second;
  return [
    o.rpn ? k('swap', 'x↔y', 'fn') : k('open', '(', 'fn'), o.rpn ? k('roll', 'R↓', 'fn') : k('close', ')', 'fn'),
    k('mc', 'mc', 'fn'), k('mplus', 'm+', 'fn'), k('mminus', 'm−', 'fn'), k('mr', 'mr', 'fn'),
    { ...k('second', '2nd', 'fn'), active: alt }, k('sq', 'x²', 'fn'), k('cube', 'x³', 'fn'), k('pow', 'xʸ', 'fn'),
    alt ? k('ypowx', 'yˣ', 'fn') : k('exp', 'eˣ', 'fn'), alt ? k('pow2', '2ˣ', 'fn') : k('pow10', '10ˣ', 'fn'),
    k('inv', '¹/x', 'fn'), k('sqrt', '²√x', 'fn'), k('cbrt', '∛x', 'fn'), k('root', 'ʸ√x', 'fn'),
    alt ? k('logy', 'log_y', 'fn') : k('ln', 'ln', 'fn'), alt ? k('log2', 'log₂', 'fn') : k('log10', 'log₁₀', 'fn'),
    k('fact', 'x!', 'fn'), alt ? k('asin', 'sin⁻¹', 'fn') : k('sin', 'sin', 'fn'),
    alt ? k('acos', 'cos⁻¹', 'fn') : k('cos', 'cos', 'fn'), alt ? k('atan', 'tan⁻¹', 'fn') : k('tan', 'tan', 'fn'),
    k('e', 'e', 'fn'), k('ee', 'EE', 'fn'),
    k('angle', o.angle === 'deg' ? 'Rad' : 'Deg', 'fn'), alt ? k('asinh', 'sinh⁻¹', 'fn') : k('sinh', 'sinh', 'fn'),
    alt ? k('acosh', 'cosh⁻¹', 'fn') : k('cosh', 'cosh', 'fn'), alt ? k('atanh', 'tanh⁻¹', 'fn') : k('tanh', 'tanh', 'fn'),
    k('pi', 'π', 'fn'), k('rand', 'Rand', 'fn'),
  ];
}

/** Programmer layout, 7 columns. RPN: `(` `)` become x↔y and R↓. */
export function programmerKeys(o: KeypadOptions): KeyDef[] {
  return [
    k('and', 'AND', 'fn'), k('or', 'OR', 'fn'), k('xor', 'XOR', 'fn'), k('nor', 'NOR', 'fn'), digit('D'), digit('E'), digit('F'),
    k('shl', 'x<<y', 'fn'), k('shr', 'x>>y', 'fn'), k('shl1', '<<', 'fn'), k('shr1', '>>', 'fn'), digit('A'), digit('B'), digit('C'),
    k('rol', 'ROL', 'fn'), k('ror', 'ROR', 'fn'), k('neg', '2’s', 'fn'), k('ones', '1’s', 'fn'), digit('7'), digit('8'), digit('9'),
    k('mod', 'mod', 'op'), k('ac', o.acLabel, 'util'), k('bs', '⌫', 'util'), k('div', '÷', 'op'), digit('4'), digit('5'), digit('6'),
    o.rpn ? k('swap', 'x↔y', 'fn') : k('open', '(', 'fn'), o.rpn ? k('roll', 'R↓', 'fn') : k('close', ')', 'fn'),
    k('mul', '×', 'op'), k('sub', '−', 'op'), digit('1'), digit('2'), digit('3'),
    k('add', '+', 'op', 3), k('eq', o.rpn ? 'Enter' : '=', 'eq'), digit('0'), digit('00'), digit('FF'),
  ];
}

/** Reduced keypad for the convert profile, 3 columns. */
export function convertKeys(o: KeypadOptions): KeyDef[] {
  return [
    k('ac', 'AC', 'util'), k('bs', '⌫', 'util'), k('neg', '±', 'util'),
    digit('7'), digit('8'), digit('9'),
    digit('4'), digit('5'), digit('6'),
    digit('1'), digit('2'), digit('3'),
    k('0', '0', 'digit', 2), k('point', o.decimalLabel, 'digit'),
  ];
}

const ALL_DIGITS: readonly CalcKey[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];

export function disabledDigits(base: ProgBase): CalcKey[] {
  return [...ALL_DIGITS.slice(base), ...(base !== 16 ? ['FF' as const] : [])];
}
