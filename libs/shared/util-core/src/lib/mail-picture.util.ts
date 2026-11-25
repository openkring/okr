import { toPixelNumber } from './img.util';

// What a Versand mail honours of a picture's stored style (spec 1.176). One rule for the app's editor and the server's renderer.

/** The width that the seeded layouts give the blocks of a mail, in px. */
export const MAIL_CONTENT_WIDTH = 440;

/**
 * The width of a picture as its style has it: a part (percent) of its `place`, in px at most the content, or (anything else) all of its
 * place. What would be less than half a pixel is no width.
 */
export function mailPictureWidth(raw: unknown, place = MAIL_CONTENT_WIDTH): { percent: number } | { px: number } {
  const width = typeof raw === 'string' ? raw.trim() : '';
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(width);
  if (percent) {
    const share = Number(percent[1]);
    return { percent: share < 100 && Math.round(place * share / 100) >= 1 ? share : 100 };
  }
  const px = Math.round(toPixelNumber(width) ?? 0);
  return px >= 1 ? { px: Math.min(px, MAIL_CONTENT_WIDTH) } : { percent: 100 };
}

/** Where the caption of a picture stands: none without a position, and one over the picture is below it in a mail. */
export function mailCaptionPosition(raw: unknown): 'none' | 'top' | 'bottom' {
  const position = typeof raw === 'string' ? raw.trim() : '';
  if (position === '' || position === 'none') return 'none';
  return position === 'top' ? 'top' : 'bottom';
}
