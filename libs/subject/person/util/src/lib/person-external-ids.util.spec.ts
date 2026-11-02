import { describe, expect, it } from 'vitest';

import { externalIdErrorKey, externalIdKeyOptions, fromProperties, toProperties } from './person-external-ids.util';

describe('toProperties / fromProperties', () => {
  it('round-trips a valid map', () => {
    const map = { js: '123456789', bexio_gss: '4711' };
    expect(fromProperties(toProperties(map))).toEqual(map);
  });

  it('shows a map as a list sorted by key, and nothing for an absent map', () => {
    expect(toProperties({ js: '123456789', bexio_gss: '4711' })).toEqual([
      { key: 'bexio_gss', value: '4711' },
      { key: 'js', value: '123456789' },
    ]);
    expect(toProperties(undefined)).toEqual([]);
    expect(toProperties({})).toEqual([]);
  });

  it('keeps an invalid stored entry in the list so the user can see and remove it', () => {
    expect(toProperties({ js: '12' })).toEqual([{ key: 'js', value: '12' }]);
  });

  it('drops an unknown kind', () => {
    expect(fromProperties([{ key: 'ahv', value: '7561234567890' }])).toEqual({});
  });

  it('drops a bad value', () => {
    expect(fromProperties([{ key: 'js', value: '12345678' }, { key: 'bexio_gss', value: 'abc' }])).toEqual({});
  });

  it('drops a scoped kind without scope and an unscoped kind with scope', () => {
    expect(fromProperties([{ key: 'bexio', value: '4711' }, { key: 'js_gss', value: '123456789' }])).toEqual({});
  });

  it('drops empty values and empty keys', () => {
    expect(fromProperties([{ key: 'js', value: '' }, { key: '', value: '123456789' }, { key: 'js', value: '   ' }])).toEqual({});
  });

  it('trims keys and values', () => {
    expect(fromProperties([{ key: ' js ', value: ' 123456789 ' }])).toEqual({ js: '123456789' });
  });

  it('accepts a numeric value from a legacy document', () => {
    expect(fromProperties([{ key: 'bexio_gss', value: 4711 as unknown as string }])).toEqual({ bexio_gss: '4711' });
  });

  it('keeps invalid entries when asked, so the form can report them', () => {
    expect(fromProperties([{ key: 'js', value: '12' }, { key: 'js_x', value: '' }], true)).toEqual({ js: '12' });
  });

  it('keeps the last value of a repeated key', () => {
    expect(fromProperties([{ key: 'js', value: '111111111' }, { key: 'js', value: '222222222' }])).toEqual({ js: '222222222' });
  });

  it('copes with an absent list', () => {
    expect(fromProperties(undefined)).toEqual({});
  });
});

describe('externalIdKeyOptions', () => {
  const labels = { js: 'J+S-Personennummer', bexio: 'bexio-Kontakt ({books})' };

  it('offers each unscoped kind once and each scoped kind once per books id', () => {
    expect(externalIdKeyOptions(labels, ['scs', 'gss'])).toEqual([
      { key: 'js', label: 'J+S-Personennummer' },
      { key: 'bexio_gss', label: 'bexio-Kontakt (gss)' },
      { key: 'bexio_scs', label: 'bexio-Kontakt (scs)' },
    ]);
  });

  it('offers no scoped kind without books', () => {
    expect(externalIdKeyOptions(labels, [])).toEqual([{ key: 'js', label: 'J+S-Personennummer' }]);
  });

  it('also labels the scope of a key that is already stored', () => {
    const keys = externalIdKeyOptions(labels, [], ['bexio_old']).map((o) => o.key);
    expect(keys).toContain('bexio_old');
  });

  it('labels a kind without a text with its name', () => {
    expect(externalIdKeyOptions({}, [])).toEqual([{ key: 'js', label: 'js' }]);
  });
});

describe('externalIdErrorKey', () => {
  it('picks the message of the kind, or the generic one', () => {
    expect(externalIdErrorKey('js')).toBe('@subject/person/feature.validation.externalId_js');
    expect(externalIdErrorKey('bexio_gss')).toBe('@subject/person/feature.validation.externalId_bexio');
    expect(externalIdErrorKey('ahv')).toBe('@subject/person/feature.validation.externalId_unknown');
  });
});
