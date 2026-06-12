import { VcardExportResponse } from '@bk2/vcard-util';

/**
 * Trigger the browser download for a vCard export response (spec §8).
 * Large exports arrive as a signed Storage `downloadUrl`; small exports inline as
 * base64. On iOS Safari the download opens the share/import sheet directly, which
 * is the intended Apple Contacts hand-off.
 */
export function downloadVcfResponse(res: VcardExportResponse): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (res.downloadUrl) {
    window.location.assign(res.downloadUrl);
    return;
  }
  if (!res.vcardBase64) return;
  const bytes = Uint8Array.from(atob(res.vcardBase64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = res.filename;
  a.click();
  URL.revokeObjectURL(url);
}
