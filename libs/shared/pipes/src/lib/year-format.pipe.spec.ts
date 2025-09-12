import { YearFormatPipe } from './year-format.pipe';
import { convertDateFormatToString, warn, DateFormat } from '@bk2/shared-util-core';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the external dependencies
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof import('@bk2/shared-util-core')>();
  return {
    ...actual,
    convertDateFormatToString: vi.fn(),
    warn: vi.fn(),
  };
});

describe('YearFormatPipe', () => {
  let pipe: YearFormatPipe;
  const mockConvertDateFormatToString = vi.mocked(convertDateFormatToString);
  const mockWarn = vi.mocked(warn);

  beforeEach(() => {
    pipe = new YearFormatPipe();
    vi.clearAllMocks();
  });

  it('should create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should return an empty string if storeDate is undefined', () => {
    expect(pipe.transform(undefined)).toBe('');
    expect(mockConvertDateFormatToString).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('should return an empty string if storeDate is an empty string', () => {
    expect(pipe.transform('')).toBe('');
    expect(mockConvertDateFormatToString).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('should handle a 4-character year string', () => {
    const storeDate = '2025';
    mockConvertDateFormatToString.mockReturnValue('2025');

    const result = pipe.transform(storeDate);

    expect(mockConvertDateFormatToString).toHaveBeenCalledWith(storeDate, DateFormat.Year, DateFormat.Year, false);
    expect(result).toBe('2025');
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('should handle an 8-character store date string', () => {
    const storeDate = '20250904';
    mockConvertDateFormatToString.mockReturnValue('2025');

    const result = pipe.transform(storeDate);

    expect(mockConvertDateFormatToString).toHaveBeenCalledWith(storeDate, DateFormat.StoreDate, DateFormat.Year, false);
    expect(result).toBe('2025');
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('should handle a 14-character store date time string', () => {
    const storeDate = '20250904123000';
    mockConvertDateFormatToString.mockReturnValue('2025');

    const result = pipe.transform(storeDate);

    expect(mockConvertDateFormatToString).toHaveBeenCalledWith(storeDate, DateFormat.StoreDateTime, DateFormat.Year, false);
    expect(result).toBe('2025');
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('should warn and return an empty string for an invalid date format length', () => {
    const storeDate = '202509'; // Invalid length

    const result = pipe.transform(storeDate);

    expect(mockWarn).toHaveBeenCalledWith(`YearFormatPipe: invalid store date format: ${storeDate}`);
    expect(mockConvertDateFormatToString).not.toHaveBeenCalled();
    expect(result).toBe('');
  });
});
