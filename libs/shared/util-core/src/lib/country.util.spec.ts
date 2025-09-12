import * as countryDictionary from 'countries-list';
import * as i18nIsoCountries from 'i18n-iso-countries';
import { PhoneNumber } from 'libphonenumber-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getAlpha3Code,
    getCallingCode,
    getCapital,
    getContinent,
    getContinentName,
    getCountryData,
    getCountryName,
    getCurrency,
    getEmojiFlag,
    getFlagEmojiString,
    getInternationalPhoneNumber,
    getLanguages,
    getNationalPhoneNumber,
    getNativeCountryName,
    getNumericCode,
    getPhoneNumberType,
    getPhoneNumberURI,
    getWikipediaUrl,
    isEqualPhoneNumber,
    isValidPhoneNumber,
    parsePhoneNumberFromString,
    PhoneNumberType
} from './country.util';
import * as logUtil from './log.util';

// Mock the log.util module
vi.mock('./log.util', () => ({
  die: vi.fn(),
  warn: vi.fn()
}));

// Mock external libraries
vi.mock('libphonenumber-js', () => ({
  parsePhoneNumberWithError: vi.fn()
}));

vi.mock('countries-list', () => ({
  continents: {
    'EU': 'Europe',
    'AS': 'Asia',
    'NA': 'North America',
    'SA': 'South America',
    'AF': 'Africa',
    'OC': 'Oceania',
    'AN': 'Antarctica'
  },
  countries: {
    'CH': {
      name: 'Switzerland',
      native: 'Schweiz',
      phone: ['41'],
      continent: 'EU',
      capital: 'Bern',
      currency: ['CHF'],
      languages: ['de', 'fr', 'it']
    },
    'DE': {
      name: 'Germany',
      native: 'Deutschland',
      phone: ['49'],
      continent: 'EU',
      capital: 'Berlin',
      currency: ['EUR'],
      languages: ['de']
    },
    'US': {
      name: 'United States',
      native: 'United States',
      phone: ['1'],
      continent: 'NA',
      capital: 'Washington D.C.',
      currency: ['USD'],
      languages: ['en']
    }
  },
  getEmojiFlag: vi.fn()
}));

vi.mock('i18n-iso-countries', () => ({
  getName: vi.fn(),
  alpha2ToAlpha3: vi.fn(),
  alpha2ToNumeric: vi.fn()
}));

