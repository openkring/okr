// The pictures of a letter (spec 1.176 §9.4): fetched once by the server, embedded as data:. No network here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sanitizeEmailBody } from '../pdf/sanitize';
import { embedLetterImages, fetchLetterImage, LetterPictureError, MAX_LETTER_PICTURE_BYTES, MAX_LETTER_PICTURES, printPictureUrl } from './letter-images';
import { renderMailBlocks } from './mail-page/render-mail-blocks.logic';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const DATA = `data:image/jpeg;base64,${JPEG.toString('base64')}`;
const BASE = 'https://bkaiser.imgix.net';
const img = (src: string) => `<img src="${src}" alt="Boot" width="440" style="width:auto" />`;

describe('embedLetterImages', () => {
  it('replaces the address of a picture by its bytes and nothing else', async () => {
    const fetchImage = vi.fn<(url: string) => Promise<Buffer>>(async () => JPEG);
    const html = `<p>Vorher &amp; «so»</p>${img(`${BASE}/tenant/scs/a.jpg?auto=compress,format=jpg&amp;w=880&amp;fit=max`)}<p>nachher</p>`;
    expect(await embedLetterImages(html, fetchImage)).toBe(`<p>Vorher &amp; «so»</p>${img(DATA)}<p>nachher</p>`);
    const asked = new URL(fetchImage.mock.calls[0][0]);
    expect(asked.origin).toBe(BASE);
    expect(asked.pathname).toBe('/tenant/scs/a.jpg');
    expect(asked.searchParams.get('w')).toBe('880');
  });

  it('is the same html without a picture', async () => {
    const fetchImage = vi.fn(async () => JPEG);
    for (const html of ['', '<p>Text</p>', '<p>&lt;img src="https://x.ch/a.jpg"&gt;</p>', '<img alt="Nur Text" />', '<img src="" alt="" />']) {
      expect(await embedLetterImages(html, fetchImage)).toBe(html);
    }
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('reads the address whatever the order and the quotes of the attributes, and only of img', async () => {
    const fetchImage = vi.fn(async () => JPEG);
    const url = `${BASE}/a.jpg`;
    const html = `<IMG alt='a > b src="https://x.ch/1.jpg"' data-src="https://x.ch/2.jpg" SRC = '${url}'><a href="https://x.ch">x</a><img src=${url} alt=x><img\n  src="${BASE}&#47;a.jpg?w=10&#38;h=5"/>`;
    expect(await embedLetterImages(html, fetchImage)).toBe(
      `<IMG alt='a > b src="https://x.ch/1.jpg"' data-src="https://x.ch/2.jpg" src="${DATA}"><a href="https://x.ch">x</a><img src="${DATA}" alt=x><img\n  src="${DATA}"/>`,
    );
    expect(fetchImage).toHaveBeenCalledTimes(2);
  });

  it('fetches each picture once, also when only the spelling of the address differs', async () => {
    const fetchImage = vi.fn(async () => JPEG);
    const a = `${BASE}/a.jpg?w=880&amp;auto=compress`;
    const out = await embedLetterImages([img(a), img(a), img(`${BASE}/a.jpg?w=880&auto=format#x`)].join(''), fetchImage);
    expect(fetchImage).toHaveBeenCalledTimes(1);
    expect(out).toBe(img(DATA).repeat(3));
  });

  it('leaves an inline picture', async () => {
    const fetchImage = vi.fn(async () => JPEG);
    const html = img('data:image/png;base64,AAAA');
    expect(await embedLetterImages(html, fetchImage)).toBe(html);
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('refuses every other address, before it fetches anything', async () => {
    for (const src of [
      'https://elsewhere.example/a.jpg', 'http://bkaiser.imgix.net/a.jpg', 'https://bkaiser.imgix.net.evil.example/a.jpg', 'https://bkaiser.imgix.net:8443/a.jpg',
      'https://u:p@bkaiser.imgix.net/a.jpg', 'https://bkaiser.imgix.net@evil.example/a.jpg', '//bkaiser.imgix.net/a.jpg', '/a.jpg', 'a.jpg', 'cid:1', 'data:text/html,x',
      'file:///etc/passwd', 'https://metadata.google.internal/', 'http://169.254.169.254/', ' ',
    ]) {
      const fetchImage = vi.fn(async () => JPEG);
      await expect(embedLetterImages(img(`${BASE}/ok.jpg`) + img(src), fetchImage), src).rejects.toBeInstanceOf(LetterPictureError);
      expect(fetchImage, src).not.toHaveBeenCalled();
    }
  });

  it('throws when one picture cannot be fetched; the error names no address and carries no cause', async () => {
    const boom = new Error('GET https://bkaiser.imgix.net/tenant/scs/geheim.jpg failed');
    const error = await embedLetterImages(img(`${BASE}/tenant/scs/geheim.jpg`), async () => { throw boom; }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LetterPictureError);
    expect(JSON.stringify([String(error), (error as Error).stack, (error as { cause?: unknown }).cause ?? null])).not.toMatch(/geheim|https:/);
  });

  it('throws when the bytes are no picture, and takes the type from the bytes', async () => {
    for (const bytes of [Buffer.from('<html>'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.alloc(0)]) {
      await expect(embedLetterImages(img(`${BASE}/a.jpg`), async () => bytes)).rejects.toBeInstanceOf(LetterPictureError);
    }
    expect(await embedLetterImages(img(`${BASE}/a.jpg`), async () => PNG)).toContain('data:image/png;base64,');
  });

  it('takes at most 60 different pictures', async () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => img(`${BASE}/${i}.jpg`)).join('');
    const fetchImage = vi.fn(async () => JPEG);
    await embedLetterImages(many(MAX_LETTER_PICTURES), fetchImage);
    expect(fetchImage).toHaveBeenCalledTimes(60);
    await embedLetterImages(many(MAX_LETTER_PICTURES) + many(MAX_LETTER_PICTURES), fetchImage);
    fetchImage.mockClear();
    await expect(embedLetterImages(many(MAX_LETTER_PICTURES + 1), fetchImage)).rejects.toBeInstanceOf(LetterPictureError);
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('never makes a letter larger than 60 different pictures would', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_LETTER_PICTURE_BYTES - JPEG.length)]);
    const sixty = Array.from({ length: MAX_LETTER_PICTURES }, (_, i) => img(`${BASE}/${i}.jpg`)).join('');
    expect((await embedLetterImages(sixty, async () => big)).length).toBeGreaterThan(MAX_LETTER_PICTURES * MAX_LETTER_PICTURE_BYTES);
    await expect(embedLetterImages(img(`${BASE}/a.jpg`).repeat(1000), async () => big)).rejects.toBeInstanceOf(LetterPictureError);
  });

  it('fetches at most five at a time and starts none after a failure', async () => {
    let open = 0;
    let most = 0;
    const html = Array.from({ length: 17 }, (_, i) => img(`${BASE}/${i}.jpg`)).join('');
    await embedLetterImages(html, async () => {
      most = Math.max(most, ++open);
      await new Promise((r) => setTimeout(r, 1));
      open--;
      return JPEG;
    });
    expect(most).toBe(5);
    const failing = vi.fn(async () => { throw new Error('x'); });
    await expect(embedLetterImages(html, failing)).rejects.toBeInstanceOf(LetterPictureError);
    expect(failing).toHaveBeenCalledTimes(5);
  });

  it('embeds the pictures of a letter as they come out of the mail sanitizer', async () => {
    const { default: hb } = await import('handlebars');
    const picture = (url: string) => ({ label: '', type: 0, url, actionUrl: '', altText: 'Boot & "See" > Steg', overlay: '' });
    const { html } = await renderMailBlocks([
      { id: 'i', type: 'image', image: picture('tenant/scs/am see.jpg') },
      { id: 'g', type: 'gallery', images: [picture('tenant/scs/b.png'), picture(`${BASE}/tenant/scs/c.jpg?auto=compress`)] },
      { id: 't', type: 'text', html: `<p>Text <img src="${BASE}/tenant/scs/d.jpg" alt="d"></p>` },
    ], { hb, sanitize: sanitizeEmailBody, events: {}, appOrigin: '', color: '#014da2', target: 'print' });
    const body = await sanitizeEmailBody(html);
    const seen: string[] = [];
    const out = await embedLetterImages(body, async (url) => { seen.push(url); return JPEG; });
    expect(seen).toHaveLength(4);
    expect(seen.every((url) => url.startsWith(`${BASE}/`) && new URL(url).searchParams.get('fm') === 'jpg')).toBe(true);
    expect(out).not.toContain('<img src="https');
    expect(out.replace(/ src="[^"]*"/g, '')).toBe(body.replace(/ src="[^"]*"/g, ''));
  });
});

describe('printPictureUrl', () => {
  const params = (url: string) => Object.fromEntries(new URL(printPictureUrl(url) ?? '').searchParams);

  it('forces a small opaque jpeg and keeps the rest', () => {
    expect(params(`${BASE}/a.png?auto=format,compress&w=880&fit=max&fm=png&q=100&dpr=3&rect=1,2,3,4`))
      .toEqual({ w: '880', fit: 'max', rect: '1,2,3,4', fm: 'jpg', q: '60', bg: 'fff' });
  });

  it('is at most twice the width of the letter text, also without or with an odd width', () => {
    for (const query of ['', '?w=6000', '?w=0', '?w=-5', '?w=abc', '?w=0.5', '?w=1e9', '?w=880&w=6000']) {
      expect(params(`${BASE}/a.jpg${query}`), query).toMatchObject({ w: '1280', fit: 'max' });
    }
    expect(params(`${BASE}/a.jpg?w=6000&w=880`)).toMatchObject({ w: '880' });
  });

  it('keeps the proportions of a crop', () => {
    expect(params(`${BASE}/a.jpg?w=2560&h=1000&fit=crop`)).toMatchObject({ w: '1280', h: '500', fit: 'crop' });
    expect(params(`${BASE}/a.jpg?w=200&h=100&fit=crop`)).toMatchObject({ w: '200', h: '100', fit: 'crop' });
  });
});

describe('fetchLetterImage', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const image = (init: { status?: number; type?: string | null; length?: string; bytes?: Buffer } = {}) => new Response(new Uint8Array(init.bytes ?? JPEG), {
    status: init.status ?? 200,
    headers: { ...(init.type === null ? {} : { 'content-type': init.type ?? 'image/jpeg' }), ...(init.length ? { 'content-length': init.length } : {}) },
  });
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });
  const URL_ = `${BASE}/a.jpg?fm=jpg`;

  it('gives the bytes, follows no redirect, sends no cookie and stops after 15 seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValue(image());
    expect(await fetchLetterImage(URL_)).toEqual(JPEG);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual([URL_, { redirect: 'error', credentials: 'omit', signal: expect.any(AbortSignal) }]);
    expect(timeout).toHaveBeenCalledWith(15_000);
  });

  it('tries once more after a network error or a 5xx, not more', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(image());
    expect(await fetchLetterImage(URL_)).toEqual(JPEG);
    fetchMock.mockResolvedValueOnce(image({ status: 503 })).mockResolvedValueOnce(image());
    expect(await fetchLetterImage(URL_)).toEqual(JPEG);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => image({ status: 500 }));
    await expect(fetchLetterImage(URL_)).rejects.toThrow('HTTP 500');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not repeat a 4xx, a timeout, a wrong type or a size', async () => {
    const answers: (() => Promise<Response>)[] = [
      async () => image({ status: 404 }),
      async () => { throw new DOMException('timed out', 'TimeoutError'); },
      async () => image({ type: 'text/html' }), async () => image({ type: null }), async () => image({ type: 'application/octet-stream' }),
      async () => image({ length: String(MAX_LETTER_PICTURE_BYTES + 1) }), async () => image({ bytes: Buffer.alloc(MAX_LETTER_PICTURE_BYTES + 1) }),
    ];
    for (const answer of answers) {
      fetchMock.mockReset();
      fetchMock.mockImplementation(answer);
      await expect(fetchLetterImage(URL_)).rejects.toBeInstanceOf(LetterPictureError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('takes exactly 1.5 MB', async () => {
    expect(MAX_LETTER_PICTURE_BYTES).toBe(1_500_000);
    fetchMock.mockResolvedValue(image({ bytes: Buffer.alloc(MAX_LETTER_PICTURE_BYTES) }));
    expect(await fetchLetterImage(URL_)).toHaveLength(MAX_LETTER_PICTURE_BYTES);
  });

  it('stops reading a body without a length as soon as it is too large', async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({ pull(c) { pulled++; c.enqueue(new Uint8Array(500_000)); } });
    fetchMock.mockResolvedValue(new Response(body, { headers: { 'content-type': 'image/jpeg' } }));
    await expect(fetchLetterImage(URL_)).rejects.toBeInstanceOf(LetterPictureError);
    expect(pulled).toBeLessThan(8);
  });

  it('is what embedLetterImages uses', async () => {
    fetchMock.mockImplementation(async () => image());
    expect(await embedLetterImages(img(`${BASE}/a.jpg`))).toBe(img(DATA));
    expect(String(fetchMock.mock.calls[0][0])).toContain('fm=jpg');
  });
});
