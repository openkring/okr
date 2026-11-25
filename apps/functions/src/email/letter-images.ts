// apps/functions/src/email/letter-images.ts
//
// The pictures of a letter (spec 1.176 §9.4): the server fetches each one once, from our image CDN only, and puts it into the
// letter as `data:`. The page that holds the recipient's address loads nothing. A picture that cannot be fetched fails the
// quote or the letters: left out, the letter would have other pages than the priced one.
//
// Privacy: the errors say what went wrong, never which picture (its path may name people).
import { IMGIX_BASE } from '@okr/cms-website-render';

import { decodeEntities } from './html-to-text';

/** The most different pictures of one letter. */
export const MAX_LETTER_PICTURES = 60;
export const MAX_LETTER_PICTURE_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 15_000;
const PARALLEL_FETCHES = 5;
/** For all pictures of a letter together: quote and send have 120 s, and render a letter after it. */
const FETCH_BUDGET_MS = 60_000;
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

function pixels(raw: string | null | undefined): number | undefined {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/** The width of a crop given by its height and ratio (`ar=3:2`). */
function widthOfRatio(height: number | undefined, ratio: string | null): number | undefined {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio ?? '');
  return height && m ? pixels(String(Math.round((height * Number(m[1])) / Number(m[2])))) : undefined;
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
  const height = pixels(params.get('h'));
  const asked = pixels(params.getAll('w').pop()) ?? widthOfRatio(height, params.get('ar'));
  const width = Math.min(asked ?? MAX_PRINT_WIDTH, MAX_PRINT_WIDTH);
  if (asked !== undefined && width < asked && height) {
    // a crop keeps its proportions
    params.set('h', String(Math.max(1, Math.round((height * width) / asked))));
  } else if (params.has('h') && (asked === undefined || width < asked)) {
    // without its width a crop has no proportions to keep (imgix crops nothing then), and a relative height cannot be scaled
    params.set('fit', 'max');
    if (!height) params.delete('h');
  }
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

/**
 * One picture of our image CDN; once more after a network error or a 5xx. A redirect is an error: it would lead to another
 * host. `signal` gives the picture up.
 */
export async function fetchLetterImage(url: string, signal?: AbortSignal): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    const last = attempt === 2;
    try {
      const response = await fetch(url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.any([AbortSignal.timeout(FETCH_TIMEOUT_MS), ...(signal ? [signal] : [])]) });
      if (response.ok && response.headers.get('content-type')?.trim().toLowerCase().startsWith('image/')) return await cappedBody(response);
      await response.body?.cancel();
      if (response.status < 500 || last) throw new LetterPictureError(response.ok ? 'it is not a picture' : `HTTP ${response.status}`);
    } catch (error) {
      if (error instanceof LetterPictureError) throw error;
      if (signal?.aborted || (error as Error)?.name === 'TimeoutError') throw new LetterPictureError('no answer in time');
      if (last) throw new LetterPictureError('no connection');
    }
  }
}

export type FetchImage = (url: string, signal?: AbortSignal) => Promise<Buffer>;

/** The bytes of one picture as a `data:` address. Whatever the fetch throws, the error names no address. */
async function dataUrlOf(url: string, fetchImage: FetchImage, signal: AbortSignal): Promise<string> {
  let bytes: Buffer;
  try {
    bytes = await fetchImage(url, signal);
  } catch (error) {
    throw error instanceof LetterPictureError ? error : new LetterPictureError('no connection');
  }
  const mime = mimeOf(bytes);
  if (!mime) throw new LetterPictureError('it is not a picture');
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

/** All pictures as `data:`, five at a time and within the budget; after the first failure none is started, and the open ones are given up. */
async function loadAll(urls: string[], fetchImage: FetchImage): Promise<Map<string, string>> {
  const data = new Map<string, string>();
  const waiting = [...urls];
  const controller = new AbortController();
  const worker = async (): Promise<void> => {
    for (let url = waiting.shift(); url !== undefined && !controller.signal.aborted; url = waiting.shift()) {
      data.set(url, await dataUrlOf(url, fetchImage, controller.signal));
    }
  };
  let timer: NodeJS.Timeout | undefined;
  const budget = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new LetterPictureError('no answer in time')), FETCH_BUDGET_MS);
  });
  try {
    await Promise.race([Promise.all(Array.from({ length: PARALLEL_FETCHES }, worker)), budget]);
    return data;
  } catch (error) {
    controller.abort();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** The address each picture of the html is printed from, `''` for an inline one that stays. */
function printedUrls(html: string): Map<string, string> {
  const printed = new Map<string, string>();
  for (const [tag] of html.matchAll(IMG_TAG)) {
    const src = srcOf(tag);
    if (!src || printed.has(src.value)) continue;
    const url = /^data:image\//i.test(src.value) ? '' : printPictureUrl(src.value);
    if (url === undefined) throw new LetterPictureError('it is not one of our own pictures');
    printed.set(src.value, url);
  }
  if (urlsOf(printed).length > MAX_LETTER_PICTURES) throw new LetterPictureError('there are too many pictures');
  return printed;
}

function urlsOf(printed: Map<string, string>): string[] {
  return [...new Set(printed.values())].filter((url) => url !== '');
}

/** Throws the `LetterPictureError` that `embedLetterImages` would throw whatever the pictures are: of another host, or too many. Fetches nothing. */
export function checkLetterImages(html: string): void {
  printedUrls(html);
}

/**
 * The html of a letter with its pictures inside it. Every `<img>` is fetched from our image CDN (each once), an inline picture
 * stays, an `<img>` without an address shows its alt text; any other address, or a picture that cannot be fetched, throws a
 * `LetterPictureError`. `html` comes out of `sanitizeEmailBody`.
 *
 * The quote, the send and the fan-out of one Versand each fetch on their own: the bytes are stored nowhere, and the price is
 * bound to the addresses. A picture replaced in between under its address may therefore give a letter of another length; the
 * fan-out does not send a letter that is longer than quoted.
 */
export async function embedLetterImages(html: string, fetchImage: FetchImage = fetchLetterImage): Promise<string> {
  const printed = printedUrls(html);
  const data = await loadAll(urlsOf(printed), fetchImage);

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
