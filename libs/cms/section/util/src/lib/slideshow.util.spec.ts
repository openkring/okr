import { describe, expect, it } from 'vitest';

import { resolveSlideshow, slideshowImageUrl, slideshowStep } from './slideshow.util';

describe('resolveSlideshow', () => {
  it('is off without a setting, for effect none and for a single image', () => {
    expect(resolveSlideshow(undefined, 5)).toBeUndefined();
    expect(resolveSlideshow({ effect: 'none' }, 5)).toBeUndefined();
    expect(resolveSlideshow({ effect: 'fade' }, 1)).toBeUndefined();
    expect(resolveSlideshow({ effect: 'swirl' as never }, 5)).toBeUndefined();
  });

  it('fills missing values with the la21staefa defaults', () => {
    expect(resolveSlideshow({ effect: 'kenburns' }, 3)).toEqual({ effect: 'kenburns', autoplay: true, interval: 3, duration: 1 });
  });

  it('clamps out-of-range times', () => {
    expect(resolveSlideshow({ effect: 'fade', interval: 0, duration: 99, autoplay: false }, 2))
      .toEqual({ effect: 'fade', autoplay: false, interval: 1, duration: 5 });
  });
});

describe('slideshowStep', () => {
  it('wraps forwards and backwards', () => {
    expect(slideshowStep(2, 1, 3)).toBe(0);
    expect(slideshowStep(0, -1, 3)).toBe(2);
    expect(slideshowStep(0, 1, 0)).toBe(0);
  });
});

describe('slideshowImageUrl', () => {
  it('builds a wide imgix crop for a storage path and passes an https url through', () => {
    expect(slideshowImageUrl('tenant/la21staefa/hero/a b.jpg', 'https://x.imgix.net'))
      .toBe('https://x.imgix.net/tenant/la21staefa/hero/a%20b.jpg?w=1600&h=600&fit=crop&auto=format,compress');
    expect(slideshowImageUrl('https://e.org/a.jpg?v=1', 'https://x.imgix.net')).toBe('https://e.org/a.jpg?v=1&w=1600&h=600&fit=crop&auto=format,compress');
  });

  it('refuses traversal and other schemes', () => {
    expect(slideshowImageUrl('../etc/passwd', 'https://x')).toBe('');
    expect(slideshowImageUrl('javascript:alert(1)', 'https://x')).toBe('');
  });
});
