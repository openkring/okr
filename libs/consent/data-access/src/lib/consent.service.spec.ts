import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { firstValueFrom } from 'rxjs';

vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();
  return {
    ...actual,
    inject: vi.fn(),
  };
});

vi.mock('@bk2/shared-util-core', () => ({
  isBrowser: vi.fn(() => true),
}));

import { inject } from '@angular/core';
import { isBrowser } from '@bk2/shared-util-core';
import { ConsentService, CONSENT_KEY, DEFAULT_CONSENT, ConsentState } from './consent.service';

function makeService(platform: 'browser' | 'server'): ConsentService {
  (isBrowser as ReturnType<typeof vi.fn>).mockReturnValue(platform === 'browser');
  (inject as ReturnType<typeof vi.fn>).mockImplementation(() => platform);
  return new ConsentService();
}

describe('ConsentService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Default: browser platform
    (isBrowser as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initial state', () => {
    it('defaults to decided=false when no stored consent', () => {
      const s = makeService('browser');
      expect(s.needsBanner()).toBe(true);
      expect(s.getState().decided).toBe(false);
    });

    it('always has necessary=true', () => {
      const s = makeService('browser');
      expect(s.getState().necessary).toBe(true);
    });

    it('defaults analytics and marketing to false', () => {
      const s = makeService('browser');
      expect(s.hasAnalyticsConsent()).toBe(false);
      expect(s.hasMarketingConsent()).toBe(false);
    });

    it('loads persisted state on construction', () => {
      const stored: ConsentState = {
        necessary: true, analytics: true, marketing: false, decided: true, timestamp: 123,
      };
      localStorage.setItem(CONSENT_KEY, JSON.stringify(stored));
      const s = makeService('browser');
      expect(s.hasAnalyticsConsent()).toBe(true);
      expect(s.needsBanner()).toBe(false);
    });

    it('treats malformed localStorage value as default', () => {
      localStorage.setItem(CONSENT_KEY, 'not-valid-json{{{');
      const s = makeService('browser');
      expect(s.getState()).toEqual(DEFAULT_CONSENT);
    });
  });

  describe('acceptAll()', () => {
    it('sets analytics and marketing true, decided true', () => {
      const s = makeService('browser');
      s.acceptAll();
      expect(s.getState().analytics).toBe(true);
      expect(s.getState().marketing).toBe(true);
      expect(s.getState().decided).toBe(true);
      expect(s.needsBanner()).toBe(false);
    });

    it('persists to localStorage', () => {
      const s = makeService('browser');
      s.acceptAll();
      const raw = JSON.parse(localStorage.getItem(CONSENT_KEY)!);
      expect(raw.analytics).toBe(true);
      expect(raw.decided).toBe(true);
    });

    it('emits updated state on consent$', async () => {
      const s = makeService('browser');
      s.acceptAll();
      const emitted = await firstValueFrom(s.consent$);
      expect(emitted.analytics).toBe(true);
    });
  });

  describe('rejectAll()', () => {
    it('sets analytics and marketing false, decided true', () => {
      const s = makeService('browser');
      s.rejectAll();
      expect(s.getState().analytics).toBe(false);
      expect(s.getState().marketing).toBe(false);
      expect(s.getState().decided).toBe(true);
      expect(s.needsBanner()).toBe(false);
    });

    it('persists to localStorage', () => {
      const s = makeService('browser');
      s.rejectAll();
      const raw = JSON.parse(localStorage.getItem(CONSENT_KEY)!);
      expect(raw.decided).toBe(true);
      expect(raw.analytics).toBe(false);
    });
  });

  describe('setCustom()', () => {
    it('allows opting into analytics only', () => {
      const s = makeService('browser');
      s.setCustom({ analytics: true, marketing: false });
      expect(s.hasAnalyticsConsent()).toBe(true);
      expect(s.hasMarketingConsent()).toBe(false);
      expect(s.needsBanner()).toBe(false);
    });

    it('always enforces necessary=true even if caller passes false', () => {
      const s = makeService('browser');
      s.setCustom({ necessary: false } as Partial<ConsentState>);
      expect(s.getState().necessary).toBe(true);
    });

    it('sets decided=true', () => {
      const s = makeService('browser');
      s.setCustom({ analytics: false, marketing: false });
      expect(s.getState().decided).toBe(true);
    });
  });

  describe('reset()', () => {
    it('resets to default state and shows banner again', () => {
      const s = makeService('browser');
      s.acceptAll();
      s.reset();
      expect(s.getState()).toEqual(DEFAULT_CONSENT);
      expect(s.needsBanner()).toBe(true);
    });

    it('clears localStorage on reset', () => {
      const s = makeService('browser');
      s.acceptAll();
      s.reset();
      expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
    });
  });

  describe('SSR safety (non-browser)', () => {
    it('returns default state without touching localStorage', () => {
      const s = makeService('server');
      expect(s.needsBanner()).toBe(true);
      expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
    });
  });
});
