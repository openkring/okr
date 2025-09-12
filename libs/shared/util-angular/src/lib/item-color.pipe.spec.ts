import { beforeEach, describe, expect, it } from 'vitest';
import { ItemColorPipe, getListItemColor } from './item-color.pipe';

describe('ItemColorPipe', () => {
  let pipe: ItemColorPipe;

  beforeEach(() => {
    pipe = new ItemColorPipe();
  });

  it('should create the pipe', () => {
    expect(pipe).toBeTruthy();
  });

  it('should return "light" for archived items', () => {
    const item = { isArchived: true } as any;
    expect(pipe.transform(item)).toBe('light');
  });

  it('should return empty string for non-archived items', () => {
    const item = { isArchived: false } as any;
    expect(pipe.transform(item)).toBe('');
  });

  it('should handle missing isArchived property as not archived', () => {
    const item = {} as any;
    expect(pipe.transform(item)).toBe('');
  });
});

describe('getListItemColor', () => {
  it('should return "light" if isArchived is true', () => {
    expect(getListItemColor(true)).toBe('light');
  });

  it('should return empty string if isArchived is false', () => {
    expect(getListItemColor(false)).toBe('');
  });
});