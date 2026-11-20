import { APPLICATION_KIND_VALUES, SLIDESHOW_EFFECTS, type ImageStyle } from '@okr/shared-models';
import { imageCaption } from './image-caption';
import type { PublicPerson } from './group-people';
import { peopleExcludedKeys, peopleSourceKey, peopleSourceOf } from './people-source';

export const IMGIX_BASE = 'https://bkaiser.imgix.net';

export function toImgixUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${IMGIX_BASE}/${path}?auto=compress,format=jpg`;
}

/** The image fields of a people section's `avatar` config the website reads (AvatarConfig, shared-models). */
export interface PeoplePhotoConfig {
  imgWidth?: number;
  imgHeight?: number;
  facePad?: number;
  background?: 'original' | 'removed' | 'orgColor' | 'colors';
  bgOrgColor?: 'primary' | 'secondary' | 'alternating';
  bgColors?: string[];
  grayscale?: boolean;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * The fill behind the portrait at `index` (twin of getPeopleBgColor, @okr/cms-section-util): 'primary' /
 * 'secondary' (the tenant colours; the template maps them to its own palette) or a #rrggbb of `bgColors`;
 * undefined when the background is not filled.
 */
export function peoplePhotoBg(config: PeoplePhotoConfig, index: number): string | undefined {
  if (config.background === 'orgColor') {
    const org = config.bgOrgColor ?? 'primary';
    return org === 'alternating' ? (index % 2 === 0 ? 'primary' : 'secondary') : org;
  }
  if (config.background === 'colors') {
    const colors = (config.bgColors ?? []).filter((c) => HEX_COLOR.test(c));
    return colors.length > 0 ? colors[index % colors.length] : undefined;
  }
  return undefined;
}

/**
 * The imgix query of one portrait (twin of getPeopleImgixParams, @okr/cms-section-util): size at 2x,
 * face crop, optional black and white, optional background removal. The fill is never baked in: the
 * cut-out is transparent and the template paints `bg` behind it (so a grey portrait keeps a coloured fill).
 */
export function peoplePhotoParams(config: PeoplePhotoConfig): string {
  const size = (v: unknown, d: number): number => (typeof v === 'number' && v >= 40 && v <= 1200 ? Math.round(v) : d);
  const params = [`w=${size(config.imgWidth, 120)}`, `h=${size(config.imgHeight, 120)}`, 'dpr=2', 'auto=format,compress'];
  const pad = typeof config.facePad === 'number' ? config.facePad : 0;
  if (pad > 0) params.push('fit=facearea', `facepad=${pad}`);
  else params.push('fit=crop', 'crop=faces');
  if (config.grayscale === true) params.push('sat=-100');
  if ((config.background ?? 'original') !== 'original') params.push('bg-remove=true');
  return params.join('&');
}

export type I18nString = Record<string, string>;

const LANGS = ['de', 'en', 'fr', 'es', 'it'];

/** The `?lang=` of a page read: one of the five app languages, else 'de'. */
export function normalizeLang(raw: unknown): string {
  const l = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return LANGS.includes(l) ? l : 'de';
}

/**
 * Text in the reader's language. Non-German: the translation, else the plain field, else the German
 * translation, else any. German: the plain field wins over `i18n.de` (design §6.2a).
 */
export function pickText(plain: string | undefined, i18n: I18nString | undefined, lang: string): string {
  const own = lang !== 'de' ? i18n?.[lang] : undefined;
  if (typeof own === 'string' && own) return own;
  if (plain) return plain;
  const de = i18n?.['de'];
  if (typeof de === 'string' && de) return de;
  return Object.values(i18n ?? {}).find((v): v is string => typeof v === 'string' && !!v) ?? '';
}

/**
 * A site link may only be an https link, mailto:/tel:, a site path, an in-page anchor or a relative
 * page of the website. The twin of `isSectionCtaUrl` (cms-section-util) — functions do not import
 * it, so keep the two in step. Returns the trimmed url, or '' when unsafe.
 */
export function safeSiteUrl(url: unknown): string {
  if (typeof url !== 'string') return '';
  const u = url.trim();
  if (u.length === 0) return '';
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\\\u0000-\u001f\u007f]/.test(u)) return '';
  let ok: boolean;
  if (u.startsWith('https://') || u.startsWith('mailto:') || u.startsWith('tel:')) ok = true;
  else if (u.startsWith('#')) ok = u.length > 1;
  else if (u.startsWith('/')) ok = /^\/(?![/\\])/.test(u);
  else ok = /^[\w-]+\.html([?#].*)?$/.test(u);
  return ok ? u : '';
}

/**
 * An embed url (iframe / video src) may only be an https url without backslash or control
 * characters. Returns the trimmed url, or '' when unsafe.
 */
export function safeEmbedUrl(url: unknown): string {
  if (typeof url !== 'string') return '';
  const u = url.trim();
  if (!u.startsWith('https://') || u.length <= 'https://'.length) return '';
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\\\u0000-\u001f\u007f]/.test(u)) return '';
  return u;
}

/** A section name as an html id / anchor: lowercase, runs of anything but [a-z0-9-] become one '-', trimmed of '-'. */
export function slugName(raw: unknown): string {
  return (typeof raw === 'string' ? raw : '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** An item count: an integer from 0 to 50. */
function clampCount(raw: unknown): number {
  return Math.min(50, Math.max(0, Math.floor(Number(raw) || 0)));
}

export interface PublicCta { label: string; url: string; style: 'primary' | 'secondary' }

/** A call to action as the website renders it; undefined without a label or a safe url. */
export function mapCta(raw: unknown, lang: string): PublicCta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const label = pickText(str(r['label']).trim(), r['labelI18n'] as I18nString | undefined, lang).trim();
  const url = safeSiteUrl(r['url']);
  if (!label || !url) return undefined;
  return { label, url, style: r['style'] === 'secondary' ? 'secondary' : 'primary' };
}

/**
 * One tile as the website draws it. `icon` is the bare icon name, `iconSrc` its svg in the icon
 * collection (`''` without a usable name); `linkLabel` is the text at the foot of a linked card.
 */
export interface PublicTile {
  value: string; icon: string; iconSrc: string; title: string; text: string; url: string; linkLabel: string;
  tone: 'primary' | 'secondary';
  /** variant 'image': the picture on imgix ('' without one) and how it fits the card */
  imageSrc: string; imageFit: 'cover' | 'contain';
  /** checked css hex background of the card ('' = the default card); its text is then drawn white */
  color: string;
}

export type PublicTileVariant = 'stat' | 'card' | 'image';

/** The tiles variant as the website knows it; anything unknown is 'stat' (the historical default). */
export function mapTileVariant(raw: unknown): PublicTileVariant {
  return raw === 'card' || raw === 'image' ? raw : 'stat';
}

/** A stored image path (or https url) as the imgix url of an image tile; '' for anything else. */
export function tileImageSrc(raw: unknown, fit: 'cover' | 'contain'): string {
  const path = str(raw).trim();
  if (!path) return '';
  const params = fit === 'contain' ? 'w=640&h=480&fit=max&auto=format,compress' : 'w=640&h=480&fit=crop&auto=format,compress';
  if (/^https:\/\//.test(path)) return `${path}${path.includes('?') ? '&' : '?'}${params}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9/_. -]*$/.test(path) || path.includes('..')) return '';
  return `${IMGIX_BASE}/${path.split('/').map(encodeURIComponent).join('/')}?${params}`;
}

