/** One gigabyte as the limits count it (binary, like DEFAULT_FILE_TRANSFER_LIMITS). */
export const FILE_TRANSFER_GB = 1024 ** 3;

/** Bytes → GB for the UI, rounded to at most one decimal (1 GB → 1, 1.5 GB → 1.5). */
export function bytesToGb(bytes: number): number {
  return Math.round(((bytes ?? 0) / FILE_TRANSFER_GB) * 10) / 10;
}

/** GB from the UI → whole bytes. */
export function gbToBytes(gb: number): number {
  return Math.round((gb ?? 0) * FILE_TRANSFER_GB);
}

/** A file size for people: «850 KB», «12.3 MB», «1.4 GB». */
export function formatFileTransferSize(bytes: number): string {
  const b = Math.max(0, bytes ?? 0);
  if (b < 1024 ** 2) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < FILE_TRANSFER_GB) return `${Math.round((b / 1024 ** 2) * 10) / 10} MB`;
  return `${bytesToGb(b)} GB`;
}

/**
 * Content types the server serves inline (mirror of INLINE_CONTENT_TYPES in
 * apps/functions/src/file-transfer/file-transfer-access.ts — keep both in step). Everything else
 * is offered as a download only, because the server would answer an inline request with one anyway.
 */
export const FILE_TRANSFER_INLINE_TYPES: ReadonlySet<string> = new Set([
  'video/mp4', 'video/quicktime', 'video/webm',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/avif',
  'application/pdf',
]);

/** Normalised like the server's inlineContentType(): lowercased, parameters cut at `;`, trimmed. */
function normaliseContentType(raw: string): string {
  if (typeof raw !== 'string' || raw.includes(',')) return '';
  return raw.toLowerCase().split(';')[0].trim();
}

export function isFileTransferInline(contentType: string): boolean {
  return FILE_TRANSFER_INLINE_TYPES.has(normaliseContentType(contentType));
}

export function isFileTransferVideo(contentType: string): boolean {
  return isFileTransferInline(contentType) && normaliseContentType(contentType).startsWith('video/');
}
