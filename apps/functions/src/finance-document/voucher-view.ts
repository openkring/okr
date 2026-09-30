/** At most this many vouchers are signed per call — a booking or bill carries a handful. */
export const MAX_VOUCHER_KEYS = 50;

/** A voucher as the client sees it — the signed `url` is added by the callable. */
export interface VoucherView { key: string; name: string; mimeType: string; size: number; path: string; }

export function validVoucherKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return [...new Set(keys.filter((k): k is string => typeof k === 'string' && k.length > 0))].slice(0, MAX_VOUCHER_KEYS);
}

/** The view of one finance-documents doc, or null when it is missing, pathless or of another tenant. */
export function voucherView(key: string, data: Record<string, unknown> | undefined, tenantIds: string[]): VoucherView | null {
  const tenants = (data?.['tenants'] as string[] | undefined) ?? [];
  const path = String(data?.['fullPath'] ?? '');
  if (!data || !path || !tenants.some(t => tenantIds.includes(t))) return null;
  return {
    key,
    name: String(data['title'] || key),
    mimeType: String(data['mimeType'] ?? ''),
    size: Number(data['size'] ?? 0),
    path,
  };
}

/** imgix renders images (HEIC too) and the first page of a PDF; other files get no thumbnail. */
export function canThumbnail(mimeType: string): boolean {
  const m = (mimeType ?? '').toLowerCase();
  return m.startsWith('image/') || m === 'application/pdf';
}
