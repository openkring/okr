import { describe, it, expect } from 'vitest';

import { articleImageLayout } from './page';

describe('articleImageLayout', () => {
  it('maps a single image to its ViewPosition', () => {
    expect(articleImageLayout(1, 0, 3).imagePosition).toBe('none');
    expect(articleImageLayout(1, 1, 3).imagePosition).toBe('top');
    expect(articleImageLayout(1, 2, 3).imagePosition).toBe('bottom');
    expect(articleImageLayout(1, 3, 3).imagePosition).toBe('left');
    expect(articleImageLayout(1, 4, 3).imagePosition).toBe('right');
  });

  it('treats a missing or unknown position as none', () => {
    expect(articleImageLayout(1, undefined, 6).imagePosition).toBe('none');
    expect(articleImageLayout(1, 9, 6).imagePosition).toBe('none');
  });

  it('always puts several images on top, whatever the position', () => {
    expect(articleImageLayout(3, 3, 4).imagePosition).toBe('top');
    expect(articleImageLayout(2, 0, 4).imagePosition).toBe('top');
  });

  it('has no image position without images', () => {
    expect(articleImageLayout(0, 1, 6).imagePosition).toBe('none');
  });

  it('uses colSize as the image column width, defaulting to 6', () => {
    expect(articleImageLayout(1, 3, 4).imageColSize).toBe(4);
    expect(articleImageLayout(1, 3, undefined).imageColSize).toBe(6);
    expect(articleImageLayout(1, 3, 0).imageColSize).toBe(6);
    expect(articleImageLayout(1, 3, 12).imageColSize).toBe(6);
  });
});