/** Icon names of the icon collection: letters, digits, `-` and `_` (e.g. `rowing_2x_side_front`). */
const ICON_NAME = /^[a-z0-9_-]+$/i;

export function mapTiles(items: unknown, variant: PublicTileVariant, lang: string): PublicTile[] {
  if (!Array.isArray(items)) return [];
  const out: PublicTile[] = [];
  for (const raw of items as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object') continue;
    const value = str(raw['value']).trim();
    const title = pickText(str(raw['title']).trim(), raw['titleI18n'] as I18nString | undefined, lang).trim();
    if (variant === 'stat' ? !value : !title) continue;
    const text = pickText(str(raw['text']).trim(), raw['textI18n'] as I18nString | undefined, lang).trim();
    const rawIcon = str(raw['icon']).trim();
    const icon = ICON_NAME.test(rawIcon) ? rawIcon : '';
    const url = safeSiteUrl(raw['url']);
    const imageFit = raw['imageFit'] === 'contain' ? 'contain' : 'cover';
    out.push({
      value, title, text, icon, url,
      iconSrc: icon ? `${IMGIX_BASE}/logo/icons/${icon}.svg` : '',
      linkLabel: url ? pickText(str(raw['linkLabel']).trim(), raw['linkLabelI18n'] as I18nString | undefined, lang).trim() : '',
      tone: raw['tone'] === 'secondary' ? 'secondary' : 'primary',
      imageSrc: variant === 'image' ? tileImageSrc(raw['imageUrl'], imageFit) : '',
      imageFit,
      color: variant === 'stat' ? '' : tileColor(raw['color']),
    });
  }
  return out;
}

const TILE_HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** A tile background that may go into a style attribute; '' for anything else. */
function tileColor(value: unknown): string {
  return typeof value === 'string' && TILE_HEX.test(value.trim()) ? value.trim() : '';
}

/** ColorIonic (shared-models) by index; the website templates colour primary and secondary, the rest stays neutral. */
const IONIC_COLORS = ['primary', 'secondary', 'tertiary', 'success', 'warning', 'danger', 'light', 'medium', 'dark', 'white'] as const;

