import { getMimeType } from '@okr/shared-util-core';

/** A voucher (Beleg) as signFinanceDocuments returns it: a short-lived signed `url` to the private file. */
/** `thumbnailUrl`: signed imgix thumbnail (images, a PDF's first page), '' when the file has none. */
export interface Voucher { key: string; name: string; mimeType: string; size: number; url: string; thumbnailUrl?: string; }

/** Browser-renderable images show the file itself as thumbnail; everything else shows a file-type logo. */
const INLINE_IMAGES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml'];

export function voucherKind(mimeType: string): 'image' | 'pdf' | 'file' {
  const m = (mimeType ?? '').toLowerCase();
  if (INLINE_IMAGES.includes(m)) return 'image';
  if (m === 'application/pdf') return 'pdf';
  return 'file';
}

/** Tile image: the signed thumbnail, else the original for an inline image, else the file-type logo. */
export function voucherTileImage(v: Voucher, logoUrl: string): { imageUrl: string; isLogo: boolean } {
  if (v.thumbnailUrl) return { imageUrl: v.thumbnailUrl, isLogo: false };
  if (voucherKind(v.mimeType) === 'image') return { imageUrl: v.url, isLogo: false };
  return { imageUrl: logoUrl, isLogo: true };
}

/** The file types a Beleg may have — same list as the server's BOOKING_VOUCHER_MIME_TYPES (booking-voucher.util.ts). */
export const BOOKING_VOUCHER_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
/** The file dialog's accept list: HEIC by extension too, a browser that cannot decode it reports no type. */
export const BOOKING_VOUCHER_ACCEPT = [...BOOKING_VOUCHER_MIME_TYPES, '.heic', '.heif'].join(',');

/** Whether a picked or dropped file may become a Beleg; decided by the extension, as the server does. */
export function isBookingVoucherFile(file: Pick<File, 'name'>): boolean {
  return BOOKING_VOUCHER_MIME_TYPES.includes(getMimeType(file.name));
}
