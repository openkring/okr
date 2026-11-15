import { VcardImportDraft } from './vcard-import-mapping';

/** Guess the image mime type from the leading base64 characters; vCard PHOTO carries no TYPE we can trust. */
export function photoMime(base64: string): { mime: string; ext: string } {
  if (base64.startsWith('iVBOR')) return { mime: 'image/png', ext: 'png' };
  if (base64.startsWith('R0lGOD')) return { mime: 'image/gif', ext: 'gif' };
  if (base64.startsWith('UklGR')) return { mime: 'image/webp', ext: 'webp' };
  return { mime: 'image/jpeg', ext: 'jpg' };
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Move a card's photo out of the JS heap (spec 1.159 §4.4): the base64 string becomes a `Blob`
 * (held by the browser outside the heap) and the string is dropped. A photo that cannot be
 * decoded is dropped too and the card carries no photo — the import reports nothing worse than
 * a card without a picture.
 */
export function detachPhoto(draft: VcardImportDraft): VcardImportDraft {
  const { photoBase64, ...rest } = draft;
  if (!photoBase64) return rest;
  try {
    return { ...rest, photo: base64ToBlob(photoBase64, photoMime(photoBase64).mime) };
  } catch {
    return rest;
  }
}