/** The section colour (`SectionModel.color`, a ColorIonic index) as its name; default primary. */
export function mapAccent(color: unknown): string {
  return typeof color === 'number' && Number.isInteger(color) ? IONIC_COLORS[color] ?? 'primary' : 'primary';
}

/** Mirrors `tilesColumns` (cms-section-util): 1–4, default 3. */
function mapTilesColumns(columns: unknown): number {
  const cols = Math.round(typeof columns === 'number' ? columns : 3);
  return Number.isFinite(cols) ? Math.min(6, Math.max(1, cols)) : 3;
}

/**
 * The collapsed logo strip of a tiles section (TilesConfig.collapse): the picture (shown whole), its safe link and
 * alt text; undefined when there is none or its picture is unusable — the tiles then show as always.
 */
export function mapTilesCollapse(raw: unknown): { imageSrc: string; url: string; label: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  const imageSrc = tileImageSrc(c['imageUrl'], 'contain');
  if (!imageSrc) return undefined;
  return { imageSrc, url: safeSiteUrl(c['url']), label: str(c['label']).trim().slice(0, 100) };
}

function i18nOf(props: Record<string, unknown>, key: string, plainKey: string, lang: string): string {
  return pickText(str(props[plainKey]), props[key] as I18nString | undefined, lang);
}

/**
 * The section's intro, split by where it is shown: `kicker` above the title (the former «Überzeile»), `intro` below
 * title and subtitle (the default). A section stored before the intro took over the Überzeile still carries it as
 * `properties.kicker` / `kickerI18n` (hero, article, events, news); until the migration has run that text is used,
 * above the title.
 */
export function mapIntro(s: SectionDoc, props: Record<string, unknown>, lang: string): { kicker: string; intro: string } {
  const intro = pickText(s.intro, props['introI18n'] as I18nString | undefined, lang);
  if (intro.trim()) return s.introPosition === 'above' ? { kicker: intro, intro: '' } : { kicker: '', intro };
  // a tiles kicker is not a legacy Überzeile: migrate-tiles-section-fields.mjs turns it into the subtitle
  if (s.type === 'tiles') return { kicker: '', intro: '' };
  return { kicker: i18nOf(props, 'kickerI18n', 'kicker', lang), intro: '' };
}

export interface StoredImage { url?: string; altText?: string; label?: string; overlay?: string; credit?: string }

/** The caption and height settings of a section's `properties.imageStyle`. */
export type StoredImageStyle = Pick<ImageStyle, 'captionPosition' | 'captionSize' | 'captionStyle' | 'captionAlign' | 'height'>;

/** Where the website draws a caption; '' when there is none. Same values as the app's CaptionPosition. */
export type PublicCaptionPosition = '' | 'top' | 'bottom' | 'top-overlay' | 'middle-overlay' | 'bottom-overlay';

/** The caption's font, already checked: safe to put into a style attribute. */
export interface PublicCaptionCss { fontSize: string; fontStyle: 'normal' | 'italic'; fontWeight: 'normal' | '600'; textAlign: 'left' | 'center' | 'right' }

/** An image as the website receives it; `caption` is '' when nothing is shown. */
export interface PublicImage { url: string; alt: string; caption: string; captionPosition: PublicCaptionPosition; captionCss: PublicCaptionCss }

const CAPTION_POSITIONS: PublicCaptionPosition[] = ['top', 'bottom', 'top-overlay', 'middle-overlay', 'bottom-overlay'];
const DEFAULT_CAPTION_SIZE = '0.8rem';

/**
 * The caption font of a section, mirroring the app's getCaptionCss. captionSize is free text in the
 * editor and ends up in a style attribute, so only a plain length (e.g. 1rem, 14px, 90%) passes.
 */
export function captionCss(style: StoredImageStyle | undefined): PublicCaptionCss {
  const size = style?.captionSize?.trim() ?? '';
  const captionStyle = style?.captionStyle ?? 'italic';
  const align = style?.captionAlign;
  return {
    fontSize: /^\d{1,3}(\.\d{1,3})?(rem|em|px|%)$/.test(size) ? size : DEFAULT_CAPTION_SIZE,
    fontStyle: captionStyle === 'italic' || captionStyle === 'bold-italic' ? 'italic' : 'normal',
    fontWeight: captionStyle === 'bold' || captionStyle === 'bold-italic' ? '600' : 'normal',
    textAlign: align === 'center' || align === 'right' ? align : 'left',
  };
}

/**
 * Maps a stored image to its public form. The caption follows the app's okr-img exactly:
 * nothing when the section's `imageStyle.captionPosition` is 'none' (the default), otherwise
 * buildImageCaption — the image's own Untertitel, else its Quelle, else the `fallbacks` (the
 * article passes its subtitle, then its title). A Quelle next to an Untertitel becomes the
 * second line. The website places it by captionPosition and styles it with captionCss.
 */
