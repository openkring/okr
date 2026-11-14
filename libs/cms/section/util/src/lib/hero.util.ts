import { HeroConfig, HeroOverlay } from '@okr/shared-models';

/** typing limit of the free label chip on the hero overlay (used by the Vest suite and the form field) */
export const HERO_OVERLAY_LABEL_LENGTH = 40;
/** the darkening behind the overlay text: 0 = none, above 80 % the photo is no longer recognisable */
export const HERO_OVERLAY_DARKENING_MAX = 80;

export const HERO_HEIGHTS = ['S', 'M', 'L', 'full'] as const;
export const HERO_FOCUSES = ['center', 'top', 'bottom'] as const;
export const HERO_OVERLAY_POSITIONS = ['bottom-left', 'bottom-center', 'center', 'top-left'] as const;
export const HERO_OVERLAY_FONT_SIZES = ['S', 'M', 'L'] as const;

/** the lines a footprint passes to the hero overlay (travel journal); an empty string hides that line */
export interface HeroOverlayText {
  title: string;
  subtitle: string;
  coords: string;
  weather: string;
}

/** the hero's min-height as it has always been when `height` is not set */
const HERO_HEIGHT_DEFAULT = 'min(700px, 60vh)';

/** CSS length of the hero container; an absent (or unusable) height keeps today's rendering */
export function heroHeightCss(height: HeroConfig['height']): string {
  switch (height) {
    case 'S': return '35vh';
    case 'M': return '50vh';
    case 'L': return '70vh';
    case 'full': return '100vh';
    default:
      return typeof height === 'number' && Number.isFinite(height) && height > 0 ? `${height}px` : HERO_HEIGHT_DEFAULT;
  }
}

/** imgix parameters that crop the hero image to its box around the focus; '' when no focus is set */
export function heroImgixParams(config: HeroConfig): string {
  switch (config.focus) {
    case 'center': return 'fit=crop&crop=focalpoint';
    case 'top': return 'fit=crop&crop=top';
    case 'bottom': return 'fit=crop&crop=bottom';
    default: return '';
  }
}

/** CSS `object-position` for the same focus: the offline (local file, no imgix) crop */
export function heroObjectPosition(focus: HeroConfig['focus']): string {
  switch (focus) {
    case 'top': return 'center top';
    case 'bottom': return 'center bottom';
    default: return 'center';
  }
}

const FONT_SIZE: Record<HeroOverlay['fontSize'], string> = { S: '1.4rem', M: '2rem', L: '2.8rem' };

/** CSS of the overlay layer: where the text sits, its colour and size, and the darkening gradient behind it */
export function heroOverlayCss(overlay: HeroOverlay): Record<string, string> {
  const alpha = Math.min(Math.max(overlay.darkening, 0), HERO_OVERLAY_DARKENING_MAX) / 100;
  const dark = `rgba(0, 0, 0, ${alpha})`;
  const clear = 'rgba(0, 0, 0, 0)';
  let align = 'flex-start';
  let justify = 'flex-end';
  let textAlign = 'left';
  let direction = 'to top';
  switch (overlay.position) {
    case 'bottom-center': align = 'center'; textAlign = 'center'; break;
    case 'center': align = 'center'; justify = 'center'; textAlign = 'center'; direction = ''; break;
    case 'top-left': justify = 'flex-start'; direction = 'to bottom'; break;
  }
  const background = alpha === 0 ? 'none'
    : direction === '' ? `linear-gradient(${dark}, ${dark})`
    : `linear-gradient(${direction}, ${dark}, ${clear} 70%)`;
  return {
    'align-items': align,
    'justify-content': justify,
    'text-align': textAlign,
    'color': overlay.color,
    'font-size': FONT_SIZE[overlay.fontSize] ?? FONT_SIZE.M,
    'background': background,
  };
}
