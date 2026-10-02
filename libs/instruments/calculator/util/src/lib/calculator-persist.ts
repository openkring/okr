import { Dec } from './calculator-decimal';
import { CALC_PROFILES, HistoryEntry, PROG_BASES, WORD_SIZES } from './calculator.model';
import { CalcSettings, CalcState, DEFAULT_SETTINGS, HISTORY_LIMIT, initialCalcState } from './calculator.state';
import { findCategory, UNIT_CATEGORIES } from './calculator-units';

export const CALC_STORAGE_KEY = 'okr.calculator.v1';

/** Only settings, memory and history survive a reload — never the value in progress. */
export function serializeCalc(st: CalcState): string {
  return JSON.stringify({ settings: st.settings, memory: st.memory, history: st.history });
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

function sanitizeSettings(raw: unknown): CalcSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const category = findCategory(pick(o['convertCategory'], UNIT_CATEGORIES.map(c => c.id), d.convertCategory));
  const unitIds = category.units.map(u => u.id);
  return {
    profile: pick(o['profile'], CALC_PROFILES, d.profile),
    rpn: typeof o['rpn'] === 'boolean' ? o['rpn'] : d.rpn,
    angle: pick(o['angle'], ['deg', 'rad'] as const, d.angle),
    base: pick(o['base'], PROG_BASES, d.base),
    wordSize: pick(o['wordSize'], WORD_SIZES, d.wordSize),
    signed: typeof o['signed'] === 'boolean' ? o['signed'] : d.signed,
    convertCategory: category.id,
    convertFrom: pick(o['convertFrom'], unitIds, category.defaultFrom),
    convertTo: pick(o['convertTo'], unitIds, category.defaultTo),
  };
}

function isDecimalString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new Dec(value).isFinite();
  } catch {
    return false;
  }
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  const e = value as Partial<HistoryEntry> | null;
  return !!e && typeof e.expression === 'string' && typeof e.result === 'string'
    && isDecimalString(e.value) && CALC_PROFILES.includes(e.profile as never);
}

/** Restores a stored state; anything missing or invalid falls back to its default, field by field. */
export function restoreCalc(json: string | null): CalcState {
  if (!json) return initialCalcState();
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return initialCalcState();
  }
  if (!raw || typeof raw !== 'object') return initialCalcState();
  const o = raw as Record<string, unknown>;
  const history = Array.isArray(o['history']) ? o['history'].filter(isHistoryEntry).slice(0, HISTORY_LIMIT) : [];
  return {
    ...initialCalcState(sanitizeSettings(o['settings'])),
    memory: isDecimalString(o['memory']) ? o['memory'] : '0',
    history,
  };
}
