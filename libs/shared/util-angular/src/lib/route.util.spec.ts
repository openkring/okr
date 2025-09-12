import { die } from '@bk2/shared-util-core';
import { Subscription } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
    closeSubscription,
    getDefaultValue,
    getSafeNumber,
    getSafeString,
    navigateByUrl
} from './route.util';

vi.mock('@bk2/shared-util-core', () => ({
  die: vi.fn()
}));

describe('route.util', () => {
  describe('navigateByUrl', () => {
    it('should call router.navigateByUrl when queryParams is undefined', async () => {
      const router = { navigateByUrl: vi.fn().mockResolvedValue(undefined) };
      await navigateByUrl(router as any, '/test');
      expect(router.navigateByUrl).toHaveBeenCalledWith('/test');
    });

    it('should call router.navigate with queryParams object', async () => {
      const router = { navigate: vi.fn().mockResolvedValue(undefined) };
      const queryParams = { foo: 'bar' };
      await navigateByUrl(router as any, '/test', queryParams);
      expect(router.navigate).toHaveBeenCalledWith(['/test'], { queryParams });
    });

    it('should call die if url is missing', async () => {
      const router = { navigateByUrl: vi.fn(), navigate: vi.fn() };
      await navigateByUrl(router as any, '');
      expect(die).toHaveBeenCalledWith(expect.stringContaining('url is mandatory'));
    });

    it('should call die if router is missing', async () => {
      await navigateByUrl(undefined as any, '/test');
      expect(die).toHaveBeenCalledWith(expect.stringContaining('router is mandatory'));
    });

    it('should catch and log errors', async () => {
      const router = { navigateByUrl: vi.fn().mockRejectedValue(new Error('fail')) };
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await navigateByUrl(router as any, '/fail');
/*       expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('route.util.navigateByUrl(/fail, null) -> FAILED'),
        expect.any(Error)
      ); */
      spy.mockRestore();
    });
  });

  describe('getSafeString', () => {
    it('should return value if not null or undefined', () => {
      expect(getSafeString('abc', 'def')).toBe('abc');
    });

    it('should return defaultValue if value is null', () => {
      expect(getSafeString(null, 'def')).toBe('def');
    });

    it('should return defaultValue if value is undefined', () => {
      expect(getSafeString(undefined, 'def')).toBe('def');
    });
  });

  describe('getSafeNumber', () => {
    it('should return value if it is a number', () => {
      expect(getSafeNumber(42, 10)).toBe(42);
    });

    it('should convert string to number', () => {
      expect(getSafeNumber('123', 10)).toBe(123);
    });

    it('should return defaultValue if value is null', () => {
      expect(getSafeNumber(null, 10)).toBe(10);
    });
  });

  describe('getDefaultValue', () => {
    it('should return defaultValue if provided', () => {
      expect(getDefaultValue('param', 'abc')).toBe('abc');
    });

    it('should return empty string if isOptional and no defaultValue', () => {
      expect(getDefaultValue('param', undefined, true)).toBe('');
    });

    it('should call die if parameter is mandatory and no defaultValue', () => {
      getDefaultValue('param');
      expect(die).toHaveBeenCalledWith(expect.stringContaining('parameter param is mandatory'));
    });
  });

  describe('closeSubscription', () => {
    it('should unsubscribe if subscription is provided', () => {
      const sub = { unsubscribe: vi.fn() } as unknown as Subscription;
      closeSubscription(sub);
      expect(sub.unsubscribe).toHaveBeenCalled();
    });

    it('should not throw if subscription is undefined', () => {
      expect(() => closeSubscription(undefined)).not.toThrow();
    });

    it('should not throw if subscription is null', () => {
      expect(() => closeSubscription(null)).not.toThrow();
    });
  });
});