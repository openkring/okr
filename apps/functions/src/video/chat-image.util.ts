import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Largest HEIC the converter accepts, in decoded bytes. A callable request is capped at 10 MB and
 * the bytes travel base64-encoded (+33 %), so 7 MB is the most that fits with room to spare. A
 * phone photo is 1–4 MB; anything bigger is refused and the client sends the original instead.
 */
export const MAX_CHAT_HEIC_BYTES = 7 * 1024 * 1024;

/** JPEG quality for the converted photo — the same 0.85 the Safari path in chat-util uses. */
export const CHAT_JPEG_QUALITY = 0.85;

const MAX_NAME_LENGTH = 256;

export interface ChatHeicRequest {
  fileName: string;
  bytes: Buffer;
}

function fail(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

/**
 * True when the bytes are an ISO-BMFF container branded as HEIC/HEIF: an `ftyp` box at offset 4
 * whose major brand is one of the HEIF brands. Checked before decoding, so the converter never
 * feeds arbitrary bytes into libheif.
 */
export function isHeifBuffer(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(4, 8) !== 'ftyp') return false;
  return ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'].includes(ascii(8, 12));
}

/** `IMG_1234.HEIC` → `IMG_1234.jpg`; a name without a HEIC/HEIF extension just gains `.jpg`. */
export function jpegFileName(fileName: string): string {
  return /\.(heic|heif)$/i.test(fileName) ? fileName.replace(/\.(heic|heif)$/i, '.jpg') : `${fileName}.jpg`;
}

/** Validates the `convertChatHeic` payload or throws `invalid-argument`. */
export function validateChatHeicRequest(data: unknown): ChatHeicRequest {
  if (typeof data !== 'object' || data === null) fail('Missing request data.');
  const { fileName, data: base64 } = data as Record<string, unknown>;
  if (typeof fileName !== 'string' || fileName.trim().length === 0 || fileName.length > MAX_NAME_LENGTH || /[/\\]/.test(fileName)) {
    fail('Invalid fileName.');
  }
  if (typeof base64 !== 'string' || base64.length === 0) fail('Missing image data.');
  // Reject on the encoded length first, so an oversized payload is never decoded into memory.
  if (base64.length > Math.ceil(MAX_CHAT_HEIC_BYTES / 3) * 4) fail('Image too large.');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_CHAT_HEIC_BYTES) fail('Image too large.');
  if (!isHeifBuffer(bytes)) fail('Not a HEIC/HEIF image.');
  return { fileName, bytes };
}
