import { describe, expect, it } from 'vitest';

import { CalcKey } from './calculator.model';
import { DEFAULT_SETTINGS, initialCalcState, pressKey } from './calculator.state';
import { restoreCalc, serializeCalc } from './calculator-persist';

describe('restoreCalc', () => {
  it('falls back to defaults on missing or broken data', () => {
    expect(restoreCalc(null)).toEqual(initialCalcState());
    expect(restoreCalc('garbage{')).toEqual(initialCalcState());
    expect(restoreCalc('42')).toEqual(initialCalcState());
  });

  it('round-trips settings, memory and history', () => {
    let st = initialCalcState({ ...DEFAULT_SETTINGS, profile: 'scientific', rpn: false, angle: 'rad' });
    st = (['4', 'mplus', '1', 'add', '1', 'eq'] as CalcKey[]).reduce((s, k) => pressKey(s, k, 'en'), st);
    const restored = restoreCalc(serializeCalc(st));
    expect(restored.settings).toEqual(st.settings);
    expect(restored.memory).toBe('4');
    expect(restored.history).toEqual(st.history);
  });

  it('repairs invalid fields individually', () => {
    const json = JSON.stringify({
      settings: { ...DEFAULT_SETTINGS, profile: 'graphing', wordSize: 12, convertCategory: 'mass', convertFrom: 'km' },
      memory: 'not-a-number',
      history: [{ expression: 'x' }, { expression: '1 + 1', result: '2', value: '2', profile: 'basic' }],
    });
    const st = restoreCalc(json);
    expect(st.settings.profile).toBe('basic');
    expect(st.settings.wordSize).toBe(64);
    expect(st.settings.convertCategory).toBe('mass');
    expect(st.settings.convertFrom).toBe('kg');
    expect(st.memory).toBe('0');
    expect(st.history).toHaveLength(1);
  });
});
