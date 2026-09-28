import { logger } from 'firebase-functions/v2';
import jsQR from 'jsqr';
import * as jpeg from 'jpeg-js';

import { isSwissQrBill, stripQrBillDebtor } from '@okr/shared-util-core';

/**
 * imgix serves the receipt straight from the Storage bucket and renders every format we accept —
 * a PDF page, HEIC, PNG, JPG — as a JPEG. That keeps the function free of a native image library:
 * `jpeg-js` decodes the JPEG to pixels, `jsQR` finds the code. Same base the app uses
 * (`env.services.imgixBaseUrl`).
 */
const IMGIX_BASE = process.env['OCR_IMGIX_BASE'] || 'https://bkaiser.imgix.net';

/** Safety cap for the page scan; a longer PDF only has its last pages read. */
const MAX_PDF_PAGES = 30;
/** 1600 px reads every A4 QR-bill we tried; 2400 rescues small codes on photographed receipts. */
const WIDTHS = [1600, 2400];

const IMAGE_TYPES = /^image\/(jpeg|png|heic|heif|webp|gif|tiff)$/i;

function renderUrl(objectName: string, width: number, page?: number): string {
  const path = objectName.split('/').map(encodeURIComponent).join('/');
  return `${IMGIX_BASE}/${path}?fm=jpg&q=95&w=${width}${page ? `&page=${page}` : ''}`;
}

/** The page count imgix reports for a PDF (`fm=json` → `PDF.PageCount`); 1 when it tells nothing. */
async function pdfPageCount(objectName: string): Promise<number> {
  const path = objectName.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${IMGIX_BASE}/${path}?fm=json`);
  if (!res.ok) throw new Error(`imgix ${res.status} for the metadata of ${objectName}`);
  const meta = await res.json() as { PDF?: { PageCount?: number } };
  const count = Number(meta.PDF?.PageCount ?? 1);
  return Number.isInteger(count) && count > 0 ? count : 1;
}

async function decodeAt(url: string): Promise<string | undefined> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`imgix ${res.status} for ${url}`);
  const img = jpeg.decode(Buffer.from(await res.arrayBuffer()), { useTArray: true, maxMemoryUsageInMB: 512 });
  const code = jsQR(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height);
  return code?.data;
}

/**
 * The Swiss QR-bill printed on a receipt, as its payload with the DEBTOR block removed (see
 * `stripQrBillDebtor` — the debtor is the member who paid, and `ocr-results` is tenant-readable);
 * '' when the receipt carries none. Other QR codes (a shop's URL, a loyalty code) are ignored.
 *
 * Best effort by construction: it never throws, so a failed decode cannot fail the OCR extraction.
 */
export async function decodeQrBill(objectName: string, contentType: string): Promise<string> {
  const isPdf = /pdf/i.test(contentType) || /\.pdf$/i.test(objectName);
  if (!isPdf && !IMAGE_TYPES.test(contentType)) return '';
  try {
    // The QR-bill is the payment part of an invoice, so it is almost always on the LAST page:
    // scan from the back, which usually finds it on the first rendering.
    const pageCount = isPdf ? await pdfPageCount(objectName) : 1;
    const lastPage = Math.max(1, pageCount - MAX_PDF_PAGES + 1);
    for (let page = pageCount; page >= lastPage; page--) {
      for (const width of WIDTHS) {
        const text = await decodeAt(renderUrl(objectName, width, isPdf ? page : undefined));
        if (text && isSwissQrBill(text)) return stripQrBillDebtor(text);
        if (text) break;   // a QR code, but not a bill — a bigger rendering will not change that
      }
    }
  } catch (error: unknown) {
    logger.warn(`decodeQrBill: no QR-bill read from "${objectName}"`, error);
  }
  return '';
}
