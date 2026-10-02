export type CalcProfile = 'basic' | 'scientific' | 'programmer' | 'convert';
export const CALC_PROFILES: readonly CalcProfile[] = ['basic', 'scientific', 'programmer', 'convert'];

export type AngleMode = 'deg' | 'rad';

export type ProgBase = 16 | 10 | 8 | 2;
export const PROG_BASES: readonly ProgBase[] = [16, 10, 8, 2];

export type WordSize = 8 | 16 | 32 | 64;
export const WORD_SIZES: readonly WordSize[] = [8, 16, 32, 64];

export const DIGIT_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', '00', 'FF'] as const;
export type DigitKey = typeof DIGIT_KEYS[number];

export const BINARY_OPS = ['add', 'sub', 'mul', 'div', 'pow', 'ypowx', 'root', 'logy', 'mod', 'and', 'or', 'xor', 'nor', 'shl', 'shr'] as const;
export type BinaryOp = typeof BINARY_OPS[number];

export const UNARY_OPS = [
  'neg', 'sq', 'cube', 'exp', 'pow10', 'pow2', 'inv', 'sqrt', 'cbrt', 'ln', 'log10', 'log2', 'fact',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'shl1', 'shr1', 'rol', 'ror', 'ones',
] as const;
export type UnaryOp = typeof UNARY_OPS[number];

export const CONSTANT_KEYS = ['pi', 'e', 'rand'] as const;
export type ConstantKey = typeof CONSTANT_KEYS[number];

/** Every key the engines understand. `eq` doubles as RPN `Enter`. */
export type CalcKey =
  | DigitKey | BinaryOp | UnaryOp | ConstantKey
  | 'point' | 'ee' | 'pct' | 'eq' | 'ac' | 'bs' | 'open' | 'close'
  | 'mc' | 'mplus' | 'mminus' | 'mr' | 'second' | 'angle'
  | 'swap' | 'roll' | 'drop';

const DIGIT_SET: ReadonlySet<string> = new Set(DIGIT_KEYS);
const BINARY_SET: ReadonlySet<string> = new Set(BINARY_OPS);
const UNARY_SET: ReadonlySet<string> = new Set(UNARY_OPS);
const CONSTANT_SET: ReadonlySet<string> = new Set(CONSTANT_KEYS);

export function isDigitKey(key: CalcKey): key is DigitKey { return DIGIT_SET.has(key); }
export function isBinaryOp(key: CalcKey): key is BinaryOp { return BINARY_SET.has(key); }
export function isUnaryOp(key: CalcKey): key is UnaryOp { return UNARY_SET.has(key); }
export function isConstantKey(key: CalcKey): key is ConstantKey { return CONSTANT_SET.has(key); }

/** Operator symbols used in the expression text of the history strip. */
export const OP_SYMBOLS: Record<BinaryOp, string> = {
  add: '+', sub: '−', mul: '×', div: '÷', pow: '^', ypowx: 'yˣ', root: 'ʸ√', logy: 'log_y',
  mod: 'mod', and: 'AND', or: 'OR', xor: 'XOR', nor: 'NOR', shl: '<<', shr: '>>',
};

/** Function names used in the expression text, rendered as `name(x)`. */
export const FN_NAMES: Record<UnaryOp, string> = {
  neg: '−', sq: 'sqr', cube: 'cube', exp: 'exp', pow10: '10^', pow2: '2^', inv: '1/', sqrt: '√', cbrt: '∛',
  ln: 'ln', log10: 'log', log2: 'log₂', fact: 'fact',
  sin: 'sin', cos: 'cos', tan: 'tan', asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', asinh: 'sinh⁻¹', acosh: 'cosh⁻¹', atanh: 'tanh⁻¹',
  shl1: '<<1', shr1: '>>1', rol: 'ROL', ror: 'ROR', ones: 'NOT',
};

export const CONST_SYMBOLS: Record<ConstantKey, string> = { pi: 'π', e: 'e', rand: 'Rand' };

/** One line of the history strip. `value` is a plain decimal string (programmer: the interpreted integer). */
export interface HistoryEntry {
  readonly expression: string;
  readonly result: string;
  readonly value: string;
  readonly profile: CalcProfile;
}
