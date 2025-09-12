import { CategoryAbbreviationPipe } from './category-abbreviation.pipe';
import { getCategoryAbbreviation } from '@bk2/shared-categories';
import { CategoryModel } from '@bk2/shared-models';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the external dependency from another library
vi.mock('@bk2/shared-categories', () => ({
  getCategoryAbbreviation: vi.fn(),
}));

describe('CategoryAbbreviationPipe', () => {
  let pipe: CategoryAbbreviationPipe;
  const mockGetCategoryAbbreviation = vi.mocked(getCategoryAbbreviation);

  beforeEach(() => {
    pipe = new CategoryAbbreviationPipe();
    // Clear mock history before each test
    mockGetCategoryAbbreviation.mockClear();
  });

  it('should create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should call getCategoryAbbreviation with the provided arguments', () => {
    const categories: CategoryModel[] = [{ id: 1, name: 'Category A' } as unknown];
    const categoryId = 1;

    pipe.transform(categoryId, categories);

    expect(mockGetCategoryAbbreviation).toHaveBeenCalledTimes(1);
    expect(mockGetCategoryAbbreviation).toHaveBeenCalledWith(categories, categoryId);
  });

  it('should return the value from getCategoryAbbreviation', () => {
    const expectedAbbreviation = 'CA';
    mockGetCategoryAbbreviation.mockReturnValue(expectedAbbreviation);

    const categories: CategoryModel[] = [];
    const categoryId = 2;
    const result = pipe.transform(categoryId, categories);

    expect(result).toBe(expectedAbbreviation);
  });

  it('should handle an empty array of categories', () => {
    mockGetCategoryAbbreviation.mockReturnValue(''); // Assume it returns empty string if not found

    const result = pipe.transform(1, []);

    expect(mockGetCategoryAbbreviation).toHaveBeenCalledWith([], 1);
    expect(result).toBe('');
  });
});
