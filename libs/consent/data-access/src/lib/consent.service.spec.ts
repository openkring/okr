import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { firstValueFrom } from 'rxjs';

vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();
  return {
    ...actual,
    inject: vi.fn(),
  };
});

vi.mock('@okr/shared-util-core', () => ({
  isBrowser: vi.fn(() => true),
}));

import { inject } from '@angular/core';
import { isBrowser } from '@okr/shared-util-core';
import { ConsentService, CONSENT_KEY, DEFAULT_CONSENT, cookieNoticeHash } from './consent.service';

function makeService(platform: 'browser' | 'server'): ConsentService {
  (isBrowser as ReturnType<typeof vi.fn>).mockReturnValue(platform === 'browser');
  (inject as ReturnType<typeof vi.fn>).mockImplementation(() => platform);
  return new ConsentService();
}

describe('cookieNoticeHash', () => {
  it('is stable for the same text', () => {
    expect(cookieNoticeHash('Wir verwenden Cookies.')).toBe(cookieNoticeHash('Wir verwenden Cookies.'));
  });

  it('differs when the text changes', () => {
    expect(cookieNoticeHash('Wir verwenden Cookies.')).not.toBe(cookieNoticeHash('Wir verwenden keine Cookies.'));
  });

  it('is an 8-digit hex string, also for the empty text', () => {
    expect(cookieNoticeHash('')).toMatch(/^[0-9a-f]{8}$/);
    expect(cookieNoticeHash('äöü — «»')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('ConsentService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (isBrowser as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initial state', () => {
    it('needs the banner when nothing is stored', () => {
      const s = makeService('browser');
      expect(s.needsBanner()).toBe(true);
      expect(s.getState().decided).toBe(false);
    });

    it('loads a persisted acknowledgement', () => {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ decided: true, textHash: 'abc', timestamp: 123 }));
      const s = makeService('browser');
      expect(s.getState()).toEqual({ decided: true, textHash: 'abc', timestamp: 123 });
      expect(s.needsBanner('abc')).toBe(false);
    });

    it('drops the analytics/marketing fields of the 2026-05 banner on read', () => {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ necessary: true, analytics: true, marketing: false, decided: true, timestamp: 1 }));
      const s = makeService('browser');
      expect(s.getState()).toEqual({ decided: true, textHash: undefined, timestamp: 1 });
    });

    it('treats a malformed stored value as default', () => {
      localStorage.setItem(CONSENT_KEY, 'not-json{{{');
      const s = makeService('browser');
      expect(s.getState()).toEqual(DEFAULT_CONSENT);
    });
  });

  describe('needsBanner()', () => {
    it('is false after acknowledging, without a hash', () => {
      const s = makeService('browser');
      s.acknowledge();
      expect(s.needsBanner()).toBe(false);
    });

    it('is true again when the text changed since the acknowledgement', () => {
      const s = makeService('browser');
      s.acknowledge('aaaa');
      expect(s.needsBanner('aaaa')).toBe(false);
      expect(s.needsBanner('bbbb')).toBe(true);
    });

    it('is true for an old acknowledgement that has no hash yet', () => {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ decided: true }));
      const s = makeService('browser');
      expect(s.needsBanner('aaaa')).toBe(true);
    });
  });

  describe('acknowledge()', () => {
    it('persists the acknowledgement with its text hash', () => {
      const s = makeService('browser');
      s.acknowledge('cafe1234');
      const stored = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? '{}');
      expect(stored.decided).toBe(true);
      expect(stored.textHash).toBe('cafe1234');
      expect(typeof stored.timestamp).toBe('number');
    });

    it('emits the new state on consent$', async () => {
      const s = makeService('browser');
      s.acknowledge('cafe1234');
      const state = await firstValueFrom(s.consent$);
      expect(state.decided).toBe(true);
    });
  });

  describe('reset()', () => {
    it('shows the banner again and clears localStorage', () => {
      const s = makeService('browser');
      s.acknowledge('x');
      s.reset();
      expect(s.needsBanner()).toBe(true);
      expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
    });
  });

  describe('SSR safety (non-browser)', () => {
    it('returns the default state without touching localStorage', () => {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ decided: true }));
      const s = makeService('server');
      expect(s.getState()).toEqual(DEFAULT_CONSENT);
      s.acknowledge('x');
      expect(JSON.parse(localStorage.getItem(CONSENT_KEY) ?? '{}').textHash).toBeUndefined();
    });
  });
});
