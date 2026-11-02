import { describe, expect, it } from 'vitest';
import { externalIdKey, getExternalId, isValidExternalId } from './external-id.util';

describe('external-id.util', () => {
  it('builds unscoped and scoped keys', () => {
    expect(externalIdKey('js')).toBe('js');
    expect(externalIdKey('bexio', 'gss')).toBe('bexio_gss');
  });

  it('validates a value against the pattern of its kind', () => {
    expect(isValidExternalId('js', '123456789')).toBe(true);
    expect(isValidExternalId('js', '12345678')).toBe(false);
    expect(isValidExternalId('js', '1234567890')).toBe(false);
    expect(isValidExternalId('bexio_gss', '4711')).toBe(true);
    expect(isValidExternalId('bexio_gss', 'abc')).toBe(false);
  });

  it('never accepts an unknown kind or an unscoped key for a scoped kind', () => {
    expect(isValidExternalId('ahv', '7561234567890')).toBe(false);
    expect(isValidExternalId('bexio', '4711')).toBe(false);
    expect(isValidExternalId('js_gss', '123456789')).toBe(false);
  });

  it('reads an external id and falls back to the empty string', () => {
    expect(getExternalId({}, 'js')).toBe('');
    expect(getExternalId(undefined, 'js')).toBe('');
    expect(getExternalId({ externalIds: { js: '123456789' } }, 'js')).toBe('123456789');
  });
});
