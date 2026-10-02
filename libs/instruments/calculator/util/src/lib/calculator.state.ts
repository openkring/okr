import type Decimal from 'decimal.js';

import { decimalDomain, Dec, parseDecimalEntry } from './calculator-decimal';
import { CalcDomain, Completed } from './calculator-domain';
import { appendDigit, appendPoint, backspace, toggleSign } from './calculator-entry';
import { parsePastedDecimal, parsePastedProgrammer } from './calculator-format';
import {
  currentInfixValue, initInfix, InfixState, loadInfixValue, pressInfix, setInfixEntry,
} from './calculator-infix';
import {
  decimalToProgrammer, interpret, programmerDomain, programmerRaw, programmerToDecimal, toggleBit, wrap,
} from './calculator-programmer';
import {
  currentRpnValue, initRpn, loadRpnValue, pressRpn, replaceRpnX, RpnState, setRpnEntry,
} from './calculator-rpn';
import { convertUnit, findCategory, UnitCategoryId } from './calculator-units';
import {
  AngleMode, CalcKey, CalcProfile, HistoryEntry, isDigitKey, ProgBase, WordSize,
} from './calculator.model';

export interface CalcSettings {
  readonly profile: CalcProfile;
  readonly rpn: boolean;
  readonly angle: AngleMode;
  readonly base: ProgBase;
  readonly wordSize: WordSize;
  readonly signed: boolean;
  readonly convertCategory: UnitCategoryId;
  readonly convertFrom: string;
  readonly convertTo: string;
}

export interface CalcState {
  readonly settings: CalcSettings;
  readonly second: boolean;
  /** Plain decimal string; `'0'` means empty. */
  readonly memory: string;
  readonly history: readonly HistoryEntry[];
  readonly decInfix: InfixState<Decimal>;
  readonly decRpn: RpnState<Decimal>;
  readonly progInfix: InfixState<bigint>;
  readonly progRpn: RpnState<bigint>;
  readonly convertEntry: string;
}

export const HISTORY_LIMIT = 50;

export const DEFAULT_SETTINGS: CalcSettings = {
  profile: 'basic', rpn: false, angle: 'deg', base: 10, wordSize: 64, signed: true,
  convertCategory: 'length', convertFrom: 'km', convertTo: 'mi',
};

/** Entry editing for convert; locale only matters for formatting, which is not used here. */
const CONVERT_DOMAIN = decimalDomain({ angle: 'deg', locale: 'en' });

function decDomain(st: CalcState, locale: string): CalcDomain<Decimal> {
  return decimalDomain({ angle: st.settings.angle, locale });
}

function progDomain(st: CalcState): CalcDomain<bigint> {
  return programmerDomain(st.settings);
}

function withSettings(st: CalcState, patch: Partial<CalcSettings>): CalcState {
  return { ...st, settings: { ...st.settings, ...patch } };
}

export function initialCalcState(settings: CalcSettings = DEFAULT_SETTINGS): CalcState {
  const dd = decimalDomain({ angle: settings.angle, locale: 'en' });
  return {
    settings, second: false, memory: '0', history: [],
    decInfix: initInfix(dd), decRpn: initRpn<Decimal>(),
    progInfix: initInfix(programmerDomain(settings)), progRpn: initRpn<bigint>(),
    convertEntry: '0',
  };
}

export function currentProgValue(st: CalcState): bigint {
  const d = progDomain(st);
  return st.settings.rpn ? currentRpnValue(st.progRpn, d) : currentInfixValue(st.progInfix, d);
}

/** The shown value as a decimal, whatever the profile. */
export function currentDecimal(st: CalcState, locale: string): Decimal {
  switch (st.settings.profile) {
    case 'convert': return parseDecimalEntry(st.convertEntry);
    case 'programmer': return programmerToDecimal(currentProgValue(st), st.settings);
    default: {
      const d = decDomain(st, locale);
      return st.settings.rpn ? currentRpnValue(st.decRpn, d) : currentInfixValue(st.decInfix, d);
    }
  }
}

function loadDecimal(st: CalcState, value: Decimal, locale: string): CalcState {
  const d = decDomain(st, locale);
  return st.settings.rpn
    ? { ...st, decRpn: loadRpnValue(st.decRpn, value, d) }
    : { ...st, decInfix: loadInfixValue(st.decInfix, value, d) };
}

function loadProg(st: CalcState, value: bigint): CalcState {
  const d = progDomain(st);
  return st.settings.rpn
    ? { ...st, progRpn: loadRpnValue(st.progRpn, value, d) }
    : { ...st, progInfix: loadInfixValue(st.progInfix, value, d) };
}

