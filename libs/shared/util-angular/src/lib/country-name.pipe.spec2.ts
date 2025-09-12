import { I18nService } from '@bk2/shared-i18n';
import { getCountryName } from '@bk2/shared-util-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CountryNamePipe } from './country-name.pipe';

// Mock ENV and I18nService
const mockI18nService = {
  getActiveLang: vi.fn()
};

// Mock getCountryName
vi.mock('@bk2/shared-util-core', () => ({
  getCountryName: vi.fn()
}));

describe('CountryNamePipe', () => {
  let pipe: CountryNamePipe;

  beforeEach(() => {
    vi.clearAllMocks();
    pipe = new CountryNamePipe(mockI18nService as unknown as I18nService);
  });

  it('should create the pipe', () => {
    expect(pipe).toBeTruthy();
  });

  it('should call getCountryName with countryCode and activeLang', () => {
    const countryCode = 'DE';
    const lang = 'de';
    mockI18nService.getActiveLang.mockReturnValue(lang);
    (getCountryName as any).mockReturnValue('Deutschland');

    pipe = new CountryNamePipe();
    (pipe as any).i18nService = mockI18nService as unknown as I18nService;

    const result = pipe.transform(countryCode);

    expect(mockI18nService.getActiveLang).toHaveBeenCalled();
    expect(getCountryName).toHaveBeenCalledWith(countryCode, lang);
    expect(result).toBe('Deutschland');
  });

  it('should return empty string if getCountryName returns empty', () => {
    const countryCode = 'XX';
    mockI18nService.getActiveLang.mockReturnValue('en');
    (getCountryName as any).mockReturnValue('');

    pipe = new CountryNamePipe();
    (pipe as any).i18nService = mockI18nService as unknown as I18nService;

    const result = pipe.transform(countryCode);

    expect(result).toBe('');
  });

  it('should handle undefined countryCode', () => {
    mockI18nService.getActiveLang.mockReturnValue('en');
    (getCountryName as any).mockReturnValue('');

    pipe = new CountryNamePipe();
    (pipe as any).i18nService = mockI18nService as unknown as I18nService;

    const result = pipe.transform(undefined as any);

    expect(getCountryName).toHaveBeenCalledWith(undefined, 'en');
    expect(result).toBe('');
  });

  it('should handle null countryCode', () => {
    mockI18nService.getActiveLang.mockReturnValue('en');
    (getCountryName as any).mockReturnValue('');

    pipe = new CountryNamePipe();
    (pipe as any).i18nService = mockI18nService as unknown as I18nService;

    const result = pipe.transform(null as any);

    expect(getCountryName).toHaveBeenCalledWith(null, 'en');
    expect(result).toBe('');
  });

  it('should handle non-string countryCode', () => {
    mockI18nService.getActiveLang.mockReturnValue('en');
    (getCountryName as any).mockReturnValue('Unknown');

    pipe = new CountryNamePipe();
    (pipe as any).i18nService = mockI18nService as unknown as I18nService;

    const result = pipe.transform(123 as any);

    expect(getCountryName).toHaveBeenCalledWith(123, 'en');
    expect(result).toBe('Unknown');
  });
});