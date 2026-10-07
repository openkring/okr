import { describe, expect, it } from 'vitest';
import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH } from '@okr/shared-constants';
import { I18nEntryFormModel, i18nEntryValidations, normalizeI18nEntry } from './i18n-entry.validations';

function entry(patch: Partial<I18nEntryFormModel> = {}): I18nEntryFormModel {
  return {
    module: 'chat/feature', key: 'fields.reconnecting',
    de: 'Verbinde neu…', en: 'Reconnecting…', fr: '', es: '', it: '',
    isHtml: false,
    ...patch,
  };
}

describe('i18nEntryValidations', () => {
  it('accepts a complete entry', () => {
    expect(i18nEntryValidations(entry()).isValid()).toBe(true);
  });

  it('accepts empty module, key and texts (nothing is mandatory)', () => {
    expect(i18nEntryValidations(entry({ module: '', key: '', de: '', en: '' })).isValid()).toBe(true);
  });

  it('rejects a module longer than LONG_NAME_LENGTH', () => {
    expect(i18nEntryValidations(entry({ module: 'x'.repeat(LONG_NAME_LENGTH + 1) })).hasErrors('module')).toBe(true);
  });

  it('rejects a key longer than LONG_NAME_LENGTH', () => {
    expect(i18nEntryValidations(entry({ key: 'x'.repeat(LONG_NAME_LENGTH + 1) })).hasErrors('key')).toBe(true);
  });

  it('accepts a translation of exactly DESCRIPTION_LENGTH', () => {
    expect(i18nEntryValidations(entry({ fr: 'x'.repeat(DESCRIPTION_LENGTH) })).isValid()).toBe(true);
  });

  it('rejects a translation longer than DESCRIPTION_LENGTH', () => {
    expect(i18nEntryValidations(entry({ it: 'x'.repeat(DESCRIPTION_LENGTH + 1) })).hasErrors('it')).toBe(true);
  });

  it('rejects a missing language field', () => {
    const broken = { ...entry(), es: undefined } as unknown as I18nEntryFormModel;
    expect(i18nEntryValidations(broken).hasErrors('es')).toBe(true);
  });
});

describe('normalizeI18nEntry', () => {
  it('fills missing fields of a legacy row', () => {
    const legacy = { okey: 'k1', module: 'chat/feature', key: 'a.b', de: 'Hallo' } as Partial<I18nEntryFormModel> & { okey: string };
    const result = normalizeI18nEntry(legacy);
    expect(result).toEqual({ okey: 'k1', module: 'chat/feature', key: 'a.b', de: 'Hallo', en: '', fr: '', es: '', it: '', isHtml: false });
    expect(i18nEntryValidations(result).isValid()).toBe(true);
  });

  it('keeps existing values and extra fields', () => {
    const full = { ...entry({ isHtml: true }), tenantId: 'scs' };
    expect(normalizeI18nEntry(full)).toEqual(full);
  });
});