describe('country.util', () => {
  const mockDie = vi.mocked(logUtil.die);
  const mockWarn = vi.mocked(logUtil.warn);
  const mockGetEmojiFlag = vi.mocked(countryDictionary.getEmojiFlag);
  const mockGetName = vi.mocked(i18nIsoCountries.getName);
  const mockAlpha2ToAlpha3 = vi.mocked(i18nIsoCountries.alpha2ToAlpha3);
  const mockAlpha2ToNumeric = vi.mocked(i18nIsoCountries.alpha2ToNumeric);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('countries-list functionality', () => {
    describe('getContinentName', () => {
      it('should return continent name for valid continent code', () => {
        const result = getContinentName('EU');
        expect(result).toBe('Europe');
      });

      it('should return continent name for different continent codes', () => {
        expect(getContinentName('AS')).toBe('Asia');
        expect(getContinentName('NA')).toBe('North America');
        expect(getContinentName('SA')).toBe('South America');
        expect(getContinentName('AF')).toBe('Africa');
        expect(getContinentName('OC')).toBe('Oceania');
        expect(getContinentName('AN')).toBe('Antarctica');
      });

      it('should handle invalid continent codes', () => {
        const result = getContinentName('XX');
        expect(result).toBeUndefined();
      });
    });

    describe('getEmojiFlag', () => {
      it('should call getEmojiFlag with uppercase country code', () => {
        mockGetEmojiFlag.mockReturnValue('🇨🇭');
        
        const result = getEmojiFlag('ch');
        
        expect(mockGetEmojiFlag).toHaveBeenCalledWith('CH');
        expect(result).toBe('🇨🇭');
      });

      it('should handle already uppercase country codes', () => {
        mockGetEmojiFlag.mockReturnValue('🇩🇪');
        
        const result = getEmojiFlag('DE');
        
        expect(mockGetEmojiFlag).toHaveBeenCalledWith('DE');
        expect(result).toBe('🇩🇪');
      });
    });

    describe('getCountryData', () => {
      it('should return country data for valid country code', () => {
        const result = getCountryData('CH');
        
        expect(result).toEqual({
          name: 'Switzerland',
          native: 'Schweiz',
          phone: ['41'],
          continent: 'EU',
          capital: 'Bern',
          currency: ['CHF'],
          languages: ['de', 'fr', 'it']
        });
      });

      it('should handle lowercase country codes', () => {
        const result = getCountryData('de');
        
        expect(result).toEqual({
          name: 'Germany',
          native: 'Deutschland',
          phone: ['49'],
          continent: 'EU',
          capital: 'Berlin',
          currency: ['EUR'],
          languages: ['de']
        });
      });
    });

    describe('getNativeCountryName', () => {
      it('should return native country name', () => {
        const result = getNativeCountryName('CH');
        expect(result).toBe('Schweiz');
      });

      it('should handle different countries', () => {
        expect(getNativeCountryName('DE')).toBe('Deutschland');
        expect(getNativeCountryName('US')).toBe('United States');
      });
    });

    describe('getCallingCode', () => {
      it('should return calling code as string', () => {
        const result = getCallingCode('CH');
        expect(result).toBe('41');
      });

      it('should handle different countries', () => {
        expect(getCallingCode('DE')).toBe('49');
        expect(getCallingCode('US')).toBe('1');
      });
    });

    describe('getContinent', () => {
      it('should return continent code', () => {
        const result = getContinent('CH');
        expect(result).toBe('EU');
      });

      it('should handle different continents', () => {
        expect(getContinent('DE')).toBe('EU');
        expect(getContinent('US')).toBe('NA');
      });
    });

    describe('getCapital', () => {
      it('should return capital city', () => {
        const result = getCapital('CH');
        expect(result).toBe('Bern');
      });

      it('should handle different countries', () => {
        expect(getCapital('DE')).toBe('Berlin');
        expect(getCapital('US')).toBe('Washington D.C.');
      });
    });

    describe('getCurrency', () => {
      it('should return first currency code', () => {
        const result = getCurrency('CH');
        expect(result).toBe('CHF');
      });

      it('should handle different countries', () => {
        expect(getCurrency('DE')).toBe('EUR');
        expect(getCurrency('US')).toBe('USD');
      });
    });

    describe('getLanguages', () => {
      it('should return array of language codes', () => {
        const result = getLanguages('CH');
        expect(result).toEqual(['de', 'fr', 'it']);
      });

      it('should handle countries with single language', () => {
        expect(getLanguages('DE')).toEqual(['de']);
        expect(getLanguages('US')).toEqual(['en']);
      });
    });

    describe('getFlagEmojiString', () => {
      it('should be alias for getEmojiFlag', () => {
        mockGetEmojiFlag.mockReturnValue('🇨🇭');
        
        const result = getFlagEmojiString('ch');
        
        expect(mockGetEmojiFlag).toHaveBeenCalledWith('CH');
        expect(result).toBe('🇨🇭');
      });
    });
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

    describe('getAlpha3Code', () => {
      it('should return alpha-3 country code', () => {
        mockAlpha2ToAlpha3.mockReturnValue('CHE');
        
        const result = getAlpha3Code('CH');
        
        expect(mockAlpha2ToAlpha3).toHaveBeenCalledWith('CH');
        expect(result).toBe('CHE');
      });

      it('should return empty string when conversion fails', () => {
        mockAlpha2ToAlpha3.mockReturnValue(undefined);
        
        const result = getAlpha3Code('XX');
        
        expect(result).toBe('');
      });
    });

    describe('getNumericCode', () => {
      it('should return numeric country code', () => {
        mockAlpha2ToNumeric.mockReturnValue('756');
        
        const result = getNumericCode('CH');
        
        expect(mockAlpha2ToNumeric).toHaveBeenCalledWith('CH');
        expect(result).toBe('756');
      });

      it('should return empty string when conversion fails', () => {
        mockAlpha2ToNumeric.mockReturnValue(undefined);
        
        const result = getNumericCode('XX');
        
        expect(result).toBe('');
      });
    });

    describe('getWikipediaUrl', () => {
      it('should construct Wikipedia URL with country name', () => {
        mockGetName.mockReturnValue('Switzerland');
        
        const result = getWikipediaUrl('CH', 'en');
        
        expect(result).toBe('https://en.wikipedia.org/wiki/Switzerland');
      });

      it('should handle different languages', () => {
        mockGetName.mockReturnValue('Schweiz');
        
        const result = getWikipediaUrl('CH', 'de');
        
        expect(result).toBe('https://de.wikipedia.org/wiki/Schweiz');
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

    describe('PhoneNumberType enum', () => {
      it('should have correct enum values', () => {
        expect(PhoneNumberType.Undefined).toBe(-1);
        expect(PhoneNumberType.Mobile).toBe(0);
        expect(PhoneNumberType.FixedLine).toBe(1);
        expect(PhoneNumberType.FixedLineOrMobile).toBe(2);
        expect(PhoneNumberType.PremiumRate).toBe(3);
        expect(PhoneNumberType.TollFree).toBe(4);
        expect(PhoneNumberType.SharedCost).toBe(5);
        expect(PhoneNumberType.Voip).toBe(6);
        expect(PhoneNumberType.PersonalNumber).toBe(7);
        expect(PhoneNumberType.Pager).toBe(8);
        expect(PhoneNumberType.Uan).toBe(9);
        expect(PhoneNumberType.Voicemail).toBe(10);
      });
    });

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

    describe('getInternationalPhoneNumber', async () => {
      const { parsePhoneNumberWithError } = await import('libphonenumber-js');
      const mockParsePhoneNumberWithError = vi.mocked(parsePhoneNumberWithError);

      it('should return international format', () => {
        const mockPhone = createMockPhoneNumber();
        mockParsePhoneNumberWithError.mockReturnValue(mockPhone);
        
        const result = getInternationalPhoneNumber('+41 44 123 45 67', 'CH');
        
        expect(result).toBe('+41 44 123 45 67');
        expect(mockPhone.formatInternational).toHaveBeenCalled();
      });
    });

    describe('getNationalPhoneNumber', async () => {
      const { parsePhoneNumberWithError } = await import('libphonenumber-js');
      const mockParsePhoneNumberWithError = vi.mocked(parsePhoneNumberWithError);

      it('should return national format', () => {
        const mockPhone = createMockPhoneNumber();
        mockParsePhoneNumberWithError.mockReturnValue(mockPhone);
        
        const result = getNationalPhoneNumber('+41 44 123 45 67', 'CH');
        
        expect(result).toBe('044 123 45 67');
        expect(mockPhone.formatNational).toHaveBeenCalled();
      });
    });
    describe('getPhoneNumberURI', async () => {
      const { parsePhoneNumberWithError } = await import('libphonenumber-js');
      const mockParsePhoneNumberWithError = vi.mocked(parsePhoneNumberWithError);

      it('should return phone URI', () => {
        const mockPhone = createMockPhoneNumber();
        mockParsePhoneNumberWithError.mockReturnValue(mockPhone);
        
        const result = getPhoneNumberURI('+41 44 123 45 67', 'CH');
        
        expect(result).toBe('tel:+41441234567');
        expect(mockPhone.getURI).toHaveBeenCalled();
      });
    });

    describe('getPhoneNumberType', async () => {
      const { parsePhoneNumberWithError } = await import('libphonenumber-js');
      const mockParsePhoneNumberWithError = vi.mocked(parsePhoneNumberWithError);

      it('should return correct type for mobile number', () => {
        const mockPhone = createMockPhoneNumber({
          getType: vi.fn().mockReturnValue('MOBILE')
        });
        mockParsePhoneNumberWithError.mockReturnValue(mockPhone);
        
        const result = getPhoneNumberType('+41 76 123 45 67', 'CH');
        expect(result).toBe(PhoneNumberType.Mobile);
      });

      it('should return correct type for fixed line', () => {
        const mockPhone = createMockPhoneNumber({
          getType: vi.fn().mockReturnValue('FIXED_LINE')
        });
        mockParsePhoneNumberWithError.mockReturnValue(mockPhone);
        
        const result = getPhoneNumberType('+41 44 123 45 67', 'CH');
        
        expect(result).toBe(PhoneNumberType.FixedLine);
      });

      it('should handle all phone number types', () => {
        const testCases = [
          { libType: 'FIXED_LINE_OR_MOBILE', expectedType: PhoneNumberType.FixedLineOrMobile },
          { libType: 'PREMIUM_RATE', expectedType: PhoneNumberType.PremiumRate },
          { libType: 'TOLL_FREE', expectedType: PhoneNumberType.TollFree },
          { libType: 'SHARED_COST', expectedType: PhoneNumberType.SharedCost },
          { libType: 'VOIP', expectedType: PhoneNumberType.Voip },
          { libType: 'PERSONAL_NUMBER', expectedType: PhoneNumberType.PersonalNumber },
          { libType: 'PAGER', expectedType: PhoneNumberType.Pager },
          { libType: 'UAN', expectedType: PhoneNumberType.Uan },
          { libType: 'VOICEMAIL', expectedType: PhoneNumberType.Voicemail }
        ];

        testCases.forEach(({ libType, expectedType }) => {
          const mockPhone = createMockPhoneNumber({
            getType: vi.fn().mockReturnValue(libType)
          });
          mockParsePhoneNumberWithError.mockReturnValue(mockPhone);
          
          const result = getPhoneNumberType('+41 123 456 789', 'CH');
          
          expect(result).toBe(expectedType);
        });
      });
      it('should warn for unknown phone number type', () => {
        const mockPhone = createMockPhoneNumber({
          getType: vi.fn().mockReturnValue('UNKNOWN_TYPE' as any)
        });
        mockParsePhoneNumberWithError.mockReturnValue(mockPhone);
        
        const result = getPhoneNumberType('+41 123 456 789', 'CH');
        
        expect(mockWarn).toHaveBeenCalledWith('internationalization.util/getType(+41 123 456 789, CH) -> has invalid type: UNKNOWN_TYPE');
        expect(result).toBe(PhoneNumberType.Undefined);
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
