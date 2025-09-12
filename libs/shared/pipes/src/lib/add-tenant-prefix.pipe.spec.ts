import { ReplacePipe } from './add-tenant-prefix.pipe';
import { replaceSubstring } from '@bk2/shared-util-core';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the external dependency from another library
vi.mock('@bk2/shared-util-core', () => ({
  replaceSubstring: vi.fn(),
}));

describe('ReplacePipe', () => {
  let pipe: ReplacePipe;
  const mockReplaceSubstring = vi.mocked(replaceSubstring);

  beforeEach(() => {
    pipe = new ReplacePipe();
    // Clear mock history before each test
    mockReplaceSubstring.mockClear();
  });

  it('should create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should call replaceSubstring with the provided arguments', () => {
    const source = 'Hello world, this is a test.';
    const pattern = 'world';
    const replacement = 'Vitest';

    pipe.transform(source, pattern, replacement);

    expect(mockReplaceSubstring).toHaveBeenCalledTimes(1);
    expect(mockReplaceSubstring).toHaveBeenCalledWith(source, pattern, replacement);
  });

  it('should return the value from replaceSubstring', () => {
    const expectedResult = 'Hello Vitest!';
    mockReplaceSubstring.mockReturnValue(expectedResult);

    const result = pipe.transform('Hello world!', 'world', 'Vitest');

    expect(result).toBe(expectedResult);
  });

  it('should handle empty strings as arguments', () => {
    mockReplaceSubstring.mockReturnValue('replaced');

    const result = pipe.transform('', '', 'replaced');

    expect(mockReplaceSubstring).toHaveBeenCalledWith('', '', 'replaced');
    expect(result).toBe('replaced');
  });

  it('should handle a pattern that is not found', () => {
    const source = 'Hello world';
    // Assume replaceSubstring returns the original string if pattern is not found
    mockReplaceSubstring.mockReturnValue(source);

    const result = pipe.transform(source, 'galaxy', 'universe');

    expect(mockReplaceSubstring).toHaveBeenCalledWith(source, 'galaxy', 'universe');
    expect(result).toBe(source);
  });
});
