import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as logUtil from './log.util';
import { checkBoundedInteger, checkPassword, checkString } from './validate.util';

// Mock the log.util module
vi.mock('./log.util', () => ({
  die: vi.fn(),
  warn: vi.fn()
}));

describe('validate.util', () => {
  const mockDie = vi.mocked(logUtil.die);
  const mockWarn = vi.mocked(logUtil.warn);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkBoundedInteger', () => {
    describe('valid cases', () => {
      it('should return true for valid integers within default range', () => {
        expect(checkBoundedInteger(5)).toBe(true);
        expect(checkBoundedInteger(100)).toBe(true);
        expect(checkBoundedInteger(1)).toBe(true);
      });

      it('should return true for zero when acceptZero is true (default)', () => {
        expect(checkBoundedInteger(0)).toBe(true);
        expect(checkBoundedInteger(0, 0, 10, true)).toBe(true);
      });

      it('should return true for values at boundary limits', () => {
        expect(checkBoundedInteger(5, 5, 10)).toBe(true);
        expect(checkBoundedInteger(10, 5, 10)).toBe(true);
        expect(checkBoundedInteger(0, 0, 5)).toBe(true);
      });

      it('should return true for negative integers when in range', () => {
        expect(checkBoundedInteger(-5, -10, 0)).toBe(true);
        expect(checkBoundedInteger(-1, -5, 5)).toBe(true);
      });

      it('should return true for large integers within custom range', () => {
        expect(checkBoundedInteger(1000, 500, 2000)).toBe(true);
        expect(checkBoundedInteger(999999, 0, 1000000)).toBe(true);
      });
    });

    describe('invalid value handling', () => {
      it('should call die for falsy values', () => {
        mockDie.mockImplementation(() => { throw new Error('die called'); });

        expect(() => checkBoundedInteger(null)).toThrow('die called');
        expect(() => checkBoundedInteger(undefined)).toThrow('die called');
        expect(() => checkBoundedInteger(false)).toThrow('die called');
        expect(() => checkBoundedInteger('')).toThrow('die called');

        expect(mockDie).toHaveBeenCalledWith('validate.util/checkString: invalid value');
      });

      it('should return false and warn for non-number types', () => {
        expect(checkBoundedInteger('5')).toBe(false);
        expect(checkBoundedInteger('not a number')).toBe(false);
        expect(checkBoundedInteger({})).toBe(false);
        expect(checkBoundedInteger([])).toBe(false);
        expect(checkBoundedInteger(true)).toBe(false);

        expect(mockWarn).toHaveBeenCalledWith('validate.util/checkBoundedInteger: not a number type');
      });

      it('should return false and warn for NaN values', () => {
        expect(checkBoundedInteger(NaN)).toBe(false);
        expect(checkBoundedInteger(Number.NaN)).toBe(false);

        expect(mockWarn).toHaveBeenCalledWith('validate.util/checkBoundedInteger: not a number (NaN)');
      });

      it('should return false and warn for non-integer numbers', () => {
        expect(checkBoundedInteger(5.5)).toBe(false);
        expect(checkBoundedInteger(3.14)).toBe(false);
        expect(checkBoundedInteger(0.1)).toBe(false);
        expect(checkBoundedInteger(-2.7)).toBe(false);

        expect(mockWarn).toHaveBeenCalledWith('validate.util/checkBoundedInteger: not a whole number');
      });
    });

    describe('zero handling', () => {
      it('should return true for zero when acceptZero is true', () => {
        expect(checkBoundedInteger(0, 1, 10, true)).toBe(true);
        expect(checkBoundedInteger(0, -5, 5, true)).toBe(true);
      });

      it('should validate zero against range when acceptZero is false', () => {
        expect(checkBoundedInteger(0, 1, 10, false)).toBe(false);
        expect(checkBoundedInteger(0, 0, 10, false)).toBe(true);
        expect(checkBoundedInteger(0, -5, 5, false)).toBe(true);

        expect(mockWarn).toHaveBeenCalledWith('validate.util/checkBoundedInteger: value 0 is smaller than the minimum 1');
      });
    });

    describe('range validation', () => {
      it('should return false and warn for values below minimum', () => {
        expect(checkBoundedInteger(3, 5, 10)).toBe(false);
        expect(checkBoundedInteger(-10, -5, 5)).toBe(false);
        expect(checkBoundedInteger(0, 1, 10, false)).toBe(false);

        expect(mockWarn).toHaveBeenCalledWith('validate.util/checkBoundedInteger: value 3 is smaller than the minimum 5');
      });

      it('should return false and warn for values above maximum', () => {
        expect(checkBoundedInteger(15, 5, 10)).toBe(false);
        expect(checkBoundedInteger(100, 0, 50)).toBe(false);
        expect(checkBoundedInteger(6, -5, 5)).toBe(false);

        expect(mockWarn).toHaveBeenCalledWith('validate.util/checkBoundedInteger: value 15 is bigger than the maximum 10');
      });

      it('should handle infinite limits', () => {
        expect(checkBoundedInteger(1000000, 0, Infinity)).toBe(true);
        expect(checkBoundedInteger(-1000000, -Infinity, 0)).toBe(true);
        expect(checkBoundedInteger(999999, -Infinity, Infinity)).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle very large numbers', () => {
        const largeNum = Number.MAX_SAFE_INTEGER;
        expect(checkBoundedInteger(largeNum, 0, Number.MAX_SAFE_INTEGER)).toBe(true);
      });

      it('should handle very small numbers', () => {
        const smallNum = Number.MIN_SAFE_INTEGER;
        expect(checkBoundedInteger(smallNum, Number.MIN_SAFE_INTEGER, 0)).toBe(true);
      });

      it('should handle same min and max limits', () => {
        expect(checkBoundedInteger(5, 5, 5)).toBe(true);
        expect(checkBoundedInteger(4, 5, 5)).toBe(false);
        expect(checkBoundedInteger(6, 5, 5)).toBe(false);
      });
    });
  });

  describe('checkString', () => {
    describe('valid cases', () => {
      it('should return true for valid non-empty strings', () => {
        expect(checkString('hello')).toBe(true);
        expect(checkString('test string')).toBe(true);
        expect(checkString('a')).toBe(true);
        expect(checkString('123')).toBe(true);
      });

      it('should return true for empty string when acceptEmptyString is true', () => {
        expect(checkString('', true)).toBe(true);
      });

      it('should return true for strings with special characters', () => {
        expect(checkString('hello@world.com')).toBe(true);
        expect(checkString('special!@#$%^&*()chars')).toBe(true);
        expect(checkString('unicode: 中文 🚀')).toBe(true);
      });

      it('should return true for very long strings', () => {
        const longString = 'a'.repeat(1000);
        expect(checkString(longString)).toBe(true);
      });
    });

    describe('invalid value handling', () => {
      it('should call die for falsy values', () => {
        mockDie.mockImplementation(() => { throw new Error('die called'); });

        expect(() => checkString(null)).toThrow('die called');
        expect(() => checkString(undefined)).toThrow('die called');
        expect(() => checkString(false)).toThrow('die called');
        expect(() => checkString(0)).toThrow('die called');

        expect(mockDie).toHaveBeenCalledWith('validate.util/checkString: invalid value');
      });

      it('should return false and warn for non-string types', () => {
        expect(checkString(123)).toBe(false);
        expect(checkString(true)).toBe(false);
        expect(checkString({})).toBe(false);
        expect(checkString([])).toBe(false);
        expect(checkString(new Date())).toBe(false);

        expect(mockWarn).toHaveBeenCalledWith('validate.util/checkString: not a string type');
      });
    });

    describe('empty string handling', () => {
      it('should return false and warn for empty string when acceptEmptyString is false (default)', () => {
        expect(checkString('')).toBe(false);
        expect(checkString('', false)).toBe(false);

        expect(mockWarn).toHaveBeenCalledWith('validate.util/checkString: empty string');
      });

      it('should return true for empty string when acceptEmptyString is true', () => {
        expect(checkString('', true)).toBe(true);
        expect(mockWarn).not.toHaveBeenCalled();
      });
    });

    describe('edge cases', () => {
      it('should handle whitespace strings', () => {
        expect(checkString(' ')).toBe(true);
        expect(checkString('\t')).toBe(true);
        expect(checkString('\n')).toBe(true);
        expect(checkString('   ')).toBe(true);
      });

      it('should handle strings with only special characters', () => {
        expect(checkString('!@#$%^&*()')).toBe(true);
        expect(checkString('""""')).toBe(true);
        expect(checkString("''''")).toBe(true);
      });

      it('should handle strings that look like other types', () => {
        expect(checkString('true')).toBe(true);
        expect(checkString('false')).toBe(true);
        expect(checkString('null')).toBe(true);
        expect(checkString('undefined')).toBe(true);
      });
    });
  });

  describe('checkPassword', () => {
    describe('valid passwords', () => {
      it('should return true for passwords meeting minimum length requirement', () => {
        expect(checkPassword('123456')).toBe(true);
        expect(checkPassword('abcdef')).toBe(true);
        expect(checkPassword('password')).toBe(true);
      });

      it('should return true for passwords at maximum length', () => {
        const maxLengthPassword = 'a'.repeat(20);
        expect(checkPassword(maxLengthPassword)).toBe(true);
      });

      it('should return true for passwords with mixed characters', () => {
        expect(checkPassword('Test123!')).toBe(true);
        expect(checkPassword('MyP@ssw0rd')).toBe(true);
        expect(checkPassword('Complex!123')).toBe(true);
      });

      it('should return true for passwords with special characters', () => {
        expect(checkPassword('pass@word')).toBe(true);
        expect(checkPassword('test#123')).toBe(true);
        expect(checkPassword('hello$world')).toBe(true);
      });
    });

    describe('invalid value handling', () => {
      it('should call die for falsy values', () => {
        mockDie.mockImplementation(() => { throw new Error('die called'); });

        expect(() => checkPassword(null)).toThrow('die called');
        expect(() => checkPassword(undefined)).toThrow('die called');
        expect(() => checkPassword(false)).toThrow('die called');
        expect(() => checkPassword('')).toThrow('die called');

        expect(mockDie).toHaveBeenCalledWith('validate.util/checkPassword: invalid value');
      });

      it('should call die for non-string types', () => {
        mockDie.mockImplementation(() => { throw new Error('die called'); });

        expect(() => checkPassword(123456)).toThrow('die called');
        expect(() => checkPassword(true)).toThrow('die called');
        expect(() => checkPassword({})).toThrow('die called');
        expect(() => checkPassword([])).toThrow('die called');

        expect(mockDie).toHaveBeenCalledWith('validate.util/checkPassword: value must be of type string');
      });
    });

    describe('length validation', () => {
      it('should return false and warn for passwords too short', () => {
        expect(checkPassword('12345')).toBe(false);
        expect(checkPassword('a')).toBe(false);
        expect(checkPassword('abc')).toBe(false);
        expect(checkPassword('')).toBe(false);

        expect(mockWarn).toHaveBeenCalledWith('validate.util/checkPassword: regexp test failed');
      });

      it('should return false and warn for passwords too long', () => {
        const tooLongPassword = 'a'.repeat(21);
        expect(checkPassword(tooLongPassword)).toBe(false);

        const veryLongPassword = 'a'.repeat(100);
        expect(checkPassword(veryLongPassword)).toBe(false);

        expect(mockWarn).toHaveBeenCalledWith('validate.util/checkPassword: regexp test failed');
      });

      it('should handle passwords at boundary lengths', () => {
        expect(checkPassword('123456')).toBe(true); // minimum length (6)
        expect(checkPassword('12345678901234567890')).toBe(true); // maximum length (20)
        expect(checkPassword('12345')).toBe(false); // below minimum (5)
        expect(checkPassword('123456789012345678901')).toBe(false); // above maximum (21)
      });
    });

    describe('edge cases', () => {
      it('should handle passwords with only numbers', () => {
        expect(checkPassword('123456')).toBe(true);
        expect(checkPassword('1234567890')).toBe(true);
      });

      it('should handle passwords with only letters', () => {
        expect(checkPassword('abcdef')).toBe(true);
        expect(checkPassword('ABCDEF')).toBe(true);
        expect(checkPassword('AbCdEf')).toBe(true);
      });

      it('should handle passwords with unicode characters', () => {
        expect(checkPassword('pässwörd')).toBe(true);
        expect(checkPassword('密码123456')).toBe(true);
        expect(checkPassword('🔐secure')).toBe(true);
      });

      it('should handle passwords with whitespace', () => {
        expect(checkPassword('pass word')).toBe(true);
        expect(checkPassword(' password ')).toBe(true);
        expect(checkPassword('tab\tpass')).toBe(true);
      });

      it('should handle passwords with all special characters', () => {
        expect(checkPassword('!@#$%^&*()')).toBe(true);
        expect(checkPassword('""""""')).toBe(true);
        expect(checkPassword("''''''")).toBe(true);
      });
    });

    describe('regex pattern validation', () => {
      it('should validate the correct regex pattern is being used', () => {
        // The regex should be /^.{6,20}$/
        // Testing the boundaries
        expect(checkPassword('a'.repeat(6))).toBe(true);
        expect(checkPassword('a'.repeat(20))).toBe(true);
        expect(checkPassword('a'.repeat(5))).toBe(false);
        expect(checkPassword('a'.repeat(21))).toBe(false);
      });

      it('should accept any character within length bounds', () => {
        expect(checkPassword('!@#$%^')).toBe(true);
        expect(checkPassword('\n\t\r   ')).toBe(false);
        expect(checkPassword('🚀🎉🔥💯🎯🌟')).toBe(true);
      });
    });
  });

  describe('integration and error handling', () => {
    it('should handle all functions with similar error patterns', () => {
      mockDie.mockImplementation(() => { throw new Error('validation failed'); });

      // All functions should call die for null/undefined
      expect(() => checkBoundedInteger(null)).toThrow();
      expect(() => checkString(null)).toThrow();
      expect(() => checkPassword(null)).toThrow();

      expect(mockDie).toHaveBeenCalledTimes(3);
    });

    it('should handle edge cases consistently', () => {
      // Test consistent behavior across functions
      expect(checkBoundedInteger(0, 0, 10)).toBe(true);
      expect(checkString(' ', true)).toBe(true);
      expect(checkPassword('123456')).toBe(true);

      // All should handle their respective valid cases
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('should provide appropriate warnings for different validation failures', () => {
      checkBoundedInteger('not a number');
      checkString(123);
      checkPassword('short');

      expect(mockWarn).toHaveBeenCalledWith('validate.util/checkBoundedInteger: not a number type');
      expect(mockWarn).toHaveBeenCalledWith('validate.util/checkString: not a string type');
      expect(mockWarn).toHaveBeenCalledWith('validate.util/checkPassword: regexp test failed');
    });

    it('should demonstrate typical usage patterns', () => {
      // Typical validation workflow
      const userInput = {
        age: 25,
        name: 'John Doe',
        password: 'mypassword123'
      };

      expect(checkBoundedInteger(userInput.age, 0, 120)).toBe(true);
      expect(checkString(userInput.name)).toBe(true);
      expect(checkPassword(userInput.password)).toBe(true);
    });
  });
});