function addHistory<V>(st: CalcState, completed: Completed<V> | null, d: CalcDomain<V>, raw: (v: V) => string): CalcState {
  if (!completed) return st;
  const entry: HistoryEntry = {
    expression: completed.expression,
    result: d.format(completed.value),
    value: raw(completed.value),
    profile: st.settings.profile,
  };
  return { ...st, history: [entry, ...st.history].slice(0, HISTORY_LIMIT) };
}

function pressConvert(entry: string, key: CalcKey): string {
  if (isDigitKey(key)) return appendDigit(entry, key, CONVERT_DOMAIN) ?? entry;
  switch (key) {
    case 'point': return appendPoint(entry, CONVERT_DOMAIN) ?? entry;
    case 'neg': return toggleSign(entry);
    case 'bs': return backspace(entry);
    case 'ac': return '0';
    default: return entry;
  }
}

function pressMemory(st: CalcState, key: 'mc' | 'mplus' | 'mminus' | 'mr', locale: string): CalcState {
  const p = st.settings.profile;
  if (p === 'programmer' || p === 'convert') return st;
  if (key === 'mc') return { ...st, memory: '0' };
  if (key === 'mr') return loadDecimal(st, new Dec(st.memory), locale);
  const value = currentDecimal(st, locale);
  const memory = key === 'mplus' ? new Dec(st.memory).add(value) : new Dec(st.memory).sub(value);
  return loadDecimal({ ...st, memory: memory.toString() }, value, locale);
}

export function pressKey(st: CalcState, key: CalcKey, locale: string): CalcState {
  const p = st.settings.profile;
  if (p === 'convert') return { ...st, convertEntry: pressConvert(st.convertEntry, key) };
  if (key === 'second') return { ...st, second: !st.second };
  if (key === 'angle') return withSettings(st, { angle: st.settings.angle === 'deg' ? 'rad' : 'deg' });
  if (key === 'mc' || key === 'mplus' || key === 'mminus' || key === 'mr') return pressMemory(st, key, locale);
  if (p === 'programmer') {
    const d = progDomain(st);
    const raw = (v: bigint): string => interpret(v, st.settings).toString();
    if (st.settings.rpn) {
      const r = pressRpn(st.progRpn, key, d);
      return addHistory({ ...st, progRpn: r.state }, r.completed, d, raw);
    }
    const r = pressInfix(st.progInfix, key, d);
    return addHistory({ ...st, progInfix: r.state }, r.completed, d, raw);
  }
  const d = decDomain(st, locale);
  if (st.settings.rpn) {
    const r = pressRpn(st.decRpn, key, d);
    return addHistory({ ...st, decRpn: r.state }, r.completed, d, d.toRaw);
  }
  const r = pressInfix(st.decInfix, key, d);
  return addHistory({ ...st, decInfix: r.state }, r.completed, d, d.toRaw);
}

function seedProfile(st: CalcState, value: Decimal, locale: string): CalcState {
  switch (st.settings.profile) {
    case 'programmer': {
      const v = decimalToProgrammer(value, st.settings.wordSize);
      return { ...st, progInfix: initInfix(progDomain(st), v), progRpn: v === 0n ? initRpn<bigint>() : initRpn(v) };
    }
    case 'convert': {
      const text = value.toSignificantDigits(16).toFixed();
      return { ...st, convertEntry: CONVERT_DOMAIN.accepts(text) ? text : '0' };
    }
    default: {
      const d = decDomain(st, locale);
      return { ...st, decInfix: initInfix(d, value), decRpn: value.isZero() ? initRpn<Decimal>() : initRpn(value) };
    }
  }
}

const isDecimalProfile = (p: CalcProfile): boolean => p === 'basic' || p === 'scientific';

export function switchProfile(st: CalcState, profile: CalcProfile, locale: string): CalcState {
  const from = st.settings.profile;
  if (from === profile) return st;
  const next = withSettings({ ...st, second: false }, { profile });
  if (isDecimalProfile(from) && isDecimalProfile(profile)) return next;
  return seedProfile(next, currentDecimal(st, locale), locale);
}

export function toggleRpnMode(st: CalcState, locale: string): CalcState {
  const next = withSettings(st, { rpn: !st.settings.rpn });
  if (st.settings.profile === 'programmer') {
    const v = currentProgValue(st);
    return { ...next, progInfix: initInfix(progDomain(next), v), progRpn: v === 0n ? initRpn<bigint>() : initRpn(v) };
  }
  if (st.settings.profile === 'convert') return next;
  const value = currentDecimal(st, locale);
  return {
    ...next,
    decInfix: initInfix(decDomain(next, locale), value),
    decRpn: value.isZero() ? initRpn<Decimal>() : initRpn(value),
  };
}

