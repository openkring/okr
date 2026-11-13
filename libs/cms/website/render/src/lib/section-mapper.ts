import type { ImageStyle } from '@okr/shared-models';
import { imageCaption } from './image-caption';
import type { PublicPerson } from './group-people';
import { peopleSourceKey, peopleSourceOf } from './people-source';

export const IMGIX_BASE = 'https://bkaiser.imgix.net';

export function toImgixUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${IMGIX_BASE}/${path}?auto=compress,format=jpg`;
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

export interface PublicTile { value: string; icon: string; title: string; text: string; url: string; tone: 'primary' | 'secondary' }

export function mapTiles(items: unknown, variant: 'stat' | 'card', lang: string): PublicTile[] {
  if (!Array.isArray(items)) return [];
  const out: PublicTile[] = [];
  for (const raw of items as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object') continue;
    const value = str(raw['value']).trim();
    const title = pickText(str(raw['title']).trim(), raw['titleI18n'] as I18nString | undefined, lang).trim();
    if (variant === 'stat' ? !value : !title) continue;
    const text = pickText(str(raw['text']).trim(), raw['textI18n'] as I18nString | undefined, lang).trim();
    const icon = str(raw['icon']).trim();
    out.push({
      value, title, text,
      icon: /^[a-z0-9-]+$/i.test(icon) ? icon : '',
      url: safeSiteUrl(raw['url']),
      tone: raw['tone'] === 'secondary' ? 'secondary' : 'primary',
    });
  }
  return out;
}

/** Mirrors `tilesColumns` (cms-section-util): 1–4, default 3. */
function mapTilesColumns(columns: unknown): number {
  const cols = Math.round(typeof columns === 'number' ? columns : 3);
  return Number.isFinite(cols) ? Math.min(4, Math.max(1, cols)) : 3;
}

function i18nOf(props: Record<string, unknown>, key: string, plainKey: string, lang: string): string {
  return pickText(str(props[plainKey]), props[key] as I18nString | undefined, lang);
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

// Mirrors ViewPosition (shared-models) and the app's ArticleSectionComponent: several
// images always render on top, a single one at content.position, and left/right use
// content.colSize (of 12, default 6) as the image column width.
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
  type: 'title' | 'text' | 'link' | 'icon' | 'logo';
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
    case 'icon': {
      const icon = typeof raw['icon'] === 'string' ? raw['icon'] : '';
      if (!/^[a-z0-9-]+$/i.test(icon)) return undefined;
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
export function mapFooter(props: Record<string, unknown>): { columnCount: number; columns: { items: PublicFooterItem[] }[]; bottomLine: string } {
  const rawCount = props['columnCount'];
  const columnCount = Number.isInteger(rawCount) ? Math.min(Math.max(rawCount as number, 1), FOOTER_MAX_COLUMNS) : FOOTER_MAX_COLUMNS;
  const rawColumns = Array.isArray(props['columns']) ? props['columns'] as { items?: unknown }[] : [];
  const columns = Array.from({ length: columnCount }, (_, c) => {
    const items = Array.isArray(rawColumns[c]?.items) ? rawColumns[c].items as Record<string, unknown>[] : [];
    return { items: items.map(mapFooterItem).filter((i): i is PublicFooterItem => !!i) };
  });
  const showBottomLine = props['showBottomLine'] !== false;
  const bottomLine = showBottomLine && typeof props['bottomLine'] === 'string' ? props['bottomLine'] : '';
  return { columnCount, columns, bottomLine };
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
 * @param people people source key (`peopleSourceKey`) → its public persons: the members of a group
 *   (`resolveGroupPeople`, §13) or the holders of the roles (`resolveRolePeople`, §13.1) of a people
 *   section of type 'group' / 'responsibility'; a source missing from the map renders no one.
 */
export function mapSection(
  id: string, s: SectionDoc, nestedSections: Map<string, SectionDoc>, sanitize: SanitizeFn, lang = 'de',
  people?: ReadonlyMap<string, PublicPerson[]>,
): unknown {
  const type = s.type ?? 'article';
  const props = (s.properties ?? {}) as Record<string, unknown>;
  const name = slugName(s.name);
  const title = pickText(s.title, props['titleI18n'] as I18nString | undefined, lang);
  const subTitle = pickText(s.subTitle, props['subTitleI18n'] as I18nString | undefined, lang);
  const articleHtml = sanitize(pickText(s.content?.htmlContent, props['contentI18n'] as I18nString | undefined, lang));
  const kicker = i18nOf(props, 'kickerI18n', 'kicker', lang);
  const imageStyle = props['imageStyle'] as StoredImageStyle | undefined;

  switch (type) {
    case 'hero': {
      const heroImg = mapImage(props['hero'] as StoredImage | undefined, imageStyle);
      const logoImg = mapImage(props['logo'] as StoredImage | undefined);
      const ctas = (Array.isArray(props['ctas']) ? props['ctas'] : [])
        .map(c => mapCta(c, lang)).filter((c): c is PublicCta => !!c).slice(0, 2);
      return { type: 'hero', name, title, subTitle, kicker, content: articleHtml, background: heroImg, logo: logoImg, ctas };
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
      const url = safeEmbedUrl(/^https?:\/\//.test(raw) ? raw : (raw ? base + raw : ''));
      return { type: 'video', name, title, url };
    }

    case 'people': {
      // group / responsibility: the persons resolved at read time (spec 1.153 §13, §13.1), never the
      // stored list. Personal email never: it has the `registered` floor. The only address ever emitted
      // is a role's public alias (resolveRolePeople), and only when the section's info shows email.
      if (props['type'] === 'group' || props['type'] === 'responsibility') {
        const source = peopleSourceOf(s);
        const resolved = (source ? people?.get(peopleSourceKey(source)) : undefined) ?? [];
        const info = (props['avatar'] as { info?: unknown } | undefined)?.info;
        const showEmail = props['type'] === 'responsibility'
          && Array.isArray(info) && (info.includes('email') || info.includes('emailLink'));
        const persons = resolved.map((p): PublicPerson => {
          const out: PublicPerson = { key: p.key, firstName: p.firstName, lastName: p.lastName, label: p.label };
          if (p.showImage !== undefined) out.showImage = p.showImage;
          if (showEmail && p.email) out.email = p.email;
          return out;
        });
        return { type: 'people', name, title, subTitle, persons };
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
      const variant = props['variant'] === 'card' ? 'card' : 'stat';
      return {
        type: 'tiles', name, title, subTitle, kicker,
        lead: i18nOf(props, 'leadI18n', 'lead', lang),
        variant,
        columns: mapTilesColumns(props['columns']),
        linkLabel: i18nOf(props, 'linkLabelI18n', 'linkLabel', lang),
        items: mapTiles(props['items'], variant, lang),
      };
    }

    case 'events':
      return { type: 'events', name, title, kicker, maxItems: clampCount(props['maxEvents']), moreUrl: safeSiteUrl(props['moreUrl']) };

    case 'news':
      return { type: 'news', name, title, kicker, maxItems: clampCount(props['maxItems']), moreUrl: safeSiteUrl(props['moreUrl']) };

    case 'article':
    default: {
      const images = mapImages(props['images'], imageStyle, [subTitle, title]);
      const content = s.content as { position?: number; colSize?: number } | undefined;
      const layout = articleImageLayout(images.length, content?.position, content?.colSize);
      // A position of 'none' hides the images in the app as well.
      return {
        type: 'article', name, title, subTitle, kicker, content: articleHtml,
        cta: mapCta(props['cta'], lang),
        emphasis: props['emphasis'] === 'banner' ? 'banner' : 'none',
        images: layout.imagePosition === 'none' ? [] : images,
        ...layout,
        imageHeight: articleImageHeight(imageStyle),
      };
    }
  }
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
