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
/**
 * What to render, in order. Every rendering is decoded to raw RGBA (1600 px of A4 ≈ 14 MB, 2400 px
 * ≈ 32 MB) plus jsQR's own maps, so each one is chosen for its chance of finding the code:
 * - a PDF page is rendered sharply, and its QR-bill is by standard the payment part — the bottom
 *   105 mm of the A4 page (`ar=2:1`, cropped from the bottom): that strip at 1600 px is a third of
 *   the pixels and reads every bill we tried; only an unusual layout needs the full page after it.
 * - a photo has no fixed layout and often a small code: the full image at 1600, then 2400 px.
 */
interface Rendering { width: number; paymentPart: boolean; }
const PDF_RENDERINGS: Rendering[] = [{ width: 1600, paymentPart: true }, { width: 1600, paymentPart: false }];
const PHOTO_RENDERINGS: Rendering[] = [{ width: 1600, paymentPart: false }, { width: 2400, paymentPart: false }];

const IMAGE_TYPES = /^image\/(jpeg|png|heic|heif|webp|gif|tiff)$/i;

function renderUrl(objectName: string, { width, paymentPart }: Rendering, page?: number): string {
  const path = objectName.split('/').map(encodeURIComponent).join('/');
  const crop = paymentPart ? '&fit=crop&crop=bottom&ar=2:1' : '';
  return `${IMGIX_BASE}/${path}?fm=jpg&q=95&w=${width}${crop}${page ? `&page=${page}` : ''}`;
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
  // a QR-bill is printed dark on light: the inverted attempt (jsQR's default) only costs a second map
  const code = jsQR(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height,
    { inversionAttempts: 'dontInvert' });
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
    const renderings = isPdf ? PDF_RENDERINGS : PHOTO_RENDERINGS;
    for (let page = pageCount; page >= lastPage; page--) {
      for (const rendering of renderings) {
        const text = await decodeAt(renderUrl(objectName, rendering, isPdf ? page : undefined));
        if (text && isSwissQrBill(text)) return stripQrBillDebtor(text);
        // a QR code that is not a bill: a bigger rendering will not change that, but a strip may
        // have cut off the bill while catching another code, so only the full view settles it
        if (text && !rendering.paymentPart) break;
      }
    }
  } catch (error: unknown) {
    logger.warn(`decodeQrBill: no QR-bill read from "${objectName}"`, error);
  }
  return '';
}
