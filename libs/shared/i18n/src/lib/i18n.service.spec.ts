import { defer, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The scope-load failure path is what opens the `i18n scope-load-failed` Sentry issues, so both
// collaborators are spies rather than the real module (which would need a Sentry client).
const sentry = vi.hoisted(() => ({
  reportI18nIssue: vi.fn(),
  isPageUnloading: vi.fn(() => false),
}));
vi.mock('./i18n-sentry', () => sentry);

// Mock dependencies
vi.mock('@jsverse/transloco', () => ({
  TranslocoService: class {
    setActiveLang = vi.fn();
    getActiveLang = vi.fn(() => 'de');
    selectTranslate = vi.fn((key, arg) => of(`translated:${key}${arg ? ':' + JSON.stringify(arg) : ''}`));
    load = vi.fn(() => of({}));
  },
  getBrowserLang: vi.fn(() => 'de'),
  HashMap: Object,
}));

// Partial mock: only the language constants are pinned. Replacing the whole module breaks any
// transitive importer that reads another export at module-eval time (e.g. shared-util-core's
// photo-declaration.util reading PrivacyUsage).
vi.mock('@okr/shared-models', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@okr/shared-models')>()),
  AvailableLanguages: ['en', 'de', 'fr'],
  DefaultLanguageCode: 'de',
}));

vi.mock('./i18n.util', () => ({
  selectLanguage: vi.fn((available, defaultLang, configuredLang) => configuredLang || defaultLang),
}));

import { I18nService } from './i18n.service';

describe('I18nService', () => {
  let service: I18nService;

  beforeEach(() => {
    const mockTranslocoService = {
      setActiveLang: vi.fn(),
      getActiveLang: vi.fn(() => 'de'),
      selectTranslate: vi.fn((key, arg) => of(`translated:${key}${arg ? ':' + JSON.stringify(arg) : ''}`)),
      load: vi.fn(() => of({})),
    };
    service = new I18nService(mockTranslocoService as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should get browser language', () => {
    expect(service.getBrowserLang()).toBe('de');
  });

  it('should set active language using selectLanguage', () => {
    service.setActiveLang('de', 'en');
    // You can add assertions for the mock if needed
  });

  it('should get active language', () => {
    expect(service.getActiveLang()).toBe('de');
  });

  it('should translate @-prefixed key with argument', () => {
    const obs = service.translate('@test.key', { foo: 'bar' });
    let result = '';
    obs.subscribe((val: string) => { result = val; });
    expect(result).toBe('translated:test.key:{"foo":"bar"}');
  });

  it('should translate @-prefixed key without argument', () => {
    const obs = service.translate('@test.key');
    let result = '';
    obs.subscribe((val: string) => { result = val; });
    expect(result).toBe('translated:test.key');
  });

  it('should return key as-is for non-@-prefixed key', () => {
    const obs = service.translate('plainKey');
    let result = '';
    obs.subscribe((val: string) => { result = val; });
    expect(result).toBe('plainKey');
  });

  it('should return empty string for null/empty key', () => {
    const obs = service.translate('');
    let result = 'not empty';
    obs.subscribe((val: string) => { result = val; });
    expect(result).toBe('');
  });

  it('should translate scoped key by loading the scope file first', () => {
    const results: string[] = [];
    service.translate('@chat/feature.fields.reconnecting').subscribe(v => results.push(v));
    // The scope prefix is stripped from the key and passed as the 3rd selectTranslate arg (scope);
    // the no-argument call passes {} as params, which the mock serialises after the key.
    expect(results).toEqual(['translated:fields.reconnecting:{}']);
  });

  it('should translate scoped key with argument', () => {
    const results: string[] = [];
    service.translate('@chat/feature.fields.count', { n: 3 }).subscribe(v => results.push(v));
    // The scope prefix (chat/feature) is stripped from the key and passed as scope.
    expect(results).toEqual(['translated:fields.count:{"n":3}']);
  });

  it('should not call load for legacy root keys', () => {
    const loadSpy = vi.spyOn((service as any).translocoService, 'load');
    service.translate('@chat.fields.reconnecting').subscribe();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  describe('scope load failure', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      sentry.reportI18nIssue.mockClear();
      sentry.isPageUnloading.mockReturnValue(false);
    });
    afterEach(() => vi.useRealTimers());

    /** Fails the first `failures` subscriptions, then succeeds — mimicking an aborted fetch. */
    const flakyLoad = (failures: number) => {
      let attempt = 0;
      return vi.fn(() => defer(() => (attempt++ < failures ? throwError(() => new Error('abort')) : of({}))));
    };

    it('should retry once and translate when the first load attempt fails', async () => {
      (service as any).translocoService.load = flakyLoad(1);
      const results: string[] = [];
      service.translate('@chat/feature.fields.reconnecting').subscribe(v => results.push(v));

      await vi.advanceTimersByTimeAsync(400);
      expect(results).toEqual(['translated:fields.reconnecting:{}']);
      expect(sentry.reportI18nIssue).not.toHaveBeenCalled();
    });

    it('should report to Sentry and emit an empty string when every attempt fails', async () => {
      (service as any).translocoService.load = flakyLoad(Infinity);
      const results: string[] = [];
      service.translate('@chat/feature.fields.reconnecting').subscribe(v => results.push(v));

      await vi.advanceTimersByTimeAsync(400);
      expect(results).toEqual(['']);
      expect(sentry.reportI18nIssue).toHaveBeenCalledWith('@chat/feature.fields.reconnecting', 'scope-load-failed');
    });

    it('should stay silent while the page is being torn down', async () => {
      sentry.isPageUnloading.mockReturnValue(true);
      (service as any).translocoService.load = flakyLoad(Infinity);
      const results: string[] = [];
      service.translate('@chat/feature.fields.reconnecting').subscribe(v => results.push(v));

      await vi.advanceTimersByTimeAsync(400);
      expect(results).toEqual(['']);
      expect(sentry.reportI18nIssue).not.toHaveBeenCalled();
    });
  });
});