export function mapImage(img: StoredImage | undefined, style?: StoredImageStyle, fallbacks: (string | undefined)[] = []): PublicImage | undefined {
  if (!img?.url) return undefined;
  const shown = (style?.captionPosition ?? 'none') !== 'none';
  const parts = shown ? imageCaption(img, fallbacks) : undefined;
  const caption = parts?.text ? [parts.text, parts.source].filter(t => t.length > 0).join('\n') : '';
  const position = CAPTION_POSITIONS.find(p => p === style?.captionPosition) ?? '';
  return {
    url: toImgixUrl(img.url), alt: img.altText ?? img.label ?? '', caption,
    captionPosition: caption ? position : '', captionCss: captionCss(style),
  };
}

export function mapImages(raw: unknown, style: StoredImageStyle | undefined, fallbacks: (string | undefined)[] = []): PublicImage[] {
  return ((raw as StoredImage[] | undefined) ?? [])
    .map(img => mapImage(img, style, fallbacks))
    .filter((i): i is PublicImage => !!i);
}

export interface SectionDoc {
  name?: string;
  type?: string;
  state?: string;
  tenants?: string[];
  title?: string;
  subTitle?: string;
  intro?: string;
  introPosition?: 'above' | 'below';
  color?: number;
  content?: { htmlContent?: string; position?: number; colSize?: number };
  properties?: Record<string, unknown> & {
    titleI18n?: I18nString;
    subTitleI18n?: I18nString;
    contentI18n?: I18nString;
  };
  isArchived?: boolean;
}

export type SanitizeFn = (html: string) => string;

export type ArticleImagePosition = 'none' | 'top' | 'bottom' | 'left' | 'right';

// Mirrors ViewPosition (shared-models) and the app's ArticleSectionComponent only for articles without
// `imageLayout` (spec 1.154 §5): several images render on top, a single one at content.position, and left/right use
// content.colSize (of 12, default 6) as the image column width. An `imageLayout` (grid layouts, images below the
// text) is not rendered on the published website yet.
const VIEW_POSITIONS: ArticleImagePosition[] = ['none', 'top', 'bottom', 'left', 'right'];

export function articleImageLayout(
  imageCount: number,
  position: number | undefined,
  colSize: number | undefined,
): { imagePosition: ArticleImagePosition; imageColSize: number } {
  const size = typeof colSize === 'number' && colSize >= 1 && colSize <= 11 ? colSize : 6;
  if (imageCount === 0) return { imagePosition: 'none', imageColSize: size };
  if (imageCount > 1) return { imagePosition: 'top', imageColSize: size };
  return { imagePosition: VIEW_POSITIONS[position ?? 0] ?? 'none', imageColSize: size };
}

export interface WebSlideshow {
  effect: 'fade' | 'slide' | 'zoom' | 'kenburns';
  autoplay: boolean;
  /** seconds per image */
  interval: number;
  /** seconds per transition */
  duration: number;
  /** wide, cropped picture urls (2.67 : 1), one per image */
  slides: { url: string; alt: string }[];
}

const clampNum = (v: unknown, min: number, max: number, fallback: number): number =>
  Math.min(max, Math.max(min, typeof v === 'number' && Number.isFinite(v) ? v : fallback));

/**
 * The article's self-running slideshow for the website (mirrors `resolveSlideshow` + `slideshowImageUrl` in
 * `@okr/cms-section-util`): only with two or more images, the carousel layout ('slider' or none) and an effect
 * other than 'none'. `undefined` keeps the swipe slider.
 */
export function mapSlideshow(raw: unknown, imageLayout: unknown, images: unknown): WebSlideshow | undefined {
  const cfg = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(images) ? images as Record<string, unknown>[] : [];
  if (!raw || list.length < 2) return undefined;
  if (imageLayout !== undefined && imageLayout !== 'slider') return undefined;
  const effect = cfg['effect'];
  if (typeof effect !== 'string' || effect === 'none' || !(SLIDESHOW_EFFECTS as readonly string[]).includes(effect)) return undefined;
  const slides = list
    .map((img) => ({ url: slideshowSrc(img['url']), alt: str(img['altText']).slice(0, 200) }))
    .filter((slide) => slide.url !== '');
  if (slides.length < 2) return undefined;
  return {
    effect: effect as WebSlideshow['effect'],
    autoplay: cfg['autoplay'] !== false,
    interval: clampNum(cfg['interval'], 1, 30, 3),
    duration: clampNum(cfg['duration'], 0.2, 5, 1),
    slides,
  };
}

