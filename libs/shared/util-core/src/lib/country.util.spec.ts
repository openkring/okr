import * as i18nIsoCountries from 'i18n-iso-countries';
import { PhoneNumber } from 'libphonenumber-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getCountryName,
    isEqualPhoneNumber,
    isValidPhoneNumber,
    parsePhoneNumberFromString
} from './country.util';

/*
  The countries-list mock and the tests for its wrappers are gone with the functions
  themselves (spec 1.49 follow-up, 2026-09-08): getContinentName, getEmojiFlag, getCountryData,
  getNativeCountryName, getCallingCode, getContinent, getCapital, getCurrency, getLanguages,
  getFlagEmojiString, getAlpha3Code, getNumericCode, getWikipediaUrl, the four phone-format
  wrappers and the PhoneNumberType enum had no caller anywhere in the repo. getSortedCountries
  keeps its own spec file, which runs against the REAL library.
*/

// Mock the log.util module
vi.mock('./log.util', () => ({
  die: vi.fn(),
  warn: vi.fn()
}));
vi.mock('libphonenumber-js', () => ({
  parsePhoneNumberWithError: vi.fn()
}));
vi.mock('i18n-iso-countries', () => ({
  getName: vi.fn(),
  getNames: vi.fn(),
  registerLocale: vi.fn()
}));

describe('country.util', () => {
  const mockGetName = vi.mocked(i18nIsoCountries.getName);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('i18n-iso-countries functionality', () => {
    describe('getCountryName', () => {
      it('should return country name in specified language', () => {
        mockGetName.mockReturnValue('Switzerland');

        const result = getCountryName('CH', 'en');

        expect(mockGetName).toHaveBeenCalledWith('CH', 'en', { select: 'official' });
        expect(result).toBe('Switzerland');
      });

      it('should return empty string when country name not found', () => {
        mockGetName.mockReturnValue(undefined);

        const result = getCountryName('XX', 'en');

        expect(result).toBe('');
      });

      it('should handle different languages', () => {
        mockGetName.mockReturnValue('Schweiz');

        const result = getCountryName('CH', 'de');

        expect(mockGetName).toHaveBeenCalledWith('CH', 'de', { select: 'official' });
        expect(result).toBe('Schweiz');
      });
    });
  });

  describe('phone number functionality', () => {
    // Mock phone number object
    const createMockPhoneNumber = (overrides: Partial<PhoneNumber> = {}): PhoneNumber => ({
      formatInternational: vi.fn().mockReturnValue('+41 44 123 45 67'),
      formatNational: vi.fn().mockReturnValue('044 123 45 67'),
      getURI: vi.fn().mockReturnValue('tel:+41441234567'),
      getType: vi.fn().mockReturnValue('MOBILE'),
      isValid: vi.fn().mockReturnValue(true),
      isEqual: vi.fn().mockReturnValue(true),
      ...overrides
    } as PhoneNumber);

    describe('parsePhoneNumberFromString', async () => {
      const { parsePhoneNumberWithError } = await import('libphonenumber-js');
      const mockParsePhoneNumberWithError = vi.mocked(parsePhoneNumberWithError);

      it('should parse valid phone number', () => {
        const mockPhone = createMockPhoneNumber();
        mockParsePhoneNumberWithError.mockReturnValue(mockPhone);

        const result = parsePhoneNumberFromString('+41 44 123 45 67', 'CH');

        expect(mockParsePhoneNumberWithError).toHaveBeenCalledWith('+41 44 123 45 67', 'CH');
        expect(result).toBe(mockPhone);
      });
    });

    describe('isValidPhoneNumber', async () => {
      const { parsePhoneNumberWithError } = await import('libphonenumber-js');
      const mockParsePhoneNumberWithError = vi.mocked(parsePhoneNumberWithError);

      it('should return true for valid number', () => {
        const mockPhone = createMockPhoneNumber({
          isValid: vi.fn().mockReturnValue(true)
        });
        mockParsePhoneNumberWithError.mockReturnValue(mockPhone);

        const result = isValidPhoneNumber('+41 44 123 45 67', 'CH');

        expect(result).toBe(true);
        expect(mockPhone.isValid).toHaveBeenCalled();
      });

      it('should return false for invalid number', () => {
        const mockPhone = createMockPhoneNumber({
          isValid: vi.fn().mockReturnValue(false)
        });
        mockParsePhoneNumberWithError.mockReturnValue(mockPhone);

        const result = isValidPhoneNumber('123', 'CH');

        expect(result).toBe(false);
      });
    });

    describe('isEqualPhoneNumber', async () => {
      const { parsePhoneNumberWithError } = await import('libphonenumber-js');
      const mockParsePhoneNumberWithError = vi.mocked(parsePhoneNumberWithError);

      it('should return true for equal phone numbers', () => {
        const mockPhone1 = createMockPhoneNumber({
          isEqual: vi.fn().mockReturnValue(true)
        });
        const mockPhone2 = createMockPhoneNumber();

        mockParsePhoneNumberWithError
          .mockReturnValueOnce(mockPhone1)
          .mockReturnValueOnce(mockPhone2);

        const result = isEqualPhoneNumber('+41 44 123 45 67', '044 123 45 67', 'CH');

        expect(result).toBe(true);
        expect(mockPhone1.isEqual).toHaveBeenCalledWith(mockPhone2);
      });

      it('should return false for different phone numbers', () => {
        const mockPhone1 = createMockPhoneNumber({
          isEqual: vi.fn().mockReturnValue(false)
        });
        const mockPhone2 = createMockPhoneNumber();

        mockParsePhoneNumberWithError
          .mockReturnValueOnce(mockPhone1)
          .mockReturnValueOnce(mockPhone2);

        const result = isEqualPhoneNumber('+41 44 123 45 67', '+41 44 987 65 43', 'CH');

        expect(result).toBe(false);
      });
    });
  })
});
