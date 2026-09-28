import { afterEach, describe, expect, it, vi } from 'vitest';
import * as jpeg from 'jpeg-js';

import { encodeQr } from '@okr/system-alias-util';

import { decodeQrBill } from './qr-bill-decode';

vi.mock('firebase-functions/v2', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const BILL = [
  'SPC', '0200', '1', 'CH1530700114905469508',
  'S', 'lokal.news Labs AG', 'Mockenwiesstrasse 37m', '', '8713', 'Uerikon', 'CH',
  '', '', '', '', '', '', '',
  '165.39', 'CHF',
  'S', 'Anna Muster', 'Seestrasse', '12', '8712', 'Stäfa', 'CH',
  'NON', '', 'RP-0035', 'EPD',
].join('\r\n');

/** A JPEG of the given text as a QR code, 8 px per module, with the quiet zone. */
function qrJpeg(text: string): Buffer {
  const { size, modules } = encodeQr(text, 'M');
  const scale = 8, margin = 4, px = (size + 2 * margin) * scale;
  const data = Buffer.alloc(px * px * 4, 255);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!modules[y][x]) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + margin) * scale + dy) * px + (x + margin) * scale + dx) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  return jpeg.encode({ data, width: px, height: px }, 95).data;
}

const blank = (): Buffer => jpeg.encode({ data: Buffer.alloc(200 * 200 * 4, 255), width: 200, height: 200 }, 90).data;

function mockPages(pages: Buffer[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('fm=json')) return new Response(JSON.stringify({ PDF: { PageCount: pages.length } }), { status: 200 });
    const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? 1);
    const body = pages[page - 1];
    return body
      ? new Response(new Uint8Array(body), { status: 200 })
      : new Response('', { status: 422 });   // imgix past the last page
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('decodeQrBill', () => {
  it('finds the QR-bill on the last page of a PDF and strips the debtor', async () => {
    mockPages([blank(), qrJpeg(BILL)]);
    const result = await decodeQrBill('tenant/scs/ocr/expense/e1/RP-0035.pdf', 'application/pdf');
    const lines = result.split('\r\n');
    expect(lines[3]).toBe('CH1530700114905469508');
    expect(lines[18]).toBe('165.39');
    expect(lines.slice(20, 27)).toEqual(['', '', '', '', '', '', '']);
    expect(result).not.toContain('Anna Muster');
  });

  it('reads the LAST page first — a bill there costs one rendering', async () => {
    const fetchMock = mockPages([blank(), blank(), blank(), qrJpeg(BILL)]);
    expect(await decodeQrBill('tenant/scs/ocr/expense/e1/a.pdf', 'application/pdf')).not.toBe('');
    const pages = fetchMock.mock.calls.map(([url]) => /[?&]page=(\d+)/.exec(url as string)?.[1]).filter(Boolean);
    expect(pages).toEqual(['4']);
  });

  it('scans every page of a long PDF, back to front, when the bill is not last', async () => {
    const fetchMock = mockPages([qrJpeg(BILL), ...Array.from({ length: 7 }, blank)]);
    expect(await decodeQrBill('tenant/scs/ocr/expense/e1/a.pdf', 'application/pdf')).not.toBe('');
    const pages = fetchMock.mock.calls.map(([url]) => /[?&]page=(\d+)/.exec(url as string)?.[1]).filter(Boolean);
    expect(pages[0]).toBe('8');
    expect(pages.at(-1)).toBe('1');
  });

  it('reads every page, and nothing more, when there is no bill', async () => {
    const fetchMock = mockPages([blank(), blank()]);
    expect(await decodeQrBill('tenant/scs/ocr/expense/e1/a.pdf', 'application/pdf')).toBe('');
    // metadata + 2 pages × 2 widths
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('ignores a QR code that is not a bill', async () => {
    mockPages([qrJpeg('https://shop.example/receipt/42')]);
    expect(await decodeQrBill('tenant/scs/ocr/expense/e1/photo.jpg', 'image/jpeg')).toBe('');
  });

  it('never throws — an imgix error just means no bill', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    expect(await decodeQrBill('tenant/scs/ocr/expense/e1/photo.jpg', 'image/jpeg')).toBe('');
  });

  it('skips file types imgix cannot render', async () => {
    const fetchMock = mockPages([]);
    expect(await decodeQrBill('tenant/scs/ocr/expense/e1/data.csv', 'text/csv')).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