/** Changing the base commits a typed entry first, so it is read in the base it was typed in. */
export function setProgBase(st: CalcState, base: ProgBase): CalcState {
  const d = progDomain(st);
  const progInfix = st.progInfix.entry !== null
    ? loadInfixValue(st.progInfix, d.parse(st.progInfix.entry), d) : st.progInfix;
  const progRpn = st.progRpn.entry !== null
    ? loadRpnValue({ ...st.progRpn, entry: null }, d.parse(st.progRpn.entry), d) : st.progRpn;
  return withSettings({ ...st, progInfix, progRpn }, { base });
}

export function setProgWordSize(st: CalcState, wordSize: WordSize): CalcState {
  const v = wrap(currentProgValue(st), wordSize);
  const next = withSettings(st, { wordSize });
  return { ...next, progInfix: initInfix(progDomain(next), v), progRpn: v === 0n ? initRpn<bigint>() : initRpn(v) };
}

export function setProgSigned(st: CalcState, signed: boolean): CalcState {
  return withSettings(st, { signed });
}

export function toggleProgBit(st: CalcState, index: number): CalcState {
  const v = toggleBit(currentProgValue(st), index, st.settings.wordSize);
  return st.settings.rpn
    ? { ...st, progRpn: replaceRpnX(st.progRpn, v) }
    : { ...st, progInfix: loadInfixValue(st.progInfix, v, progDomain(st)) };
}

export function changeConvertCategory(st: CalcState, id: UnitCategoryId): CalcState {
  const category = findCategory(id);
  return withSettings(st, { convertCategory: category.id, convertFrom: category.defaultFrom, convertTo: category.defaultTo });
}

export function changeConvertUnits(st: CalcState, from: string, to: string): CalcState {
  const ids = findCategory(st.settings.convertCategory).units.map(u => u.id);
  return ids.includes(from) && ids.includes(to) ? withSettings(st, { convertFrom: from, convertTo: to }) : st;
}

export function swapConvertUnits(st: CalcState): CalcState {
  return withSettings(st, { convertFrom: st.settings.convertTo, convertTo: st.settings.convertFrom });
}

export function convertValue(st: CalcState): Decimal | null {
  try {
    const s = st.settings;
    return convertUnit(s.convertCategory, s.convertFrom, s.convertTo, parseDecimalEntry(st.convertEntry));
  } catch {
    return null;
  }
}

export function loadHistoryEntry(st: CalcState, entry: HistoryEntry, locale: string): CalcState {
  let value: Decimal;
  try {
    value = new Dec(entry.value);
  } catch {
    return st;
  }
  switch (st.settings.profile) {
    case 'programmer':
      return value.isInteger() ? loadProg(st, decimalToProgrammer(value, st.settings.wordSize)) : st;
    case 'convert': {
      const text = value.toSignificantDigits(16).toFixed();
      return CONVERT_DOMAIN.accepts(text) ? { ...st, convertEntry: text } : st;
    }
    default:
      return loadDecimal(st, value, locale);
  }
}

export function clearCalcHistory(st: CalcState): CalcState {
  return { ...st, history: [] };
}

/** Pastes a number: as an editable entry when it fits, else as a value. Non-numbers are ignored. */
export function pasteText(st: CalcState, text: string, locale: string): CalcState {
  const p = st.settings.profile;
  if (p === 'programmer') {
    const t = parsePastedProgrammer(text, st.settings.base);
    const d = progDomain(st);
    if (t === null || !d.accepts(t)) return st;
    return st.settings.rpn
      ? { ...st, progRpn: setRpnEntry(st.progRpn, t) }
      : { ...st, progInfix: setInfixEntry(st.progInfix, t, d) };
  }
  const t = parsePastedDecimal(text);
  if (t === null) return st;
  if (p === 'convert') return CONVERT_DOMAIN.accepts(t) ? { ...st, convertEntry: t } : st;
  const d = decDomain(st, locale);
  if (!d.accepts(t)) return loadDecimal(st, d.parse(t), locale);
  return st.settings.rpn
    ? { ...st, decRpn: setRpnEntry(st.decRpn, t) }
    : { ...st, decInfix: setInfixEntry(st.decInfix, t, d) };
}

/** Unformatted clipboard text of the shown value (programmer: digits of the current base). */
export function copyText(st: CalcState, locale: string): string {
  switch (st.settings.profile) {
    case 'programmer': return programmerRaw(currentProgValue(st), st.settings);
    case 'convert': return convertValue(st)?.toSignificantDigits(16).toString() ?? '';
    default: return decDomain(st, locale).toRaw(currentDecimal(st, locale));
  }
}
