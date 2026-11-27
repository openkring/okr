import { IFRAME_HEIGHTS, IframeConfig, IframeHeight } from '@okr/shared-models';
import { getSafeEmbedUrl } from '@okr/shared-util-core';

/** The CSS height of each choice; the width is always 100 %. */
export const IFRAME_HEIGHT_CSS: Record<IframeHeight, string> = { S: '300px', M: '400px', L: '600px', full: '80vh' };
/** the pixel heights a legacy `style` is rounded to (`full` has none) */
const HEIGHT_PX: Partial<Record<IframeHeight, number>> = { S: 300, M: 400, L: 600 };

/** What a pasted link or embed code points at: the url and its host, and whether the app may show it (embed allowlist). */
export interface IframeSource {
  url: string;
  host: string;
  allowed: boolean;
}

const SRC_ATTRIBUTE = /<iframe\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

/**
 * The page a pasted text points at, or undefined when it is neither an https link nor an `<iframe src="…">` embed code.
 * A link pasted without its scheme ("www.openstreetmap.org/…") gets `https://`; `&amp;` of an embed code is decoded.
 */
export function parseIframeSource(text: string | undefined): IframeSource | undefined {
  let candidate = (text ?? '').trim();
  if (candidate === '') return undefined;
  const embed = SRC_ATTRIBUTE.exec(candidate);
  if (embed) candidate = (embed[1] ?? embed[2] ?? embed[3] ?? '').trim().replace(/&amp;/g, '&');
  else if (candidate.startsWith('<')) return undefined;
  if (candidate.startsWith('//')) candidate = 'https:' + candidate;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    if (!/^[\w-]+(\.[\w-]+)+(\/|$)/.test(candidate)) return undefined;
    candidate = 'https://' + candidate;
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.hostname === '') return undefined;
  const href = url.toString();
  return { url: href, host: url.hostname.toLowerCase(), allowed: getSafeEmbedUrl(href) !== null };
}

/**
 * The height of an iframe section: the stored choice, else the one nearest to the `height` / `min-height` (px) of a legacy `style`,
 * else M (400px, the old default).
 */
export function iframeHeightOf(config: Partial<IframeConfig> | undefined): IframeHeight {
  const height = config?.height;
  if (height && IFRAME_HEIGHTS.includes(height)) return height;
  const px = legacyHeightPx(config?.style);
  if (px === undefined) return 'M';
  let best: IframeHeight = 'M';
  for (const [choice, value] of Object.entries(HEIGHT_PX) as [IframeHeight, number][]) {
    if (Math.abs(value - px) < Math.abs((HEIGHT_PX[best] ?? 0) - px)) best = choice;
  }
  return best;
}

/** the CSS height of an iframe section */
export function iframeHeightCss(config: Partial<IframeConfig> | undefined): string {
  return IFRAME_HEIGHT_CSS[iframeHeightOf(config)];
}

/** the config as it is stored from now on: url and height, without a legacy `style` */
export function cleanIframeConfig(config: Partial<IframeConfig> | undefined): IframeConfig {
  return { url: config?.url ?? '', height: iframeHeightOf(config) };
}

function legacyHeightPx(style: string | undefined): number | undefined {
  if (!style) return undefined;
  const match = /(?:^|;)\s*(?:min-)?height\s*:\s*(\d+(?:\.\d+)?)px/i.exec(style);
  return match ? Number(match[1]) : undefined;
}
