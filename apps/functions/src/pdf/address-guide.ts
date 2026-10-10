/**
 * Preview aid of the template editor: outlines the envelope address window on page 1 so the
 * template author can place the recipient address. Drawn into the rendered PDF (not as a browser
 * overlay) because the browser's PDF viewer hides its zoom and scroll position; on paper the box
 * sits exactly where the window will be, whatever margins or @page CSS the template uses.
 * Never drawn on an issued document: only the editor preview passes `addressGuide`.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export type AddressGuideSide = 'left' | 'right';

/** Window of a C5 / C5/6 window envelope, in mm from the sheet's edges (A4 portrait). */
export const ADDRESS_WINDOW_MM = {
  width: 100,
  height: 45,
  top: 45,    // sheet top edge → window top
  side: 12,   // sheet left (left window) or right (right window) edge → window
} as const;

const PT_PER_MM = 72 / 25.4;

export interface GuideRect { x: number; y: number; width: number; height: number }

/** The window rectangle in PDF points (origin bottom-left, as pdf-lib draws). */
export function addressWindowRect(side: AddressGuideSide, pageWidthPt: number, pageHeightPt: number): GuideRect {
  const w = ADDRESS_WINDOW_MM.width * PT_PER_MM;
  const h = ADDRESS_WINDOW_MM.height * PT_PER_MM;
  const sideOffset = ADDRESS_WINDOW_MM.side * PT_PER_MM;
  const x = side === 'left' ? sideOffset : pageWidthPt - sideOffset - w;
  const y = pageHeightPt - ADDRESS_WINDOW_MM.top * PT_PER_MM - h;
  return { x, y, width: w, height: h };
}

/** Narrow an untrusted request value to a side; anything else means "no guide". */
export function toAddressGuideSide(value: unknown): AddressGuideSide | undefined {
  return value === 'left' || value === 'right' ? value : undefined;
}

/** Draws the dashed window outline and a small label on page 1. Landscape pages are left as they are. */
export async function drawAddressGuide(pdf: Uint8Array, side: AddressGuideSide): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const page = doc.getPages()[0];
  if (!page) return pdf;
  const { width, height } = page.getSize();
  if (width > height) return pdf;

  const r = addressWindowRect(side, width, height);
  const color = rgb(0.85, 0.1, 0.45);
  page.drawRectangle({
    ...r,
    borderColor: color,
    borderWidth: 0.75,
    borderDashArray: [4, 3],
    color,
    opacity: 0.06,
    borderOpacity: 0.9,
  });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(
    `Adressfenster ${side === 'left' ? 'links' : 'rechts'} ${ADDRESS_WINDOW_MM.width} x ${ADDRESS_WINDOW_MM.height} mm`,
    { x: r.x, y: r.y + r.height + 3, size: 6, font, color },
  );
  return doc.save();
}
