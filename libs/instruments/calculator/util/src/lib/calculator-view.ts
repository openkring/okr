import { decimalDomain } from './calculator-decimal';
import { CalcDomain } from './calculator-domain';
import { formatDecimal, formatDecimalEntry, separatorsFor } from './calculator-format';
import { infixDisplay, InfixState } from './calculator-infix';
import {
  basicKeys, convertKeys, disabledDigits, KeypadOptions, KeypadPanel, programmerKeys, scientificKeys,
} from './calculator-keypads';
import { programmerDomain } from './calculator-programmer';
import { rpnDisplay, RpnState, rpnStackView } from './calculator-rpn';
import { CalcState, convertValue } from './calculator.state';
import { CalcKey, CalcProfile, DigitKey } from './calculator.model';

export interface CalcView {
  readonly main: string;
  /** Registers above X in RPN mode, nearest first (`[Y, Z, T]`); empty otherwise. */
  readonly stack: readonly string[];
  readonly error: boolean;
  readonly acLabel: 'AC' | 'C';
  readonly memory: boolean;
}

function engineView<V>(rpn: boolean, infix: InfixState<V>, stack: RpnState<V>, d: CalcDomain<V>, memory: boolean): CalcView {
  if (rpn) return { main: rpnDisplay(stack, d), stack: rpnStackView(stack, d), error: stack.error, acLabel: 'AC', memory };
  return { main: infixDisplay(infix, d), stack: [], error: infix.error, acLabel: infix.entry !== null ? 'C' : 'AC', memory };
}

export function calcView(st: CalcState, locale: string): CalcView {
  const memory = st.memory !== '0';
  switch (st.settings.profile) {
    case 'convert':
      return { main: formatDecimalEntry(st.convertEntry, locale), stack: [], error: false, acLabel: 'AC', memory };
    case 'programmer':
      return engineView(st.settings.rpn, st.progInfix, st.progRpn, programmerDomain(st.settings), memory);
    default:
      return engineView(st.settings.rpn, st.decInfix, st.decRpn, decimalDomain({ angle: st.settings.angle, locale }), memory);
  }
}

export function convertOutput(st: CalcState, locale: string): string {
  const value = convertValue(st);
  return value ? formatDecimal(value, locale) : '';
}

export function chipsFor(st: CalcState): string[] {
  const p = st.settings.profile;
  const chips: string[] = [];
  if (st.settings.rpn && p !== 'convert') chips.push('RPN');
  if (p === 'scientific') {
    chips.push(st.settings.angle === 'deg' ? 'Deg' : 'Rad');
    if (st.second) chips.push('2nd');
  }
  if (st.memory !== '0' && (p === 'basic' || p === 'scientific')) chips.push('M');
  return chips;
}

export function keypadsFor(st: CalcState, locale: string): KeypadPanel[] {
  const o: KeypadOptions = {
    rpn: st.settings.rpn,
    acLabel: calcView(st, locale).acLabel,
    second: st.second,
    angle: st.settings.angle,
    decimalLabel: separatorsFor(locale).decimal,
  };
  switch (st.settings.profile) {
    case 'scientific': return [{ keys: scientificKeys(o), columns: 6 }, { keys: basicKeys(o), columns: 4 }];
    case 'programmer': return [{ keys: programmerKeys(o), columns: 7 }];
    case 'convert': return [{ keys: convertKeys(o), columns: 3 }];
    default: return [{ keys: basicKeys(o), columns: 4 }];
  }
}

export function disabledKeysFor(st: CalcState): CalcKey[] {
  return st.settings.profile === 'programmer' ? disabledDigits(st.settings.base) : [];
}

/** Physical key → calculator key; null when the key means nothing in this profile. */
export function keyFromKeyboard(key: string, profile: CalcProfile): CalcKey | null {
  if (/^[0-9]$/.test(key)) return key as DigitKey;
  if (profile === 'programmer' && /^[a-fA-F]$/.test(key)) return key.toUpperCase() as DigitKey;
  switch (key) {
    case '.': case ',': return 'point';
    case '+': return 'add';
    case '-': return 'sub';
    case '*': return 'mul';
    case '/': return 'div';
    case '^': return profile === 'scientific' ? 'pow' : null;
    case '%': return profile === 'programmer' ? 'mod' : 'pct';
    case '(': return 'open';
    case ')': return 'close';
    case 'Enter': case '=': return 'eq';
    case 'Backspace': return 'bs';
    case 'Escape': return 'ac';
    default: return null;
  }
}

const EDITABLE_TAGS = ['INPUT', 'TEXTAREA', 'SELECT', 'ION-INPUT', 'ION-TEXTAREA', 'ION-SELECT', 'ION-SEARCHBAR'];
const OVERLAYS = 'ion-popover, ion-modal, ion-alert, ion-action-sheet, ion-picker, ion-menu';

/**
 * Whether a keyboard/paste event target belongs to something else: a field, or anything inside an
 * Ionic overlay (an open select popover renders its options there, outside the select element).
 */
export function isIgnoredKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if ((target as HTMLElement).isContentEditable || EDITABLE_TAGS.includes(target.tagName)) return true;
  return target.closest(OVERLAYS) !== null;
}
