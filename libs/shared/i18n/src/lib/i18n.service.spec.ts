import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@jsverse/transloco', () => ({
  TranslocoService: class {
    setActiveLang = vi.fn();
    getActiveLang = vi.fn(() => 'en');
    selectTranslate = vi.fn((key, arg) => of(`translated:${key}${arg ? ':' + JSON.stringify(arg) : ''}`));
  },
  getBrowserLang: vi.fn(() => 'en'),
  HashMap: Object,
}));

vi.mock('@bk2/shared-models', () => ({
  AvailableLanguages: ['en', 'de', 'fr'],
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
      getActiveLang: vi.fn(() => 'en'),
      selectTranslate: vi.fn((key, arg) => of(`translated:${key}${arg ? ':' + JSON.stringify(arg) : ''}`)),
    };
    service = new I18nService(mockTranslocoService as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should get browser language', () => {
    expect(service.getBrowserLang()).toBe('en');
  });

  it('should set active language using selectLanguage', () => {
    service.setActiveLang('de', 'en');
    // You can add assertions for the mock if needed
  });

  it('should get active language', () => {
    expect(service.getActiveLang()).toBe('en');
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
});