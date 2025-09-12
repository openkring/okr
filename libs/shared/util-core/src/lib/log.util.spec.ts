import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { die, generateRandomString, sleep, warn } from './log.util';

describe('log.util', () => {
  // Declare the mock variable but don't initialize it here
  let mockConsoleWarn: any;

  beforeEach(() => {
    // Create a fresh spy for each test
    mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('die', () => {
    it('should throw an Error with the provided message', () => {
      const errorMessage = 'Critical system error';

      expect(() => die(errorMessage)).toThrow(Error);
      expect(() => die(errorMessage)).toThrow(errorMessage);
    });

    it('should never return (typescript never type)', () => {
      const errorMessage = 'This should never return';

      expect(() => die(errorMessage)).toThrow();
    });

    it('should work with empty string message', () => {
      expect(() => die('')).toThrow('');
    });

    it('should work with multiline messages', () => {
      const multilineMessage = 'Error line 1\nError line 2\nError line 3';

      expect(() => die(multilineMessage)).toThrow(multilineMessage);
    });

    it('should work with special characters in message', () => {
      const specialMessage = 'Error: @#$%^&*()_+-={}[]|\\:";\'<>?,./';

      expect(() => die(specialMessage)).toThrow(specialMessage);
    });

    it('should enable typescript type narrowing (usage example)', () => {
      // This test demonstrates the intended usage pattern
      const getValue = (input: string | null): string => {
        return input ?? die('Input cannot be null');
      };

      expect(() => getValue(null)).toThrow('Input cannot be null');
      expect(getValue('valid')).toBe('valid');
    });

    it('should work in optional chaining scenarios', () => {
      interface TestObject {
        property?: string;
      }

      const testObj: TestObject = {};

      expect(() => {
        const value = testObj.property ?? die('Property not found');
        return value;
      }).toThrow('Property not found');
    });

    it('should throw Error instance, not just string', () => {
      try {
        die('test error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('test error');
      }
    });
  });

  describe('warn', () => {
    it('should call console.warn with the provided message', () => {
      const warningMessage = 'This is a warning';

      warn(warningMessage);

      expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
      expect(mockConsoleWarn).toHaveBeenCalledWith(warningMessage);
    });

    it('should not return anything (void)', () => {
      const result = warn('test warning');

      expect(result).toBeUndefined();
    });

    it('should handle empty string warning', () => {
      warn('');

      expect(mockConsoleWarn).toHaveBeenCalledWith('');
    });

    it('should handle multiline warnings', () => {
      const multilineWarning = 'Warning line 1\nWarning line 2';

      warn(multilineWarning);

      expect(mockConsoleWarn).toHaveBeenCalledWith(multilineWarning);
    });

    it('should handle special characters in warning', () => {
      const specialWarning = 'Warning: @#$%^&*()_+-={}[]|\\:";\'<>?,./';

      warn(specialWarning);

      expect(mockConsoleWarn).toHaveBeenCalledWith(specialWarning);
    });

    it('should handle unicode characters', () => {
      const unicodeWarning = 'Warning: 🚨 Unicode characters åäö 中文';

      warn(unicodeWarning);

      expect(mockConsoleWarn).toHaveBeenCalledWith(unicodeWarning);
    });

    it('should handle very long warning messages', () => {
      const longWarning = 'Warning: ' + 'a'.repeat(1000);

      warn(longWarning);

      expect(mockConsoleWarn).toHaveBeenCalledWith(longWarning);
    });
  });

  describe('sleep', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should resolve after the specified milliseconds', async () => {
      const sleepPromise = sleep(1000);
      
      // Initially should not be resolved
      let resolved = false;
      sleepPromise.then(() => { resolved = true; });
      
      expect(resolved).toBe(false);
      
      // Fast-forward time
      vi.advanceTimersByTime(1000);
      
      // Should resolve now
      await sleepPromise;
      expect(resolved).toBe(true);
    });

    it('should work with zero milliseconds', async () => {
      const sleepPromise = sleep(0);
      
      vi.advanceTimersByTime(0);
      
      await expect(sleepPromise).resolves.toBeUndefined();
    });

    it('should work with small time intervals', async () => {
      const sleepPromise = sleep(1);
      
      vi.advanceTimersByTime(1);
      
      await expect(sleepPromise).resolves.toBeUndefined();
    });

    it('should work with large time intervals', async () => {
      const sleepPromise = sleep(10000);
      
      vi.advanceTimersByTime(10000);
      
      await expect(sleepPromise).resolves.toBeUndefined();
    });

    it('should return a Promise', () => {
      const result = sleep(100);
      
      expect(result).toBeInstanceOf(Promise);
    });

    it('should handle negative values (edge case)', async () => {
      // setTimeout typically treats negative values as 0
      const sleepPromise = sleep(-100);
      
      vi.advanceTimersByTime(0);
      
      await expect(sleepPromise).resolves.toBeUndefined();
    });

    it('should handle decimal values', async () => {
      const sleepPromise = sleep(100.5);
      
      vi.advanceTimersByTime(101); // Round up to be safe
      
      await expect(sleepPromise).resolves.toBeUndefined();
    });

    it('should be usable with Promise.then pattern', async () => {
    let resolved = false;
    
    const sleepPromise = sleep(300).then(() => {
        resolved = true;
        expect(vi.getTimerCount()).toBe(0);
    });
    
    // Advance timers to resolve the promise
    vi.advanceTimersByTime(300);
    
    // Wait for the promise to complete
    await sleepPromise;
    
    expect(resolved).toBe(true);
    });
  });

  describe('generateRandomString', () => {
    it('should generate a string of specified length', () => {
      const size = 10;
      const result = generateRandomString(size);
      
      expect(typeof result).toBe('string');
      expect(result.length).toBe(size); 
    });

    it('should generate different strings on subsequent calls', () => {
      const size = 10;
      const result1 = generateRandomString(size);
      const result2 = generateRandomString(size);
      
      expect(typeof result1).toBe('string');
      expect(result1.length).toBe(size); 
      expect(typeof result2).toBe('string');
      expect(result2.length).toBe(size); 
      // While theoretically possible to be the same, it's extremely unlikely
      expect(result1).not.toBe(result2);
    });

    it('should handle edge case of size 1 (minimum meaningful size)', () => {
      const result = generateRandomString(1);
      
      expect(typeof result).toBe('string');
      expect(result.length).toBe(1); 
    });

    it('should handle edge case of size 0', () => {
      const result = generateRandomString(0);
      
      expect(typeof result).toBe('string');
      expect(result.length).toBe(0); 
    });

    it('should handle larger sizes', () => {
      const size = 20;
      const result = generateRandomString(size);
      
      expect(typeof result).toBe('string');
      expect(result.length).toBe(size);
    });

    it('should generate alphanumeric characters', () => {
      const size = 10;
      const result = generateRandomString(size);
      
      // Should only contain alphanumeric characters (base36)
      expect(result).toMatch(/^[a-z0-9]*$/);
    });

    it('should handle negative size (edge case)', () => {
      const result = generateRandomString(-5);
      
      expect(typeof result).toBe('string');
      expect(result.length).toBe(0); // substring(2, -5) = empty string
    });

    it('should generate reasonable entropy', () => {
      const size = 15;
      const results = new Set();
      
      // Generate multiple strings and check they're different
      for (let i = 0; i < 100; i++) {
        results.add(generateRandomString(size));
      }
      
      // Should have high entropy (most strings should be unique)
      expect(results.size).toBeGreaterThan(90);
    });

    it('should work consistently with the same size parameter', () => {
      const size = 12;
      const result1 = generateRandomString(size);
      const result2 = generateRandomString(size);
      
      expect(result1.length).toBe(result2.length);
      expect(typeof result1).toBe(typeof result2);
    });

    it('should handle very large sizes', () => {
      const size = 200;
      const result = generateRandomString(size);
      
      expect(typeof result).toBe('string');
      expect(result.length).toBe(size);
      expect(result).toMatch(/^[a-z0-9]*$/);
    });
  });

  describe('integration and edge cases', () => {
    it('should handle die function in error recovery scenarios', () => {
      const safeDivide = (a: number, b: number): number => {
        return b !== 0 ? a / b : die('Division by zero');
      };

      expect(safeDivide(10, 2)).toBe(5);
      expect(() => safeDivide(10, 0)).toThrow('Division by zero');
    });

    it('should handle warn for non-critical issues', () => {
      const processValue = (value: string | undefined): string => {
        if (!value) {
          warn('Value is undefined, using default');
          return 'default';
        }
        return value;
      };

      const result = processValue(undefined);
      
      expect(result).toBe('default');
      expect(mockConsoleWarn).toHaveBeenCalledWith('Value is undefined, using default');
    });

    it('should demonstrate async operation with sleep', async () => {
      vi.useRealTimers(); // Use real timers for this integration test
      
      const start = Date.now();
      await sleep(50); // Small delay for real test
      const end = Date.now();
      
      expect(end - start).toBeGreaterThanOrEqual(40); // Allow some variance
    });

    it('should demonstrate random string generation for IDs', () => {
      const generateId = (): string => {
        const randomPart = generateRandomString(10);
        return `id_${randomPart}`;
      };

      const id1 = generateId();
      const id2 = generateId();
      
      expect(id1).toMatch(/^id_[a-z0-9]*$/);
      expect(id2).toMatch(/^id_[a-z0-9]*$/);
      expect(id1).not.toBe(id2);
    });
  });
});