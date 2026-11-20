import { SLIDESHOW_EFFECTS, type ArticleSlideshow, type SlideshowEffect } from '@okr/shared-models';

export const SLIDESHOW_INTERVAL_MIN = 1;
export const SLIDESHOW_INTERVAL_MAX = 30;
export const SLIDESHOW_DURATION_MIN = 0.2;
export const SLIDESHOW_DURATION_MAX = 5;

/** The settings of la21staefa.ch's header: fade for 1 s, each image 3 s. Used when a slideshow is first switched on. */
export const DEFAULT_SLIDESHOW: ArticleSlideshow = { effect: 'fade', autoplay: true, interval: 3, duration: 1 };

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * The slideshow an article actually runs, or `undefined` for the plain swipe carousel (no setting,
 * effect 'none', an unknown effect, or fewer than two images). Out-of-range times are clamped, never
 * rejected — a stored value must not stop a page from rendering.
 */
export function resolveSlideshow(cfg: Partial<ArticleSlideshow> | undefined, imageCount: number): ArticleSlideshow | undefined {
  if (!cfg || imageCount < 2) return undefined;
  const effect = cfg.effect as SlideshowEffect;
  if (!SLIDESHOW_EFFECTS.includes(effect) || effect === 'none') return undefined;
  return {
    effect,
    autoplay: cfg.autoplay !== false,
    interval: clamp(cfg.interval, SLIDESHOW_INTERVAL_MIN, SLIDESHOW_INTERVAL_MAX, DEFAULT_SLIDESHOW.interval),
    duration: clamp(cfg.duration, SLIDESHOW_DURATION_MIN, SLIDESHOW_DURATION_MAX, DEFAULT_SLIDESHOW.duration),
  };
}

/** The next slide index, wrapping in both directions. */
export function slideshowStep(current: number, direction: 1 | -1, count: number): number {
  if (count <= 0) return 0;
  return (((current + direction) % count) + count) % count;
}

/**
 * A wide, cropped picture for a slideshow slide (2.67 : 1, like la21staefa.ch's 1024×384 header): a
 * storage path through imgix, or an https url as is with the same parameters. '' for anything else.
 */
export function slideshowImageUrl(raw: string | undefined, imgixBaseUrl: string): string {
  const path = (raw ?? '').trim();
  if (!path) return '';
  const params = 'w=1600&h=600&fit=crop&auto=format,compress';
  if (/^https:\/\//.test(path)) return `${path}${path.includes('?') ? '&' : '?'}${params}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9/_. -]*$/.test(path) || path.includes('..')) return '';
  return `${imgixBaseUrl}/${path.split('/').map(encodeURIComponent).join('/')}?${params}`;
}
