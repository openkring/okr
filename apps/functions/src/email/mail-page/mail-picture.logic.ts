// apps/functions/src/email/mail-page/mail-picture.logic.ts
//
// The one rule for the address of a picture in a Versand mail (spec 1.176 §9.1): a picture block, a gallery, a picture inside
// a text, and the Mitteilung.
import { IMGIX_BASE } from '@okr/cms-website-render';

import { mailImageUrl } from './render-mail-page.logic';

/**
 * A stored picture address that can be shown: a storage path, or an https address (scheme in small letters, no fragment).
 * `''` for everything else: no path, http, `data:` and other schemes, a path from the root, control characters, backslashes.
 */
export function storedPictureUrl(raw: unknown): string {
  const url = typeof raw === 'string' ? raw.trim() : '';
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (url === '' || url.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(url) || encodedPath(url) === '') return '';
  if (!/^[a-z][a-z\d+.-]*:/i.test(url)) return url;
  return /^https:\/\/[^\s/?#]/i.test(url) ? `https${url.slice('https'.length)}`.replace(/#.*$/, '') : '';
}

/** A storage path is literal: every `%`, `#` or `?` in it belongs to a name. `''` for a text that is no valid unicode. */
function encodedPath(path: string): string {
  try {
    return path.split('/').map(encodeURIComponent).join('/');
  } catch {
    return '';
  }
}

/** The address of a stored picture at `width` px; `''` when a mail cannot show it. */
export function pictureUrl(raw: unknown, width: number): string {
  const stored = storedPictureUrl(raw);
  if (stored === '') return '';
  const url = mailImageUrl(stored.startsWith('https://') ? stored.replace(/ /g, '%20') : encodedPath(stored), width);
  return url.startsWith(`${IMGIX_BASE}/`) ? `${url}&fit=max` : url;
}
