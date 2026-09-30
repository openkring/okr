/** A voucher (Beleg) as signFinanceDocuments returns it: a short-lived signed `url` to the private file. */
export interface Voucher { key: string; name: string; mimeType: string; size: number; url: string; }

/** Browser-renderable images show the file itself as thumbnail; everything else shows a file-type logo. */
const INLINE_IMAGES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml'];

export function voucherKind(mimeType: string): 'image' | 'pdf' | 'file' {
  const m = (mimeType ?? '').toLowerCase();
  if (INLINE_IMAGES.includes(m)) return 'image';
  if (m === 'application/pdf') return 'pdf';
  return 'file';
}
