import { describe, it, expect } from 'vitest';
import { migrateArticleImageProperties } from './article-image-migration.util';

describe('migrateArticleImageProperties', () => {
  it('moves a legacy single image into images[] and drops the legacy field', () => {
    const result = migrateArticleImageProperties({
      image: { url: 'a.jpg', label: 'A', type: 0, actionUrl: '', altText: 'A', overlay: '' },
      imageStyle: { width: '160' },
    });
    expect(result.changed).toBe(true);
    expect(result.properties.images).toEqual([
      { url: 'a.jpg', label: 'A', type: 0, actionUrl: '', altText: 'A', overlay: '' },
    ]);
    expect('image' in result.properties).toBe(false);
    expect(result.properties.imageStyle).toEqual({ width: '160' });
  });

  it('leaves docs that already have images[] untouched (only drops the stray legacy field)', () => {
    const result = migrateArticleImageProperties({
      images: [{ url: 'b.jpg' }],
      image: { url: 'a.jpg' },
    });
    expect(result.changed).toBe(true);
    expect(result.properties.images).toEqual([{ url: 'b.jpg' }]);
    expect('image' in result.properties).toBe(false);
  });

  it('reports no change when there is no legacy field and images already exist', () => {
    const result = migrateArticleImageProperties({ images: [{ url: 'b.jpg' }] });
    expect(result.changed).toBe(false);
    expect(result.properties.images).toEqual([{ url: 'b.jpg' }]);
  });

  it('reports no change for an empty article config (no image, no images)', () => {
    const result = migrateArticleImageProperties({ imageStyle: {} });
    expect(result.changed).toBe(false);
    expect(result.properties.images).toBeUndefined();
  });
});
