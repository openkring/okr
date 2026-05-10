/** Returns true if the file is a HEIC/HEIF image that browsers cannot display natively. */
export function isHeicFile(file: File): boolean {
  return file.type === 'image/heic' || file.type === 'image/heif'
    || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
}

/**
 * Convert a HEIC/HEIF file to JPEG.
 *
 * Fast path (Safari): createImageBitmap() decodes HEIC natively — no library needed.
 * Fallback (Chrome/Firefox): libheif-js (WASM) is lazy-loaded only when a HEIC file is detected.
 * If both fail the original file is returned unchanged.
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;

  // Fast path: Safari decodes HEIC natively via createImageBitmap
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
    const jpegName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([blob], jpegName, { type: 'image/jpeg' });
  } catch {
    // Fall through to WASM-based decoder for Chrome/Firefox
  }

  // Fallback: libheif-js (WebAssembly) — lazy-loaded, ~2 MB, only on HEIC files
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – libheif-js ships no TypeScript declarations
    const { default: libheif } = await import('libheif-js/wasm-bundle');
    const decoder = new libheif.HeifDecoder();
    const data = decoder.decode(new Uint8Array(await file.arrayBuffer()));
    if (!data.length) throw new Error('No images decoded from HEIC');

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
    const jpegName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([blob], jpegName, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
