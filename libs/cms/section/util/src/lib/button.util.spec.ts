import { describe, expect, it } from 'vitest';

import { ButtonAction } from '@okr/shared-models';

import { RETIRED_BUTTON_ACTIONS, buttonActionChoices, toCssLength } from './button.util';

describe('toCssLength', () => {
  it('adds px to a plain number string', () => {
    expect(toCssLength('120', '60')).toBe('120px');
  });
  it('adds px to a number', () => {
    expect(toCssLength(80, '60')).toBe('80px');
  });
  it('keeps a value with a unit', () => {
    expect(toCssLength('4rem', '60')).toBe('4rem');
    expect(toCssLength('50%', '60')).toBe('50%');
    expect(toCssLength('60px', '60')).toBe('60px');
  });
  it('falls back on an empty value', () => {
    expect(toCssLength('', '60')).toBe('60px');
    expect(toCssLength(undefined, '60')).toBe('60px');
    expect(toCssLength('  ', '60')).toBe('60px');
  });
  it('returns an empty string when the fallback is empty too', () => {
    expect(toCssLength(undefined, '')).toBe('');
  });
});

describe('buttonActionChoices', () => {
  const all = Object.values(ButtonAction).filter((v): v is number => typeof v === 'number').map((id) => ({ id }));

  it('retires exactly Navigate and Browse', () => {
    expect([...RETIRED_BUTTON_ACTIONS].sort()).toEqual([ButtonAction.Navigate, ButtonAction.Browse].sort());
  });

  it('leaves out Navigate and Browse', () => {
    const ids = buttonActionChoices(all, ButtonAction.Download).map((a) => a.id);
    expect(ids).not.toContain(ButtonAction.Navigate);
    expect(ids).not.toContain(ButtonAction.Browse);
    expect(ids).toContain(ButtonAction.Download);
    expect(ids).toContain(ButtonAction.ContractDocument);
    expect(ids).toHaveLength(all.length - 2);
  });

  it('keeps the retired action a button has now', () => {
    expect(buttonActionChoices(all, ButtonAction.Browse).map((a) => a.id)).toContain(ButtonAction.Browse);
    expect(buttonActionChoices(all, ButtonAction.Browse).map((a) => a.id)).not.toContain(ButtonAction.Navigate);
  });

  it('works without a current action', () => {
    expect(buttonActionChoices(all, undefined)).toHaveLength(all.length - 2);
  });
});
