import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

/** One gigabyte as the limits count it (binary, like DEFAULT_FILE_TRANSFER_LIMITS). */
export const FILE_TRANSFER_GB = 1024 ** 3;

/**
 * Decimals the limits form keeps: enough that a small stored limit (50 MB = 0.0488 GB) neither
 * shows as 0 nor fails the `positive` rule when the form is reopened and saved again.
 */
export const FILE_TRANSFER_GB_DECIMALS = 4;

/** Bytes → GB, rounded to `decimals` (default one: 1 GB → 1, 1.5 GB → 1.5). */
export function bytesToGb(bytes: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(((bytes ?? 0) / FILE_TRANSFER_GB) * factor) / factor;
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

/**
 * The expiry of a transfer for people, in the viewer's local wall-clock time: «d.M.yyyy HH:mm».
 * `expiresAt` is a UTC ISO timestamp; '' when it is missing or unreadable.
 */
export function formatFileTransferExpiry(expiresAt: string | undefined): string {
  const d = new Date(expiresAt ?? '');
  if (!expiresAt || Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return convertDateFormatToString(local, DateFormat.IsoDateTime, DateFormat.ViewDateTime, false);
}
