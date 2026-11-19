import { describe, expect, it } from 'vitest';

import { tileImageUrl } from './tile-image.util';

const BASE = 'https://bkaiser.imgix.net';

describe('tileImageUrl (image tiles in the app, spec 1.165 §10.1)', () => {
  it('crops a stored photo to the card for cover', () => {
    expect(tileImageUrl('tenant/la21staefa/groups/smaert.jpg', 'cover', BASE))
      .toBe('https://bkaiser.imgix.net/tenant/la21staefa/groups/smaert.jpg?w=640&h=480&fit=crop&auto=format,compress');
  });

  it('keeps the whole logo for contain', () => {
    expect(tileImageUrl('tenant/la21staefa/logo/kiss.png', 'contain', BASE))
      .toBe('https://bkaiser.imgix.net/tenant/la21staefa/logo/kiss.png?w=640&h=480&fit=max&auto=format,compress');
  });

  it('defaults to cover', () => {
    expect(tileImageUrl('a.jpg', undefined, BASE)).toContain('fit=crop');
  });

  it('passes an https url through with the size parameters', () => {
    expect(tileImageUrl('https://example.org/x.jpg', 'cover', BASE)).toBe('https://example.org/x.jpg?w=640&h=480&fit=crop&auto=format,compress');
  });

  it('returns empty for no image or an unsafe value', () => {
    expect(tileImageUrl('', 'cover', BASE)).toBe('');
    expect(tileImageUrl(undefined, 'cover', BASE)).toBe('');
    expect(tileImageUrl('javascript:alert(1)', 'cover', BASE)).toBe('');
    expect(tileImageUrl('../secret.jpg', 'cover', BASE)).toBe('');
  });
});
