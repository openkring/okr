// apps/functions/src/email/letter-images.ts
//
// The pictures of a letter (spec 1.176 §9.4): the server fetches each one once, from our image CDN only, and puts it into the
// letter as `data:`. The page that holds the recipient's address loads nothing. A picture that cannot be fetched fails the
// quote or the letters: left out, the letter would have other pages than the priced one.
//
// Privacy: the errors say what went wrong, never which picture (its path may name people).
import { IMGIX_BASE } from '@okr/cms-website-render';

import { decodeEntities } from './html-to-text';
import { chunk } from './mailing-recipients';

/** The most different pictures of one letter. */
export const MAX_LETTER_PICTURES = 60;
export const MAX_LETTER_PICTURE_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 15_000;
const PARALLEL_FETCHES = 5;
/** Twice the text width of a letter (170 mm = 643 px), about 190 dpi. */
const MAX_PRINT_WIDTH = 1280;
const PRINT_QUALITY = '60';
/** What the most pictures of the largest size take as `data:` (base64 plus prefix): one picture repeated many times may not take more. */
const MAX_EMBEDDED_LENGTH = MAX_LETTER_PICTURES * (Math.ceil(MAX_LETTER_PICTURE_BYTES / 3) * 4 + 30);

/** A letter that cannot show one of its pictures. The reason is plain and names no address. */
export class LetterPictureError extends Error {
  constructor(reason: string) {
    super(`A picture of the letter could not be loaded: ${reason}.`);
    this.name = 'LetterPictureError';
  }
}

const IMG_TAG = /<img(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/g;
const IMG_NAME_LENGTH = '<img'.length;

/** The `src` attribute of an img tag: where it stands in the tag, and its decoded value; undefined without an address. */
function srcOf(tag: string): { start: number; end: number; value: string } | undefined {
  for (const m of tag.slice(IMG_NAME_LENGTH).matchAll(ATTRIBUTE)) {
    if (m[1].toLowerCase() !== 'src') continue;
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    const start = IMG_NAME_LENGTH + m.index;
    return value === '' ? undefined : { start, end: start + m[0].length, value: decodeEntities(value) };
  }
  return undefined;
}

/** The address a picture is printed from: of our image CDN, as a small opaque JPEG; undefined for any other address. */
export function printPictureUrl(src: string): string | undefined {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return undefined;
  }
  if (url.origin !== IMGIX_BASE || url.username || url.password) return undefined;
  url.hash = '';
  const params = url.searchParams;
  // the mail appends its own width, so the last one counts
  const asked = Number(params.getAll('w').pop());
  const height = Number(params.get('h'));
  const width = Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_PRINT_WIDTH) : MAX_PRINT_WIDTH;
  // a crop keeps its proportions
  if (width < asked && Number.isInteger(height) && height > 0) params.set('h', String(Math.max(1, Math.round((height * width) / asked))));
  params.set('w', String(width));
  if (!params.has('fit')) params.set('fit', 'max');
  // `auto` could choose another format, `dpr` another size
  params.delete('auto');
  params.delete('dpr');
  params.set('fm', 'jpg');
  params.set('q', PRINT_QUALITY);
  params.set('bg', 'fff');
  return url.href;
}

/** The mime type of a picture Chromium prints, from its first bytes; undefined for anything else. */
function mimeOf(bytes: Buffer): string | undefined {
  const head = bytes.toString('latin1', 0, 12);
  if (head.startsWith('\xff\xd8\xff')) return 'image/jpeg';
  if (head.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png';
  if (/^GIF8[79]a/.test(head)) return 'image/gif';
  return /^RIFF[^]{4}WEBP/.test(head) ? 'image/webp' : undefined;
}

/** The body of a response, read no further than the size cap. */
async function cappedBody(response: Response): Promise<Buffer> {
  const tooLarge = (): LetterPictureError => new LetterPictureError('it is too large');
  if (Number(response.headers.get('content-length')) > MAX_LETTER_PICTURE_BYTES) {
    await response.body?.cancel();
    throw tooLarge();
  }
  const reader = response.body?.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (let part = await reader?.read(); part && !part.done; part = await reader?.read()) {
    size += part.value.byteLength;
    if (size > MAX_LETTER_PICTURE_BYTES) {
      await reader?.cancel();
      throw tooLarge();
    }
    parts.push(part.value);
  }
  return Buffer.concat(parts);
}

/** One picture of our image CDN; once more after a network error or a 5xx. A redirect is an error: it would lead to another host. */
export async function fetchLetterImage(url: string): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    const last = attempt === 2;
    try {
      const response = await fetch(url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (response.ok && response.headers.get('content-type')?.trim().toLowerCase().startsWith('image/')) return await cappedBody(response);
      await response.body?.cancel();
      if (response.status < 500 || last) throw new LetterPictureError(response.ok ? 'it is not a picture' : `HTTP ${response.status}`);
    } catch (error) {
      if (error instanceof LetterPictureError) throw error;
      if ((error as Error)?.name === 'TimeoutError') throw new LetterPictureError('no answer in time');
      if (last) throw new LetterPictureError('no connection');
    }
  }
}

/** The bytes of one picture as a `data:` address. Whatever the fetch throws, the error names no address. */
async function dataUrlOf(url: string, fetchImage: (url: string) => Promise<Buffer>): Promise<string> {
  let bytes: Buffer;
  try {
    bytes = await fetchImage(url);
  } catch (error) {
    throw error instanceof LetterPictureError ? error : new LetterPictureError('no connection');
  }
  const mime = mimeOf(bytes);
  if (!mime) throw new LetterPictureError('it is not a picture');
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

/**
 * The html of a letter with its pictures inside it. Every `<img>` is fetched from our image CDN (each once), an inline picture
 * stays, an `<img>` without an address shows its alt text; any other address, or a picture that cannot be fetched, throws a
 * `LetterPictureError`. `html` comes out of `sanitizeEmailBody`.
 */
export async function embedLetterImages(html: string, fetchImage: (url: string) => Promise<Buffer> = fetchLetterImage): Promise<string> {
  // the printed address per address in the html; '' for one that stays
  const printed = new Map<string, string>();
  for (const [tag] of html.matchAll(IMG_TAG)) {
    const src = srcOf(tag);
    if (!src || printed.has(src.value)) continue;
    const url = /^data:image\//i.test(src.value) ? '' : printPictureUrl(src.value);
    if (url === undefined) throw new LetterPictureError('it is not one of our own pictures');
    printed.set(src.value, url);
  }
  const urls = [...new Set(printed.values())].filter((url) => url !== '');
  if (urls.length > MAX_LETTER_PICTURES) throw new LetterPictureError('there are too many pictures');

  const data = new Map<string, string>();
  for (const part of chunk(urls, PARALLEL_FETCHES)) {
    const loaded = await Promise.all(part.map((url) => dataUrlOf(url, fetchImage)));
    part.forEach((url, i) => data.set(url, loaded[i]));
  }

  let embedded = 0;
  return html.replace(IMG_TAG, (tag) => {
    const src = srcOf(tag);
    const picture = src && data.get(printed.get(src.value) ?? '');
    if (!src || !picture) return tag;
    embedded += picture.length;
    if (embedded > MAX_EMBEDDED_LENGTH) throw new LetterPictureError('there are too many pictures');
    return `${tag.slice(0, src.start)}src="${picture}"${tag.slice(src.end)}`;
  });
}
