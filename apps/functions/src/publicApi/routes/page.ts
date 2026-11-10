import { Request, Response } from 'express';
import corsLib from 'cors';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';

import type { DocumentLink, ImageConfig, ImageStyle } from '@okr/shared-models';
import { DocumentCollection, FolderCollection } from '@okr/shared-models';
import { buildImageCaption } from '@okr/shared-util-core';
import { learningTabOf, parseTopics, type LearningTab, type PublicLearningItem, type PublicLearningSection } from '@okr/content-learning-util';

import { isPublishedSection, setCacheHeaders } from '../utils';
import { getHtmlSanitizer } from '../sanitize';
import { IMGIX_PRIVATE_HOST, signImgixUrl } from '../../_storage/imgix-sign';
import { albumFolderKeyOfPath, isSafeDocId, MP4_PARAMS, POSTER_PARAMS, windowExpiry } from '../../video/video-sign.util';

/** Signs learning-room videos (private bucket) on the public page; mounted on `publicApi` in index.ts. */
export const imgixPrivateToken = defineSecret('IMGIX_PRIVATE_TOKEN');

const IMGIX_BASE = 'https://bkaiser.imgix.net';

/** Path prefix of the page route (mounted under the public API base). */
export const PAGES_PATH = '/public/api/v1/pages/';

/** A read of the page route (GET or its preflight); these get the open `pageCors` instead of the origin allowlist. */
export function isPublicPageRead(path: string, method: string): boolean {
  return path.startsWith(PAGES_PATH) && (method === 'GET' || method === 'OPTIONS' || method === 'HEAD');
}

/**
 * Route-level CORS for `GET /pages/:pageKey`: ANY origin, no credentials. The anonymous learning
 * room view (/public/<pageKey>) runs in every tenant app, each on its own origin, and only reads
 * published content — an origin allowlist protects nothing there (CORS is no access control; a
 * server-side caller sends no Origin at all) and would break every tenant app not listed. The
 * tenant allowlist middleware in index.ts still validates `?tenantId=` for this route.
 */
export const pageCors = corsLib({
  origin: '*',
  methods: ['GET', 'OPTIONS'],
  credentials: false,
  maxAge: 3600,
});

function toImgixUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${IMGIX_BASE}/${path}?auto=compress,format=jpg`;
}

type I18nString = Record<string, string>;

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

function mapTiles(items: unknown, variant: 'stat' | 'card', lang: string): PublicTile[] {
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

interface StoredImage { url?: string; altText?: string; label?: string; overlay?: string; credit?: string }

/** The caption and height settings of a section's `properties.imageStyle`. */
type StoredImageStyle = Pick<ImageStyle, 'captionPosition' | 'captionSize' | 'captionStyle' | 'captionAlign' | 'height'>;

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
  const parts = shown ? buildImageCaption(img as ImageConfig, fallbacks) : undefined;
  const caption = parts?.text ? [parts.text, parts.source].filter(t => t.length > 0).join('\n') : '';
  const position = CAPTION_POSITIONS.find(p => p === style?.captionPosition) ?? '';
  return {
    url: toImgixUrl(img.url), alt: img.altText ?? img.label ?? '', caption,
    captionPosition: caption ? position : '', captionCss: captionCss(style),
  };
}

function mapImages(raw: unknown, style: StoredImageStyle | undefined, fallbacks: (string | undefined)[] = []): PublicImage[] {
  return ((raw as StoredImage[] | undefined) ?? [])
    .map(img => mapImage(img, style, fallbacks))
    .filter((i): i is PublicImage => !!i);
}

interface SectionDoc {
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

type SanitizeFn = (html: string) => string;

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

export function mapSection(id: string, s: SectionDoc, nestedSections: Map<string, SectionDoc>, sanitize: SanitizeFn, lang = 'de'): unknown {
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

// --------------------------------------- LEARNING ----------------------------------------
// Spec 1.115 part 2 §5.5: a learning room is public only when its PAGE is published
// (`isPrivate === false`, strict). Otherwise the section is a locked shell. Never exposed: the
// folder key, author names, ratings, comments, curators, attachments (attachment docs may live
// outside the room folder and would leak private files).

/** Whether a page doc is published to the public website. Anything but an explicit `false` is private. */
export function isPublishedPage(page: Record<string, unknown> | undefined): boolean {
  return page?.['isPrivate'] === false;
}

/**
 * A room's material is served only from its OWN learning page: the page is published, has type
 * 'learning', and the section key equals the page key (rooms are created that way). Without this,
 * a privileged user could list a room's section on any public page and bypass the contentAdmin-only
 * publication.
 */
export function mayServeRoom(page: Record<string, unknown> | undefined, pageKey: string, sectionKey: string): boolean {
  return isPublishedPage(page) && page?.['type'] === 'learning' && sectionKey === pageKey;
}

export interface LearningRawDoc { key: string; data: Record<string, unknown> }

export interface LearningSectionOptions {
  published: boolean;
  tenantId: string;
  /** Candidate documents (the folder query); tenant, archive and folder are re-checked here. */
  docs: LearningRawDoc[];
  sanitize: SanitizeFn;
  /** Signed private-imgix mp4 + poster URLs for a validated album-video path. */
  signVideo: (path: string) => { url: string; posterUrl: string };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function httpsLinks(raw: unknown): DocumentLink[] {
  if (!Array.isArray(raw)) return [];
  const out: DocumentLink[] = [];
  for (const l of raw as { title?: unknown; url?: unknown }[]) {
    const url = str(l?.url).trim();
    try {
      if (new URL(url).protocol !== 'https:') continue;
    } catch {
      continue;
    }
    out.push({ title: str(l?.title), url });
  }
  return out;
}

/** A storage path of this tenant (`tenant/<tid>/…`, no empty, `.` or `..` segment). fullPath is author-editable. */
function isTenantPath(path: string, tenantId: string): boolean {
  return path.startsWith(`tenant/${tenantId}/`) && !path.split('/').some(seg => seg === '' || seg === '.' || seg === '..');
}

const FIREBASE_DOWNLOAD_PREFIX = 'https://firebasestorage.googleapis.com/';

/**
 * Public URL of a default-bucket document, or '' (item skipped). Images go through imgix by their
 * tenant path; other files use their Firebase download URL, else the imgix path. Both fields are
 * author-editable, so nothing outside the tenant's storage or the Firebase download host passes.
 */
function publicFileUrl(data: Record<string, unknown>, isImage: boolean, tenantId: string): string {
  const path = str(data['fullPath']);
  const validPath = isTenantPath(path, tenantId);
  if (isImage) return validPath ? toImgixUrl(path) : '';
  const url = str(data['url']);
  if (url.startsWith(FIREBASE_DOWNLOAD_PREFIX)) return url;
  return validPath ? `${IMGIX_BASE}/${path.split('/').map(encodeURIComponent).join('/')}` : '';
}

const LEARNING_TABS: LearningTab[] = ['files', 'videos', 'images'];

/** The configured start tab, or 'files' for anything unknown. */
export function learningDefaultTab(value: unknown): LearningTab {
  return LEARNING_TABS.includes(value as LearningTab) ? value as LearningTab : 'files';
}

export function buildLearningSection(s: SectionDoc, o: LearningSectionOptions, lang = 'de'): PublicLearningSection & { name: string } {
  const props = (s.properties ?? {}) as Record<string, unknown>;
  const name = slugName(s.name);
  const title = pickText(s.title, props['titleI18n'] as I18nString | undefined, lang);
  const subTitle = pickText(s.subTitle, props['subTitleI18n'] as I18nString | undefined, lang);
  const folder = str(props['folder']);
  const defaultTab = learningDefaultTab(props['defaultTab']);
  if (!o.published || !folder) return { type: 'learning', name, title, subTitle, locked: true, defaultTab, topics: [], items: [] };

  const items: PublicLearningItem[] = [];
  for (const { key, data } of o.docs) {
    if (data['isArchived'] === true) continue;
    if (!((data['tenants'] as unknown[] | undefined) ?? []).includes(o.tenantId)) continue;
    // Only the doc's FIRST folder counts: firestore.rules check `membersMayUpload` on folderKeys[0]
    // alone, so a member could add a published room as a second folder key and inject a doc into
    // its public output. Room uploads always put the room folder first.
    const folderKeys = (data['folderKeys'] as unknown[] | undefined) ?? [];
    if (folderKeys[0] !== folder) continue;
    const tab = learningTabOf(str(data['mimeType']));
    const item: PublicLearningItem = {
      key,
      tab,
      title: str(data['title']),
      tags: parseTopics(str(data['tags'])),
      notes: o.sanitize(str(data['notes'])),
      links: httpsLinks(data['links']),
      url: '',
    };
    if (tab === 'videos') {
      // fullPath is author-editable: only the album-video layout may be signed for the private host.
      const path = str(data['fullPath']);
      // The path must name an album of THIS room folder: never another room's (or a section's) video.
      if (albumFolderKeyOfPath(path, o.tenantId) !== folder) continue;
      // A signing failure (missing secret) drops the video, never the whole page.
      try {
        const signed = o.signVideo(path);
        item.url = signed.url;
        item.posterUrl = signed.posterUrl;
      } catch (err) {
        logger.warn('publicApi learning: could not sign video', { key, err: String(err) });
        continue;
      }
    } else {
      item.url = publicFileUrl(data, tab === 'images', o.tenantId);
      if (!item.url) continue;
    }
    items.push(item);
  }
  items.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  return { type: 'learning', name, title, subTitle, locked: false, defaultTab, topics: parseTopics(str(props['topics'])), items };
}

/**
 * Loads the room's documents (single-field `folderKeys` query, no composite index) and maps the section.
 * Gate: the page must be published AND the room folder must be a live folder of the tenant (as
 * `videoAccessPath` requires) AND the folder must not admit member uploads (`membersMayUpload`):
 * a member's upload would otherwise reach the public site without any curator having seen it.
 * Otherwise the locked shell, and no docs query runs.
 */
export async function loadLearningSection(
  db: Firestore, s: SectionDoc, pagePublished: boolean, tenantId: string, sanitize: SanitizeFn, lang = 'de',
): Promise<PublicLearningSection & { name: string }> {
  const folder = str((s.properties ?? {})['folder']);
  let published = pagePublished && isSafeDocId(folder);
  let docs: LearningRawDoc[] = [];
  if (published) {
    const folderDoc = await db.collection(FolderCollection).doc(folder).get();
    const f = folderDoc.data();
    published = folderDoc.exists && !!f && f['isArchived'] !== true
      && ((f['tenants'] as unknown[] | undefined) ?? []).includes(tenantId)
      && f['membersMayUpload'] !== true;
  }
  if (published) {
    const snap = await db.collection(DocumentCollection).where('folderKeys', 'array-contains', folder).get();
    docs = snap.docs.map(d => ({ key: d.id, data: d.data() }));
  }
  const expires = Math.floor(windowExpiry(Date.now()) / 1000);
  let token: string | undefined;
  const signVideo = (path: string) => {
    token ??= imgixPrivateToken.value();
    return {
      url: signImgixUrl(IMGIX_PRIVATE_HOST, token, path, { ...MP4_PARAMS, expires }),
      posterUrl: signImgixUrl(IMGIX_PRIVATE_HOST, token, path, { ...POSTER_PARAMS, expires }),
    };
  };
  return buildLearningSection(s, { published, tenantId, docs, sanitize, signVideo }, lang);
}

/**
 * The one gate for a section read by key, top-level or nested: such a read never passes a query's
 * filters. The `tenants` check is not redundant with the page's: a page shared across tenants can
 * list section keys that resolve to another tenant's documents.
 */
function isServableSection(section: SectionDoc | undefined, tenantId: string): boolean {
  return !!section && section.isArchived !== true
    && (section.tenants ?? []).includes(tenantId)
    && isPublishedSection(section);
}

export async function pageRouter(req: Request, res: Response): Promise<void> {
  const tenantId = (req.query['tenantId'] as string)?.trim();
  if (!tenantId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing tenantId' } });
    return;
  }

  const pageKey = req.params['pageKey'] as string;
  const lang = normalizeLang(req.query['lang']);

  try {
    const db = getFirestore();

    const pageDoc = await db.collection('pages').doc(pageKey).get();
    if (!pageDoc.exists) {
      res.status(404).json({ error: { code: 'not_found', message: 'Page not found' } });
      return;
    }

    const pageData = pageDoc.data()!;
    if (!pageData['tenants']?.includes(tenantId) || pageData['isArchived'] === true) {
      res.status(404).json({ error: { code: 'not_found', message: 'Page not found' } });
      return;
    }

    const banner = pageData['bannerUrl']
      ? { url: toImgixUrl(pageData['bannerUrl']), alt: pageData['bannerAltText'] ?? '' }
      : undefined;
    const pageEnvelope = {
      title: pageData['title'] ?? '',
      subTitle: pageData['subTitle'] ?? '',
      abstract: pageData['abstract'] ?? '',
      banner,
    };

    const rawKeys: string[] = pageData['sections'] ?? [];
    const sectionKeys = rawKeys.map(k => k.replace('@TID@', tenantId));

    if (sectionKeys.length === 0) {
      setCacheHeaders(res);
      res.json({ ...pageEnvelope, sections: [] });
      return;
    }

    const sectionRefs = sectionKeys.map(k => db.collection('sections').doc(k));
    const sectionDocs = await db.getAll(...sectionRefs);
    const liveSections = sectionDocs
      .filter(d => isServableSection(d.data() as SectionDoc | undefined, tenantId))
      .map(d => ({ id: d.id, doc: d.data() as SectionDoc }));

    const nestedKeys = new Set<string>();
    for (const { doc: s } of liveSections) {
      if (s.type === 'accordion') {
        const items = ((s.properties?.['items'] as { key?: string }[] | undefined) ?? []);
        for (const it of items) {
          if (it.key) nestedKeys.add(it.key.replace('@TID@', tenantId));
        }
      }
    }

    const nestedSections = new Map<string, SectionDoc>();
    if (nestedKeys.size > 0) {
      const nestedRefs = Array.from(nestedKeys).map(k => db.collection('sections').doc(k));
      const nestedDocs = await db.getAll(...nestedRefs);
      for (const d of nestedDocs) {
        if (isServableSection(d.data() as SectionDoc | undefined, tenantId)) {
          nestedSections.set(d.id, d.data() as SectionDoc);
        }
      }
    }

    const sanitize = await getHtmlSanitizer();
    const sections = await Promise.all(liveSections.map(({ id, doc: s }) => (s.type === 'learning'
      ? loadLearningSection(db, s, mayServeRoom(pageData, pageKey, id), tenantId, sanitize, lang)
      : mapSection(id, s, nestedSections, sanitize, lang))));

    setCacheHeaders(res);
    res.json({ ...pageEnvelope, sections });
  } catch (err) {
    logger.error('publicApi /pages error', { tenantId, pageKey, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch page' } });
  }
}
