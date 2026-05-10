/** Returns true if the file is a HEIC/HEIF image that browsers cannot display natively. */
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
 * and for HEIC in Safari.
 * Fallback: libheif-js (WASM) — lazy-loaded, handles both HEIC and AVIF on Chrome/Firefox.
 * If both fail the original file is returned unchanged.
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeicFile(file) && !isAvifFile(file)) return file;

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
    const mod: any = await import('libheif-js/wasm-bundle');
    // In the browser the Emscripten factory returns a Promise (async WASM init);
    // in Node.js it returns the module directly. Awaiting handles both.
    const libheif: any = await (mod.default ?? mod);
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
