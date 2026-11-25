// apps/functions/src/email/mail-page/mail-picture.logic.ts
//
// The one rule for the address of a picture in a Versand mail (spec 1.176 §9.1): a picture block, a gallery, a picture inside
// a text, and the Mitteilung.
import { IMGIX_BASE } from '@okr/cms-website-render';
import { isMailPictureSource } from '@okr/shared-util-core';

import { mailImageUrl } from './render-mail-page.logic';

/**
 * A stored picture address that can be shown (`isMailPictureSource`): a storage path, or an https address (scheme in small letters,
 * no fragment). `''` for everything else.
 */
export function storedPictureUrl(raw: unknown): string {
  if (!isMailPictureSource(raw)) return '';
  const url = (raw as string).trim();
  return /^https:/i.test(url) ? `https${url.slice('https'.length)}`.replace(/#.*$/, '') : url;
}

/** A storage path is literal: every `%`, `#` or `?` in it belongs to a name. */
function encodedPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** The address of a stored picture at `width` px; `''` when a mail cannot show it. */
export function pictureUrl(raw: unknown, width: number): string {
  const stored = storedPictureUrl(raw);
  if (stored === '') return '';
  const url = mailImageUrl(stored.startsWith('https://') ? stored.replace(/ /g, '%20') : encodedPath(stored), width);
  return url.startsWith(`${IMGIX_BASE}/`) ? `${url}&fit=max` : url;
}
