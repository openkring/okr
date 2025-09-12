import { die, warn } from '@bk2/shared-util-core';
import {
    getCountryCallingCode,
    isSupportedCountry,
    isValidPhoneNumber,
    ParseError,
    parsePhoneNumberFromString,
    parsePhoneNumberWithError
} from 'libphonenumber-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    formatPhoneNumber,
    getCountryPrefix,
    isPhoneNumberValid,
    parsePhoneNumber
} from './phone.util';

vi.mock('@bk2/shared-util-core', () => ({
  warn: vi.fn(),
  die: vi.fn()
}));

vi.mock('libphonenumber-js', () => ({
  getCountryCallingCode: vi.fn(),
  isSupportedCountry: vi.fn(),
  isValidPhoneNumber: vi.fn(),
  parsePhoneNumberFromString: vi.fn(),
  parsePhoneNumberWithError: vi.fn(),
  ParseError: class extends Error {}
}));

describe('phone.util', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('parsePhoneNumber', () => {
    it('should return valid PhoneNumber object', () => {
      const mockPhoneNumber = { isValid: () => true };
      (parsePhoneNumberWithError as any).mockReturnValue(mockPhoneNumber);

      const result = parsePhoneNumber('0791231234', 'CH');
      expect(result).toBe(mockPhoneNumber);
      expect(parsePhoneNumberWithError).toHaveBeenCalledWith('0791231234', 'CH');
    });

    it('should return undefined for invalid phone number', () => {
      const mockPhoneNumber = { isValid: () => false };
      (parsePhoneNumberWithError as any).mockReturnValue(mockPhoneNumber);

      const result = parsePhoneNumber('invalid', 'CH');
      expect(result).toBeUndefined();
    });

    it('should handle ParseError and call warn', () => {
      const error = new (ParseError as any)('Not a phone number');
      (parsePhoneNumberWithError as any).mockImplementation(() => { throw error; });

      const result = parsePhoneNumber('invalid', 'CH');
      expect(result).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Not a phone number'));
    });

    it('should handle other errors and call console.warn', () => {
      const error = new Error('Other error');
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (parsePhoneNumberWithError as any).mockImplementation(() => { throw error; });

      const result = parsePhoneNumber('invalid', 'CH');
      expect(result).toBeUndefined();
      expect(spy).toHaveBeenCalledWith('phone.util/parsePhoneNumber: ', error);
      spy.mockRestore();
    });
  });

  describe('formatPhoneNumber', () => {
    it('should return empty string for falsy input', () => {
      expect(formatPhoneNumber('', 'CH')).toBe('');
      expect(formatPhoneNumber(null as any, 'CH')).toBe('');
      expect(formatPhoneNumber(undefined as any, 'CH')).toBe('');
    });

    it('should call die for unsupported country', () => {
      (isSupportedCountry as any).mockReturnValue(false);
      formatPhoneNumber('0791231234', 'ZZ');
      expect(die).toHaveBeenCalledWith(expect.stringContaining('ZZ is not supported'));
    });

    it('should warn and return input for invalid phone number', () => {
      (isSupportedCountry as any).mockReturnValue(true);
      (parsePhoneNumberFromString as any).mockReturnValue({ isValid: () => false });
      const result = formatPhoneNumber('invalid', 'CH');
      expect(warn).toHaveBeenCalled();
      expect(result).toBe('invalid');
    });

    it('should format valid phone number', () => {
      (isSupportedCountry as any).mockReturnValue(true);
      (parsePhoneNumberFromString as any).mockReturnValue({
        isValid: () => true,
        formatInternational: () => '+41 79 123 12 34'
      });
      const result = formatPhoneNumber('0791231234', 'CH');
      expect(result).toBe('+41 79 123 12 34');
    });
  });

  describe('getCountryPrefix', () => {
    it('should call die for unsupported country', () => {
      (isSupportedCountry as any).mockReturnValue(false);
      getCountryPrefix('ZZ');
      expect(die).toHaveBeenCalledWith(expect.stringContaining('ZZ is not supported'));
    });

    it('should return country calling code for supported country', () => {
      (isSupportedCountry as any).mockReturnValue(true);
      (getCountryCallingCode as any).mockReturnValue('+41');
      const result = getCountryPrefix('CH');
      expect(result).toBe('+41');
      expect(getCountryCallingCode).toHaveBeenCalledWith('CH');
    });
  });

  describe('isPhoneNumberValid', () => {
    it('should warn and return false for empty input', () => {
      const result = isPhoneNumberValid('', 'CH');
      expect(result).toBe(false);
      expect(warn).toHaveBeenCalled();
    });

    it('should warn and return false for unsupported country', () => {
      (isSupportedCountry as any).mockReturnValue(false);
      const result = isPhoneNumberValid('0791231234', 'ZZ');
      expect(result).toBe(false);
      expect(warn).toHaveBeenCalled();
    });

    it('should return result of isValidPhoneNumber for valid input', () => {
      (isSupportedCountry as any).mockReturnValue(true);
      (isValidPhoneNumber as any).mockReturnValue(true);
      const result = isPhoneNumberValid('0791231234', 'CH');
      expect(result).toBe(true);
      expect(isValidPhoneNumber).toHaveBeenCalledWith('0791231234', 'CH');
    });

    it('should return result of isValidPhoneNumber for invalid input', () => {
      (isSupportedCountry as any).mockReturnValue(true);
      (isValidPhoneNumber as any).mockReturnValue(false);
      const result = isPhoneNumberValid('invalid', 'CH');
      expect(result).toBe(false);
      expect(isValidPhoneNumber).toHaveBeenCalledWith('invalid', 'CH');
    });
  });
});