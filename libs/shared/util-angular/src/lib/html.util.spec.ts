import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isInSplitPane } from './html.util';

describe('isInSplitPane function', () => {
  let originalInnerWidth: number;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it('should return false when no split-pane element is found', () => {
    vi.spyOn(document, 'querySelector').mockReturnValue(null);

    const result = isInSplitPane();
    expect(result).toBe(false);
  });

  it('should return false when window width is less than 992', () => {
    const mockElement = document.createElement('div');
    mockElement.classList.add('split-pane');
    vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 800,
    });

    const result = isInSplitPane();
    expect(result).toBe(false);
  });

  it('should return true when window width is greater than or equal to 992', () => {
    const mockElement = document.createElement('div');
    mockElement.classList.add('split-pane');
    vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1000,
    });

    const result = isInSplitPane();
    expect(result).toBe(true);
  });

  it('should return true when window width equals 992', () => {
    const mockElement = document.createElement('div');
    mockElement.classList.add('split-pane');
    vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 992,
    });

    const result = isInSplitPane();
    expect(result).toBe(true);
  });

  it('should handle querySelector returning undefined', () => {
    vi.spyOn(document, 'querySelector').mockReturnValue(undefined as any);

    const result = isInSplitPane();
    expect(result).toBe(false);
  });

  it('should handle zero window width', () => {
    const mockElement = document.createElement('div');
    mockElement.classList.add('split-pane');
    vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 0,
    });

    const result = isInSplitPane();
    expect(result).toBe(false);
  });

  it('should handle negative window width', () => {
    const mockElement = document.createElement('div');
    mockElement.classList.add('split-pane');
    vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: -100,
    });

    const result = isInSplitPane();
    expect(result).toBe(false);
  });

  it('should verify querySelector is called only once per function call', () => {
    const mockElement = document.createElement('div');
    mockElement.classList.add('split-pane');
    const querySelectorSpy = vi.spyOn(document, 'querySelector').mockReturnValue(mockElement);

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1000,
    });

    isInSplitPane();

    expect(querySelectorSpy).toHaveBeenCalledTimes(1);
    expect(querySelectorSpy).toHaveBeenCalledWith('ion-split-pane');
  });
});