function slideshowSrc(raw: unknown): string {
  const path = str(raw).trim();
  if (!path) return '';
  const params = 'w=1600&h=600&fit=crop&auto=format,compress';
  if (/^https:\/\//.test(path)) return `${path}${path.includes('?') ? '&' : '?'}${params}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9/_. -]*$/.test(path) || path.includes('..')) return '';
  return `${IMGIX_BASE}/${path.split('/').map(encodeURIComponent).join('/')}?${params}`;
}

/**
 * The fixed image height of an article in px, from `imageStyle.height` (e.g. '300px'), or 0 when the
 * image keeps its natural height ('auto', '%', missing or out of range). The website then draws the
 * image at that height with its natural width, like the app's okr-img.
 */
export function articleImageHeight(style: { height?: string } | undefined): number {
  const match = /^\s*(\d{1,4})\s*px\s*$/.exec(style?.height ?? '');
  const px = match ? Number(match[1]) : 0;
  return px >= 16 && px <= 2000 ? px : 0;
}

// --------------------------------------- FOOTER ----------------------------------------
// Mirrors FooterConfig (shared-models) and the app's FooterSectionComponent. The public JSON carries
// content only — the website styles it — with every url resolved and checked here, because the
// renderer puts them straight into href/src on an unauthenticated page.
const FOOTER_MAX_COLUMNS = 3;
const FOOTER_LOGO_HEIGHTS: Record<string, number> = { small: 32, medium: 48, large: 72 };

export interface PublicFooterItem {
  type: 'title' | 'text' | 'link' | 'icon' | 'logo' | 'button';
  label: string;
  /** '' when the item has no (safe) target */
  url: string;
  /** icon: the svg url; logo: the imgix url; '' otherwise */
  src: string;
  /** logo height in px; 0 otherwise */
  height: number;
}

/** Same rule as isFooterUrl (cms-section-util): https, mailto, tel or an app route. */
function safeFooterUrl(url: unknown): string {
  const u = typeof url === 'string' ? url.trim() : '';
  return /^(https:\/\/|mailto:|tel:|\/(?!\/))/i.test(u) ? u : '';
}

function mapFooterItem(raw: Record<string, unknown>): PublicFooterItem | undefined {
  const label = typeof raw['label'] === 'string' ? raw['label'] : '';
  const url = safeFooterUrl(raw['url']);
  switch (raw['type']) {
    case 'title':
    case 'text':
      return label ? { type: raw['type'], label, url: '', src: '', height: 0 } : undefined;
    case 'link':
      // a link without a safe target still shows its words, as plain text
      return label ? { type: 'link', label, url, src: '', height: 0 } : undefined;
    case 'button':
      // a button without a safe target would lead nowhere: dropped
      return label && url ? { type: 'button', label, url, src: '', height: 0 } : undefined;
    case 'icon': {
      const icon = typeof raw['icon'] === 'string' ? raw['icon'] : '';
      if (!ICON_NAME.test(icon)) return undefined;
      return { type: 'icon', label, url, src: `${IMGIX_BASE}/logo/icons/${icon}.svg`, height: 0 };
    }
    case 'logo': {
      const image = typeof raw['image'] === 'string' ? raw['image'] : '';
      // a storage path (no scheme, no traversal) or an https url
      const isPath = /^[\w][\w\-./ ]*$/.test(image) && !image.includes('..');
      if (!isPath && !/^https:\/\//.test(image)) return undefined;
      const height = FOOTER_LOGO_HEIGHTS[String(raw['height'])] ?? FOOTER_LOGO_HEIGHTS['medium'];
      // png/svg logos keep their transparency: no format=jpg here, unlike toImgixUrl
      const src = isPath ? `${IMGIX_BASE}/${image.split('/').map(encodeURIComponent).join('/')}?h=${height * 2}&auto=format,compress` : image;
      return { type: 'logo', label, url, src, height };
    }
    default:
      return undefined;
  }
}

/** The public form of a footer section's properties (only the visible columns). */
export interface PublicFooterLink { label: string; url: string; external: boolean; /** svg url of the icon, '' = none */ src: string }

export interface PublicFooter {
  columnCount: number;
  columns: { items: PublicFooterItem[] }[];
  bottomLine: string;
  /** checked hex background, '' = the template's */
  background: string;
  /** the background is dark: white text */
  dark: boolean;
  social: PublicFooterLink[];
  bottomLinks: PublicFooterLink[];
}

const FOOTER_HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** relative luminance below 0.5 (same rule as isDarkColor in cms-section-util) */
function isDarkHex(hex: string): boolean {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

function mapFooterLinks(raw: unknown): PublicFooterLink[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicFooterLink[] = [];
  for (const l of raw as Record<string, unknown>[]) {
    const url = safeFooterUrl(l?.['url']);
    if (!url) continue;
    const label = typeof l['label'] === 'string' ? l['label'].trim().slice(0, 100) : '';
    const icon = typeof l['icon'] === 'string' && ICON_NAME.test(l['icon']) ? l['icon'] : '';
    if (!label && !icon) continue;
    out.push({ label, url, external: /^https:\/\//i.test(url), src: icon ? `${IMGIX_BASE}/logo/icons/${icon}.svg` : '' });
  }
  return out;
}

export function mapFooter(props: Record<string, unknown>): PublicFooter {
  const rawCount = props['columnCount'];
  const columnCount = Number.isInteger(rawCount) ? Math.min(Math.max(rawCount as number, 1), FOOTER_MAX_COLUMNS) : FOOTER_MAX_COLUMNS;
  const rawColumns = Array.isArray(props['columns']) ? props['columns'] as { items?: unknown }[] : [];
  const columns = Array.from({ length: columnCount }, (_, c) => {
    const items = Array.isArray(rawColumns[c]?.items) ? rawColumns[c].items as Record<string, unknown>[] : [];
    return { items: items.map(mapFooterItem).filter((i): i is PublicFooterItem => !!i) };
  });
  const showBottomLine = props['showBottomLine'] !== false;
  const bottomLine = showBottomLine && typeof props['bottomLine'] === 'string' ? props['bottomLine'] : '';
  const rawBg = typeof props['background'] === 'string' ? props['background'].trim() : '';
  const background = FOOTER_HEX.test(rawBg) ? rawBg : '';
  return {
    columnCount, columns, bottomLine, background, dark: !!background && isDarkHex(background),
    social: mapFooterLinks(props['social']), bottomLinks: mapFooterLinks(props['bottomLinks']),
  };
}

/**
 * A form section for the static website: only what it needs to load the form through the public
 * `getFormDefinition` callable and to name the section in `submitForm`. Everything else on the
 * section stays on the server — the board e-mail addresses, the responsibility, the implicit values
 * (`submitForm` reads them from the verified section itself) and the acceptance overrides
 * (`getFormDefinition` applies them for this `sectionId`).
 */
export function mapFormSection(sectionId: string, title: string, props: Record<string, unknown>): {
  type: 'form'; title: string; sectionId: string; formKey: string;
} {
  const formKey = typeof props['formKey'] === 'string' ? props['formKey'] : '';
  return { type: 'form', title, sectionId, formKey };
}

/**
 * An address safe to show and to put behind `mailto:` — local@domain.tld, with no whitespace, quotes,
 * angle brackets, colon, slash or backslash (so never `javascript:` or a second header).
 */
export function isPlainEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254
    && /^[^\s@<>"'`:/\\?&#=]+@[^\s@<>"'`:/\\?&#=]+\.[^\s@<>"'`:/\\?&#=.]+$/.test(value);
}

/**
 * @param people people source key (`peopleSourceKey`) → its public persons: the members of a group
 *   (`resolveGroupPeople`, §13) or the holders of the roles (`resolveRolePeople`, §13.1) of a people
 *   section of type 'group' / 'responsibility'; a source missing from the map renders no one.
 */
const HERO_HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i; // as the hero suite (overlay.color, gradient)

/**
 * The band colours of a hero without image (HeroConfig.gradient). Only two checked hex colours reach the
 * page (they end up in a style attribute); undefined when not both are valid, and the website's default
 * (primary / secondary) applies.
 */
export function mapHeroGradient(value: unknown): { from: string; to: string } | undefined {
  const g = value as { from?: unknown; to?: unknown } | undefined;
  if (!g || typeof g.from !== 'string' || typeof g.to !== 'string') return undefined;
  if (!HERO_HEX.test(g.from) || !HERO_HEX.test(g.to)) return undefined;
  return { from: g.from, to: g.to };
}

export function mapSection(
  id: string, s: SectionDoc, nestedSections: Map<string, SectionDoc>, sanitize: SanitizeFn, lang = 'de',
  people?: ReadonlyMap<string, PublicPerson[]>,
  /** the cards of the public groups (`groupTileItems`), for a tiles section with source 'groups' */
  groupTiles: PublicTile[] = [],
): unknown {
  const type = s.type ?? 'article';
  const props = (s.properties ?? {}) as Record<string, unknown>;
  const name = slugName(s.name);
  const title = pickText(s.title, props['titleI18n'] as I18nString | undefined, lang);
  const subTitle = pickText(s.subTitle, props['subTitleI18n'] as I18nString | undefined, lang);
  const articleHtml = sanitize(pickText(s.content?.htmlContent, props['contentI18n'] as I18nString | undefined, lang));
  const { kicker, intro } = mapIntro(s, props, lang);
  const imageStyle = props['imageStyle'] as StoredImageStyle | undefined;

  switch (type) {
    case 'hero': {
      // the background never carries a caption (the app draws it without one, too)
      const heroImg = mapImage(props['hero'] as StoredImage | undefined);
      const logoImg = mapImage(props['logo'] as StoredImage | undefined);
      const ctas = (Array.isArray(props['ctas']) ? props['ctas'] : [])
        .map(c => mapCta(c, lang)).filter((c): c is PublicCta => !!c).slice(0, 2);
      return { type: 'hero', name, title, subTitle, kicker, intro, content: articleHtml, background: heroImg, logo: logoImg, ctas, gradient: mapHeroGradient(props['gradient']) };
    }

    case 'table': {
      const body = ((props['data'] as { body?: string[] } | undefined)?.body ?? []);
      const rows: { label: string; value: string }[] = [];
      for (let i = 0; i + 1 < body.length; i += 2) {
        rows.push({ label: body[i], value: body[i + 1] });
      }
      return { type: 'table', name, title, subTitle, rows };
    }

    case 'album': {
      const images = mapImages(props['images'], imageStyle);
      return { type: 'album', name, title, subTitle, images };
    }

    case 'button': {
      const style = (props['style'] as { label?: string; color?: string } | undefined) ?? {};
      const action = (props['action'] as { url?: string } | undefined) ?? {};
      return {
        type: 'button',
        name,
        title,
        label: style.label ?? title,
        url: safeSiteUrl(action.url),
        color: style.color ?? 'primary',
      };
    }

    case 'iframe': {
      return {
        type: 'iframe',
        name,
        title,
        // the stored free-form css `style` is not published: the website uses its own frame style
        url: safeEmbedUrl(props['url']),
      };
    }

    case 'video': {
      const raw = (props['url'] as string | undefined) ?? '';
      const base = (props['baseUrl'] as string | undefined) ?? 'https://www.youtube.com/embed/';
      const url = safeEmbedUrl(youtubeNoCookie(/^https?:\/\//.test(raw) ? raw : (raw ? base + raw : '')));
      return { type: 'video', name, title, url };
    }

    case 'map': {
      // one marker at the centre, loaded only after a click (spec 1.165 §10.2, §12)
      const lat = Number(props['centerLatitude']);
      const lng = Number(props['centerLongitude']);
      const hasPosition = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
        && typeof props['centerLatitude'] !== 'string' && typeof props['centerLongitude'] !== 'string';
      const z = Math.round(Number(props['zoom']));
      const zoom = Number.isFinite(z) && z > 0 ? Math.min(19, Math.max(1, z)) : 16;
      return { type: 'map', name, title, kicker, intro, label: subTitle, hasPosition, lat: hasPosition ? lat : 0, lng: hasPosition ? lng : 0, zoom };
    }

    case 'people': {
      // group / responsibility: the persons resolved at read time (spec 1.153 §13, §13.1), never the
      // stored list. Personal email never: it has the `registered` floor. The only address ever emitted
      // is a role's public alias (resolveRolePeople), and only when the section's info shows email.
      if (props['type'] === 'group' || props['type'] === 'responsibility') {
        const source = peopleSourceOf(s);
        const excluded = new Set(peopleExcludedKeys(s));
        // members the section hides (group only) are dropped here: the group's list is shared by its sections
        const resolved = ((source ? people?.get(peopleSourceKey(source)) : undefined) ?? []).filter((p) => !excluded.has(p.key));
        const info = (props['avatar'] as { info?: unknown } | undefined)?.info;
        const showEmail = props['type'] === 'responsibility'
          && Array.isArray(info) && (info.includes('email') || info.includes('emailLink'));
        // the template shows the address as a mailto: link when the info asks for one, else as text
        const emailLink = showEmail && Array.isArray(info) && info.includes('emailLink');
        const avatarCfg = (props['avatar'] ?? {}) as PeoplePhotoConfig;
        let photoIndex = 0;
        const persons = resolved.map((p): PublicPerson => {
          const out: PublicPerson = { key: p.key, firstName: p.firstName, lastName: p.lastName, label: p.label };
          if (p.showImage !== undefined) out.showImage = p.showImage;
          // the avatar photo, styled as the app's people section — never when the person's images are not public
          if (p.showImage === true && typeof p.image === 'string' && p.image) {
            const bg = peoplePhotoBg(avatarCfg, photoIndex++);
            out.image = `${IMGIX_BASE}/${p.image.replace(/^\/+/, '')}?${peoplePhotoParams(avatarCfg)}`;
            if (bg) out.bg = bg;
          }
          if (showEmail && isPlainEmail(p.email)) out.email = p.email;
          return out;
        });
        // photo cards as soon as one person has a photo (the others get an initials tile)
        const withPhotos = persons.some((p) => !!p.image);
        return { type: 'people', name, title, subTitle, persons, ...(withPhotos ? { withPhotos: true } : {}), ...(emailLink ? { emailLink: true } : {}) };
      }
      const persons = ((props['persons'] as { key?: string; name1?: string; name2?: string; label?: string }[] | undefined) ?? [])
        .map(p => ({
          key: p.key ?? '',
          firstName: p.name1 ?? '',
          lastName: p.name2 ?? '',
          label: p.label ?? '',
        }));
      return { type: 'people', name, title, subTitle, persons };
    }

    case 'accordion': {
      const items = ((props['items'] as { key?: string; label?: string }[] | undefined) ?? [])
        .map(it => {
          const nested = it.key ? nestedSections.get(it.key) : undefined;
          const nestedProps = (nested?.properties ?? {}) as { contentI18n?: I18nString };
          const content = nested
            ? sanitize(pickText(nested.content?.htmlContent, nestedProps.contentI18n, lang))
            : '';
          return { label: it.label ?? '', content };
        });
      return { type: 'accordion', name, title, subTitle, items };
    }

    case 'footer':
      return { name, type: 'footer', title, subTitle, ...mapFooter(props) };

    case 'form':
      return { name, ...mapFormSection(id, title, props) };

    case 'tiles': {
      // source 'groups': one image card per public group, the section's link label on every card
      const fromGroups = props['source'] === 'groups';
      const variant = fromGroups ? 'image' : mapTileVariant(props['variant']);
      const groupLinkLabel = str(props['linkLabel']).trim().slice(0, 40);
      const items = fromGroups
        ? groupTiles.map((t) => ({ ...t, linkLabel: groupLinkLabel }))
        : mapTiles(props['items'], variant, lang);
      // the subtitle is drawn as the line above the title, in the section colour (`accent`)
      return {
        type: 'tiles', name, title, subTitle, kicker, intro,
        accent: mapAccent(s.color),
        variant,
        columns: mapTilesColumns(props['columns']),
        layout: props['layout'] === 'list' ? 'list' : 'grid',
        collapse: mapTilesCollapse(props['collapse']),
        items,
        // once one card has an icon every card keeps the icon slot, so the titles of a row line up
        hasIcons: variant === 'card' && items.some(i => !!i.iconSrc),
      };
    }

    case 'events':
      return {
        type: 'events', name, title, kicker, intro, maxItems: clampCount(props['maxEvents']), moreUrl: safeSiteUrl(props['moreUrl']), calendar: mapCalendarKey(s.name),
        // the public groups (name, colour, page): the list labels an event whose category is a group's name (la21staefa)
        groupLabels: groupTiles.map((t) => ({ name: t.title, color: t.color, url: t.url })),
      };

    case 'course': {
      // the audience is the comma list the course widget reads (data-audience); unknown kinds are dropped
      const audience = (Array.isArray(props['audience']) ? props['audience'] : [])
        .filter((k): k is (typeof APPLICATION_KIND_VALUES)[number] => APPLICATION_KIND_VALUES.includes(k));
      const emptyText = pickText(str(props['emptyText']), props['emptyTextI18n'] as I18nString | undefined, lang);
      return { type: 'course', name, title, subTitle, audience: audience.join(','), emptyText };
    }

    case 'news':
      return { type: 'news', name, title, kicker, intro, maxItems: clampCount(props['maxItems']), moreUrl: safeSiteUrl(props['moreUrl']), tag: str(props['tag']).trim().slice(0, 80) };

    case 'article':
    default: {
      const images = mapImages(props['images'], imageStyle, [subTitle, title]);
      const content = s.content as { position?: number; colSize?: number } | undefined;
      const layout = articleImageLayout(images.length, content?.position, content?.colSize);
      // A position of 'none' hides the images in the app as well.
      return {
        type: 'article', name, title, subTitle, kicker, intro, content: articleHtml,
        cta: mapCta(props['cta'], lang),
        emphasis: props['emphasis'] === 'banner' ? 'banner' : 'none',
        images: layout.imagePosition === 'none' ? [] : images,
        ...layout,
        imageHeight: articleImageHeight(imageStyle),
        // a slideshow replaces the swipe slider and carries title and subtitle on its images (la21staefa header)
        slideshow: layout.imagePosition === 'none' ? undefined : mapSlideshow(props['slideshow'], props['imageLayout'], props['images']),
      };
    }
  }
}

/**
 * The calendar an events section lists on the website. The app keeps an events section's calendar
 * in its `name` ('all', 'my' or a calendar key such as a group okey); the website only knows public
 * events, so 'all'/'my'/'public'/'' mean «every public event» (''). Anything that is not a plain key
 * is dropped rather than passed to the browser (spec 1.165 EV3).
 */
export function mapCalendarKey(raw: unknown): string {
  const key = typeof raw === 'string' ? raw.trim() : '';
  if (['', 'all', 'my', 'public'].includes(key)) return '';
  return /^[A-Za-z0-9_.-]{1,80}$/.test(key) ? key : '';
}

/** A YouTube embed url served from youtube-nocookie.com (no tracking cookies before play, spec 1.165 §12). */
export function youtubeNoCookie(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?youtube\.com\/embed\//, 'https://www.youtube-nocookie.com/embed/');
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
