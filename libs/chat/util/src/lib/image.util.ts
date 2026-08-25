/**
 * Supported image MIME types for chat upload and preview.
 *
 * Conversion behaviour:
 *   HEIC / HEIF  — converted to JPEG via native createImageBitmap (Safari). Browsers
 *                  without native HEIC support upload the file unconverted.
 *   AVIF         — converted to JPEG via createImageBitmap (all modern browsers).
 *   SVG          — previewed and uploaded as-is; rendered natively by all browsers.
 *   All others   — uploaded as-is; the browser renders them natively.
 *
 * Types NOT in this set (TIFF, SVG, ICO, …) are treated as generic file attachments
 * and bypass the image preview queue.
 */
export const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/bmp',
]);

/**
 * Extension → canonical MIME type, used whenever the browser cannot determine the type
 * itself. `File.type` is empty far more often than it looks from a macOS/Chrome desktop:
 * iOS hands over an empty type for anything picked through the Files app / iCloud Drive
 * or shared into the PWA, and several Windows drag-and-drop sources do the same.
 *
 * This map is the single source of truth for that fallback. It must stay the ONLY place
 * an extension is mapped to a type — the bug this replaced came from three layers each
 * deciding "is this an image" differently: the composer accepted a `.png` with an empty
 * type by extension, `sendFile` then classified it by MIME alone and shipped it as
 * `m.file` with `mimetype: ''`, and the message list — again MIME-only — drew it as a
 * document card. The image uploaded fine and simply never rendered as one.
 */
const EXTENSION_MIME_TYPES: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
};

/** Extensions accepted as a fallback when the browser cannot determine the MIME type. */
const SUPPORTED_IMAGE_EXTENSIONS = Object.keys(EXTENSION_MIME_TYPES);

/**
 * The image MIME type implied by a filename's extension, or undefined for a name that
 * does not end in a supported image extension.
 */
export function imageMimeTypeForName(name: string): string | undefined {
  const lower = name.toLowerCase();
  const ext = SUPPORTED_IMAGE_EXTENSIONS.find(e => lower.endsWith(e));
  return ext ? EXTENSION_MIME_TYPES[ext] : undefined;
}

/** Returns true if the filename ends in a supported image extension. */
export function isImageFileName(name: string): boolean {
  return imageMimeTypeForName(name) !== undefined;
}

/**
 * The MIME type to record for an upload: what the browser reported, else what the
 * extension implies, else '' (an unknown non-image — a genuine file attachment).
 *
 * Every layer that has to decide whether something is an image must go through this,
 * so the composer preview, the sent event and the renderer can never disagree again.
 */
export function resolveFileMimeType(file: File): string {
  return file.type || imageMimeTypeForName(file.name) || '';
}

/** Returns true if the file is a supported chat image (MIME type or extension match). */
export function isSupportedImageFile(file: File): boolean {
  if (SUPPORTED_IMAGE_MIME_TYPES.has(file.type)) return true;
  return isImageFileName(file.name);
}

/** Returns true if the file is a HEIC/HEIF image. */
export function isHeicFile(file: File): boolean {
  return file.type === 'image/heic' || file.type === 'image/heif'
    || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
}

/** Returns true if the file is an AVIF image. */
export function isAvifFile(file: File): boolean {
  return file.type === 'image/avif' || file.name.toLowerCase().endsWith('.avif');
}

/**
 * Convert a HEIC/HEIF/AVIF file to JPEG via createImageBitmap() — natively supported for
 * AVIF in all modern browsers, and for HEIC/HEIF in Safari. Where the browser cannot decode
 * the format (HEIC on Chrome/Firefox) the original file is returned unchanged and uploaded
 * as-is; the recipient's browser may then be unable to preview it.
 *
 * There used to be a libheif-js (WASM) fallback covering exactly that gap. It was dropped
 * deliberately: 1.4 MB of lazily-loaded WebAssembly and the only LGPL-3.0 dependency in the
 * bundle, for a narrow slice of uploads that already degrade gracefully without it. Do not
 * reintroduce a WASM decoder without weighing both costs again.
 *
 * Files that are not HEIC/HEIF/AVIF are returned immediately without any processing.
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeicFile(file) && !isAvifFile(file)) return file;

  // Safari (HEIC/HEIF) and all modern browsers (AVIF) decode natively
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas.toBlob failed')), 'image/jpeg', 0.85)
    );
    const jpegName = file.name.replace(/\.(heic|heif|avif)$/i, '.jpg');
    return new File([blob], jpegName, { type: 'image/jpeg' });
  } catch {
    // Browser cannot decode this format — upload the original untouched.
    return file;
  }
}

/**
 * Read a picked File fully into memory and return an equivalent, self-contained File.
 *
 * A `File` from `<input type="file">` (or a share sheet) is only a *handle* onto storage the
 * browser owns. On iOS/WebKit that storage is released once the input is cleared or the picker
 * session ends, and a later read of the handle yields **zero bytes without throwing** — while
 * `file.size` keeps reporting the original length from cached metadata. The composer queues
 * images in `pendingImages` and only uploads them when the user presses send, so a stale handle
 * is uploaded whenever someone picks a photo, types a line of text, and then sends: Synapse
 * stores a 0-byte object, answers 200, and the message renders as nothing at all.
 *
 * Reading the bytes while the handle is still valid removes that whole class of failure — the
 * returned File is backed by an ArrayBuffer and cannot go stale. `size` on the result is the
 * true byte length, so a caller can finally detect an empty read instead of trusting metadata.
 *
 * The type is normalised through resolveFileMimeType, so a file the browser reported with an
 * empty type also comes back correctly typed.
 */
export async function materializeFile(file: File): Promise<File> {
  const bytes = await file.arrayBuffer();
  return new File([bytes], file.name, { type: resolveFileMimeType(file), lastModified: file.lastModified });
}
