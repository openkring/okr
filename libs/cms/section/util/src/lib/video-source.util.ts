import { isVideoDocKey, parseVideoLink, videoLink } from '@okr/content-document-util';
import { VIDEO_ASPECT_RATIOS, VideoAspectRatio, VideoConfig } from '@okr/shared-models';

/** The players a video section embeds; YouTube without cookies (as the website does, spec 1.165 §12). */
export const YOUTUBE_EMBED_BASE = 'https://www.youtube-nocookie.com/embed/';
export const VIMEO_EMBED_BASE = 'https://player.vimeo.com/video/';

/** What a video section plays: a YouTube or Vimeo video by its id, or an album video by its document key. */
export type VideoSource =
  | { kind: 'youtube'; id: string }
  | { kind: 'vimeo'; id: string }
  | { kind: 'album'; documentKey: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'];
/** the paths that carry the id as their second segment: /embed/<id>, /shorts/<id>, /live/<id>, /v/<id> */
const YOUTUBE_PATHS = ['embed', 'shorts', 'live', 'v'];
const VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];
const VIMEO_HASH = /^[0-9a-f]{6,20}$/i;

/**
 * The video a pasted text points at, or undefined when none is recognised. Accepts what an editor copies from the address bar or a
 * share button: a YouTube link (watch?v=, youtu.be/, /shorts/, /embed/, /live/), a bare YouTube id, a Vimeo link (a private one with its
 * hash), the app's own album video link (`<origin>/video/<key>`, any of `origins`) or a bare album document key.
 */
export function parseVideoSource(text: string | undefined, origins: readonly string[] = []): VideoSource | undefined {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return undefined;
  if (YOUTUBE_ID.test(trimmed)) return { kind: 'youtube', id: trimmed };
  const albumKey = origins.length > 0 ? parseVideoLink(trimmed, origins) : undefined;
  if (albumKey) return { kind: 'album', documentKey: albumKey };
  if (!/^https?:\/\//i.test(trimmed)) {
    // a link pasted without its scheme ("youtu.be/…", "www.youtube.com/…"); a bare word is an album key
    if (/^[\w.-]+\.[a-z]{2,}\//i.test(trimmed)) return parseVideoSource(`https://${trimmed}`, origins);
    return isVideoDocKey(trimmed) ? { kind: 'album', documentKey: trimmed } : undefined;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter((s) => s !== '');
  if (host === 'youtu.be') return youtube(segments[0]);
  if (YOUTUBE_HOSTS.includes(host)) {
    if (segments[0] === 'watch') return youtube(url.searchParams.get('v') ?? undefined);
    if (YOUTUBE_PATHS.includes(segments[0] ?? '')) return youtube(segments[1]);
    return undefined;
  }
  if (VIMEO_HOSTS.includes(host)) {
    // vimeo.com/<id>, vimeo.com/<id>/<hash>, vimeo.com/channels/<name>/<id>, player.vimeo.com/video/<id>?h=<hash>
    const index = segments.findIndex((s) => /^\d+$/.test(s));
    if (index < 0) return undefined;
    const hash = url.searchParams.get('h') ?? segments[index + 1];
    const id = segments[index] + (hash && VIMEO_HASH.test(hash) ? `?h=${hash}` : '');
    return { kind: 'vimeo', id };
  }
  return undefined;
}

function youtube(id: string | undefined): VideoSource | undefined {
  return id && YOUTUBE_ID.test(id) ? { kind: 'youtube', id } : undefined;
}

/** What a stored section plays; an id under another embed url (legacy `baseUrl`) counts as YouTube when it looks like one. */
export function videoSourceOf(config: Partial<VideoConfig> | undefined): VideoSource | undefined {
  const documentKey = config?.documentKey ?? '';
  if (documentKey !== '') return { kind: 'album', documentKey };
  const id = config?.url ?? '';
  if (id === '') return undefined;
  if ((config?.baseUrl ?? '').includes('vimeo.com')) return { kind: 'vimeo', id };
  return parseVideoSource(id) ?? (YOUTUBE_ID.test(id) ? { kind: 'youtube', id } : undefined);
}

/** `config` playing `source` (undefined: nothing): the fields the readers use, the rest (aspect ratio, clips) kept. */
export function applyVideoSource(config: VideoConfig, source: VideoSource | undefined): VideoConfig {
  switch (source?.kind) {
    case 'youtube': return { ...config, baseUrl: YOUTUBE_EMBED_BASE, url: source.id, documentKey: '' };
    case 'vimeo': return { ...config, baseUrl: VIMEO_EMBED_BASE, url: source.id, documentKey: '' };
    case 'album': return { ...config, url: '', documentKey: source.documentKey };
    default: return { ...config, url: '', documentKey: '' };
  }
}

/** The stored video as a link an editor recognises: what the field shows when a section opens. */
export function videoSourceLink(source: VideoSource | undefined, origin = ''): string {
  switch (source?.kind) {
    case 'youtube': return `https://www.youtube.com/watch?v=${source.id}`;
    case 'vimeo': {
      const [id, query] = source.id.split('?h=');
      return `https://vimeo.com/${id}${query ? `/${query}` : ''}`;
    }
    case 'album': return origin ? videoLink(origin, source.documentKey) : source.documentKey;
    default: return '';
  }
}

/** The stored ratio, '16:9' when absent or unknown. */
export function videoAspectRatioOf(config: Partial<VideoConfig> | undefined): VideoAspectRatio {
  const ratio = config?.aspectRatio;
  return ratio && VIDEO_ASPECT_RATIOS.includes(ratio) ? ratio : '16:9';
}

/** The ratio as a CSS `aspect-ratio` value: '16:9' → '16 / 9'. */
export function videoAspectRatioCss(ratio: VideoAspectRatio | undefined): string {
  const [w, h] = (ratio && VIDEO_ASPECT_RATIOS.includes(ratio) ? ratio : '16:9').split(':');
  return `${w} / ${h}`;
}
