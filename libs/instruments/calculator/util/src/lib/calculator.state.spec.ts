import { describe, expect, it } from 'vitest';

import { CalcKey } from './calculator.model';
import {
  CalcState, changeConvertCategory, copyText, initialCalcState, loadHistoryEntry, pasteText, pressKey,
  setProgBase, setProgWordSize, switchProfile, toggleProgBit, toggleRpnMode, HISTORY_LIMIT, DEFAULT_SETTINGS,
} from './calculator.state';
import { calcView, convertOutput } from './calculator-view';

const L = 'en';

function press(keys: CalcKey[], st: CalcState = initialCalcState()): CalcState {
  return keys.reduce((s, k) => pressKey(s, k, L), st);
}

function inProfile(profile: CalcState['settings']['profile']): CalcState {
  return initialCalcState({ ...DEFAULT_SETTINGS, profile });
}

describe('pressKey', () => {
  it('computes in basic and records history', () => {
    const st = press(['1', 'add', '2', 'eq']);
    expect(calcView(st, L).main).toBe('3');
    expect(st.history[0]).toEqual({ expression: '1 + 2', result: '3', value: '3', profile: 'basic' });
  });

  it('keeps at most 50 history entries, newest first', () => {
    let st = press(['1', 'add', '1', 'eq']);
    for (let i = 0; i < 60; i++) st = pressKey(st, 'eq', L);
    expect(st.history).toHaveLength(HISTORY_LIMIT);
    expect(st.history[0].result).toBe('62');
  });

  it('records the interpreted integer for programmer history', () => {
    const st = press(['0', 'sub', '1', 'eq'], inProfile('programmer'));
    expect(calcView(st, L).main).toBe('-1');
    expect(st.history[0].value).toBe('-1');
  });

  it('uses memory in scientific', () => {
    let st = press(['5', 'mplus', 'ac', 'mr'], inProfile('scientific'));
    expect(calcView(st, L).main).toBe('5');
    expect(calcView(st, L).memory).toBe(true);
    st = pressKey(st, 'mc', L);
    expect(calcView(st, L).memory).toBe(false);
  });

  it('toggles 2nd and the angle mode', () => {
    let st = pressKey(inProfile('scientific'), 'second', L);
    expect(st.second).toBe(true);
    st = press(['9', '0', 'sin'], st);
    expect(calcView(st, L).main).toBe('1');
    st = press(['angle', '9', '0', 'sin'], st);
    expect(st.settings.angle).toBe('rad');
    expect(calcView(st, L).main).toBe('0.8939966636005579');
  });

  it('edits the convert entry', () => {
    let st = press(['1', 'point', '5'], inProfile('convert'));
    expect(st.convertEntry).toBe('1.5');
    st = pressKey(st, 'ac', L);
    expect(st.convertEntry).toBe('0');
  });
});

describe('profile and mode switches', () => {
  it('carries the value into programmer, truncated', () => {
    const st = switchProfile(press(['1', '2', 'point', '9']), 'programmer', L);
    expect(calcView(st, L).main).toBe('12');
  });

  it('carries a pending calculation\'s shown value', () => {
    const st = switchProfile(press(['2', 'add']), 'scientific', L);
    expect(calcView(st, L).main).toBe('2');
    expect(calcView(pressKey(st, 'eq', L), L).main).toBe('4');
  });

  it('carries a negative programmer value back to basic', () => {
    const prog = press(['0', 'sub', '1', 'eq'], inProfile('programmer'));
    expect(calcView(switchProfile(prog, 'basic', L), L).main).toBe('-1');
  });

  it('seeds convert with the current value', () => {
    const st = switchProfile(press(['5']), 'convert', L);
    expect(st.convertEntry).toBe('5');
    expect(convertOutput(st, L).startsWith('3.106855961')).toBe(true);
  });

  it('carries the value into RPN and back', () => {
    const rpn = toggleRpnMode(press(['7']), L);
    expect(rpn.settings.rpn).toBe(true);
    expect(calcView(rpn, L).main).toBe('7');
    expect(calcView(toggleRpnMode(rpn, L), L).main).toBe('7');
  });

  it('resets the convert units when the category changes', () => {
    const st = changeConvertCategory(inProfile('convert'), 'temperature');
    expect(st.settings.convertFrom).toBe('C');
    expect(st.settings.convertTo).toBe('F');
  });
});

describe('programmer settings', () => {
  it('commits the typed entry when the base changes', () => {
    const st = setProgBase(press(['2', '5', '5'], inProfile('programmer')), 16);
    expect(calcView(st, L).main).toBe('FF');
  });

  it('truncates when the word size shrinks', () => {
    const st = setProgWordSize(press(['3', '0', '0'], inProfile('programmer')), 8);
    expect(calcView(st, L).main).toBe('44');
  });

  it('toggles a bit of the shown value', () => {
    expect(calcView(toggleProgBit(inProfile('programmer'), 0), L).main).toBe('1');
  });
});

describe('paste, copy and history', () => {
  it('pastes a formatted number into basic', () => {
    expect(calcView(pasteText(initialCalcState(), "1'234.5", L), L).main).toBe('1,234.5');
    expect(pasteText(initialCalcState(), 'abc', L)).toEqual(initialCalcState());
  });

  it('pastes hex into programmer', () => {
    const st = setProgBase(inProfile('programmer'), 16);
    expect(calcView(pasteText(st, '0xff', L), L).main).toBe('FF');
  });

  it('copies the unformatted value', () => {
    expect(copyText(press(['1', 'div', '3', 'eq']), L)).toBe('0.3333333333333333');
    const hex = press(['F', 'F'], setProgBase(inProfile('programmer'), 16));
    expect(copyText(hex, L)).toBe('FF');
  });

  it('loads a history entry, but no fraction into programmer', () => {
    const entry = { expression: '1 ÷ 2', result: '0.5', value: '0.5', profile: 'basic' as const };
    expect(calcView(loadHistoryEntry(initialCalcState(), entry, L), L).main).toBe('0.5');
    const prog = inProfile('programmer');
    expect(loadHistoryEntry(prog, entry, L)).toBe(prog);
  });
});
