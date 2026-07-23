// apps/functions/src/_gateway/adapters/zefix.spec.ts
import { describe, it, expect } from 'vitest';
import { mapZefixSearch, mapZefixDetails } from './zefix';

describe('mapZefixSearch', () => {
  it('maps a list payload', () => {
    const raw = { list: [{ name: 'Acme AG', legalSeat: 'Zürich', uid: { uid: 'CHE-123' } }] };
    expect(mapZefixSearch(raw as never)).toEqual({
      results: [{ name: 'Acme AG', legalSeat: 'Zürich', uid: 'CHE-123' }],
    });
  });
  it('maps a bare array payload', () => {
    const raw = [{ name: 'Beta GmbH', legalSeat: 'Bern', uid: 'CHE-999' }];
    expect(mapZefixSearch(raw as never).results[0].uid).toBe('CHE-999');
  });
  it('returns empty results for junk', () => {
    expect(mapZefixSearch({} as never)).toEqual({ results: [] });
  });
});

describe('mapZefixDetails', () => {
  it('maps a single company object with address + legal form', () => {
    const raw = {
      name: 'Acme AG',
      uid: 'CHE-123',
      legalForm: { id: 3 },
      purpose: 'Handel',
      address: { street: 'Bahnhofstrasse', houseNumber: '1', swissZipCode: 8001, city: 'Zürich' },
    };
    expect(mapZefixDetails(raw as never)).toEqual({
      name: 'Acme AG',
      taxId: 'CHE-123',
      streetName: 'Bahnhofstrasse',
      streetNumber: '1',
      countryCode: 'CH',
      zipCode: '8001',
      city: 'Zürich',
      notes: 'Handel\nRechtsform: AG',
    });
  });
  it('unwraps an array payload', () => {
    const raw = [{ name: 'X', uid: 'CHE-1', address: {} }];
    expect(mapZefixDetails(raw as never).name).toBe('X');
  });
});
