/**
 * Supported image MIME types for chat upload and preview.
 *
 * Conversion behaviour:
 *   HEIC / HEIF  — converted to JPEG via Safari's native createImageBitmap (fast path)
 *                  or libheif-js WASM (Chrome / Firefox fallback).
 *   AVIF         — converted to JPEG via createImageBitmap (all modern browsers)
 *                  or libheif-js WASM (older browser fallback).
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
 * Convert a HEIC/HEIF/AVIF file to JPEG.
 *
 * Fast path: createImageBitmap() — natively supported for AVIF in all modern browsers,
 * and for HEIC/HEIF in Safari.
 * Fallback: libheif-js (WASM) — lazy-loaded (~2 MB), handles HEIC, HEIF and AVIF on
 * Chrome / Firefox. Requires 'wasm-unsafe-eval' in the Content-Security-Policy.
 * If both paths fail the original file is returned unchanged.
 *
 * Files that are not HEIC/HEIF/AVIF are returned immediately without any processing.
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeicFile(file) && !isAvifFile(file)) return file;

  // Fast path: Safari (HEIC/HEIF) and all modern browsers (AVIF) decode natively
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
    // Fall through to WASM-based decoder for Chrome/Firefox
  }

  // Fallback: libheif-js (WebAssembly) — lazy-loaded, ~2 MB, only on HEIC/HEIF/AVIF files
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – libheif-js ships no TypeScript declarations
    const mod: any = await import('libheif-js/wasm-bundle');
    // In the browser the Emscripten factory returns a Promise (async WASM init);
    // in Node.js it returns the module directly. Awaiting handles both.
    const libheif: any = await (mod.default ?? mod);
    const decoder = new libheif.HeifDecoder();
    const data = decoder.decode(new Uint8Array(await file.arrayBuffer()));
    if (!data.length) throw new Error('No images decoded from HEIC/AVIF');

    const image = data[0];
    const width = image.get_width();
    const height = image.get_height();

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(width, height);

    await new Promise<void>((resolve, reject) =>
      image.display(imageData, (result: unknown) => (result ? resolve() : reject(new Error('HEIF display error'))))
    );

    ctx.putImageData(imageData, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas.toBlob failed')), 'image/jpeg', 0.85)
    );
    const jpegName = file.name.replace(/\.(heic|heif|avif)$/i, '.jpg');
    return new File([blob], jpegName, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
