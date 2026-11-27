import { HeroConfig, IMAGE_CONFIG_SHAPE, IMAGE_STYLE_SHAPE, ImageConfig, ImageStyle, SectionCta } from '@okr/shared-models';

import { HERO_HEIGHTS } from './hero.util';

/**
 * The simple settings of a hero in the hero editor: height, image focus, logo size and shape, and its buttons. Each one writes the
 * fields a hero has always stored (`HeroConfig`, its `imageStyle`), so readers, the website and older apps draw it as before. A stored
 * value that matches no choice shows none as chosen; it is kept until one is picked.
 */

/** at most this many buttons in a hero (the reader draws no more) */
export const HERO_MAX_CTAS = 2;

/** 'default' = no height stored (as the hero always was); 'px' = a pixel height of its own */
export const HERO_HEIGHT_CHOICES = ['default', ...HERO_HEIGHTS, 'px'] as const;
export type HeroHeightChoice = (typeof HERO_HEIGHT_CHOICES)[number];
/** the pixel height a switch to «own value» starts from */
export const HERO_DEFAULT_HEIGHT_PX = 400;

export const HERO_LOGO_SIZES = ['s', 'm', 'l'] as const;
export type HeroLogoSize = (typeof HERO_LOGO_SIZES)[number];
/** the logo's width; the reader caps it at 300 px and half the card */
const LOGO_WIDTHS: Record<HeroLogoSize, string> = { s: '80px', m: '150px', l: '240px' };

export const HERO_LOGO_SHAPES = ['square', 'rounded', 'round'] as const;
export type HeroLogoShape = (typeof HERO_LOGO_SHAPES)[number];
const LOGO_RADII: Record<HeroLogoShape, string> = { square: '0', rounded: '12px', round: '50%' };

const styleOf = (config: HeroConfig): ImageStyle => ({ ...IMAGE_STYLE_SHAPE, ...(config.imageStyle ?? {}) });

// ---------------------------------------------------- cover ----------------------------------------------------

/** whether the hero has a cover image (without one the website draws the gradient band) */
export function heroHasCover(config: HeroConfig | undefined): boolean {
  return !!config?.hero?.url;
}

/** a new cover replaces the old one; undefined removes it (an empty image, as the form always stored) */
export function applyHeroCover(config: HeroConfig, image: ImageConfig | undefined): HeroConfig {
  return { ...config, hero: image ?? IMAGE_CONFIG_SHAPE };
}

export function heroHeightChoiceOf(height: HeroConfig['height']): HeroHeightChoice {
  if (height === undefined) return 'default';
  if (typeof height === 'number') return 'px';
  return (HERO_HEIGHTS as readonly string[]).includes(height) ? height : 'px';
}

/** 'default' removes the stored height; 'px' keeps a stored pixel height or starts from 400 */
export function applyHeroHeight(config: HeroConfig, choice: HeroHeightChoice): HeroConfig {
  const { height, ...rest } = config;
  if (choice === 'default') return rest;
  if (choice === 'px') return { ...rest, height: typeof height === 'number' ? height : HERO_DEFAULT_HEIGHT_PX };
  return { ...rest, height: choice };
}

// ---------------------------------------------------- logo ----------------------------------------------------

export function heroHasLogo(config: HeroConfig | undefined): boolean {
  return !!config?.logo?.url;
}

export function applyHeroLogo(config: HeroConfig, image: ImageConfig | undefined): HeroConfig {
  return { ...config, logo: image ?? IMAGE_CONFIG_SHAPE };
}

export function heroLogoSizeOf(config: HeroConfig): HeroLogoSize | undefined {
  const width = styleOf(config).width;
  return HERO_LOGO_SIZES.find((size) => LOGO_WIDTHS[size] === width);
}

export function applyHeroLogoSize(config: HeroConfig, size: HeroLogoSize): HeroConfig {
  return { ...config, imageStyle: { ...styleOf(config), width: LOGO_WIDTHS[size] } };
}

export function heroLogoShapeOf(config: HeroConfig): HeroLogoShape | undefined {
  const radius = styleOf(config).borderRadius;
  return HERO_LOGO_SHAPES.find((shape) => LOGO_RADII[shape] === radius);
}

export function applyHeroLogoShape(config: HeroConfig, shape: HeroLogoShape): HeroConfig {
  return { ...config, imageStyle: { ...styleOf(config), borderRadius: LOGO_RADII[shape] } };
}

// ---------------------------------------------------- buttons ----------------------------------------------------

export function heroCtasOf(config: HeroConfig | undefined): SectionCta[] {
  return config?.ctas ?? [];
}

/** a new, empty button at the end: the first stands out, the second is quieter. Unchanged once there are two. */
export function addHeroCta(config: HeroConfig): HeroConfig {
  const ctas = heroCtasOf(config);
  if (ctas.length >= HERO_MAX_CTAS) return config;
  return { ...config, ctas: [...ctas, { label: '', url: '', style: ctas.length === 0 ? 'primary' : 'secondary' }] };
}

export function updateHeroCta(config: HeroConfig, index: number, patch: Partial<SectionCta>): HeroConfig {
  const ctas = heroCtasOf(config);
  if (index < 0 || index >= ctas.length) return config;
  return { ...config, ctas: ctas.map((cta, i) => (i === index ? { ...cta, ...patch } : cta)) };
}

/** the last button removed leaves no `ctas` field, as a hero without buttons always was */
export function removeHeroCta(config: HeroConfig, index: number): HeroConfig {
  const ctas = heroCtasOf(config);
  if (index < 0 || index >= ctas.length) return config;
  const { ctas: _removed, ...rest } = config;   // eslint-disable-line @typescript-eslint/no-unused-vars
  const next = ctas.filter((_, i) => i !== index);
  return next.length > 0 ? { ...rest, ctas: next } : rest;
}

/** the button at `index` moves one place to the front */
export function moveHeroCtaForward(config: HeroConfig, index: number): HeroConfig {
  const ctas = [...heroCtasOf(config)];
  if (index <= 0 || index >= ctas.length) return config;
  [ctas[index - 1], ctas[index]] = [ctas[index], ctas[index - 1]];
  return { ...config, ctas };
}
