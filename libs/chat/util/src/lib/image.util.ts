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

/** Extensions accepted as a fallback when the browser cannot determine the MIME type (e.g. some drag-and-drop scenarios). */
const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.heic', '.heif', '.avif', '.bmp'];

/** Returns true if the file is a supported chat image (MIME type or extension match). */
export function isSupportedImageFile(file: File): boolean {
  if (SUPPORTED_IMAGE_MIME_TYPES.has(file.type)) return true;
  const name = file.name.toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some(ext => name.endsWith(ext));
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
