/** What a map pin shows: a label and, optionally, a small image (e.g. a webcam's current still). */
export interface PinMarker {
  lat?: number;
  lng?: number;
  title?: string;
  /** http(s) or data:image URL; anything else is dropped and the plain label pin is drawn */
  imageUrl?: string;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for HTML content and double-quoted attributes. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * The divIcon HTML of an `okr-leaflet-map` pin. Without `imageUrl`: the classic marker + label. With it:
 * the `location` icon (`iconUrl`), a 64×36 thumbnail and the label. An http(s) thumbnail gets
 * `ngsw-bypass=true` so the Angular service worker does not refuse a host its connect-src lacks.
 */
export function pinHtml(marker: PinMarker, fallbackLabel: string, iconUrl: string): string {
  const label = escapeHtml(marker.title || fallbackLabel);
  const image = safeImageUrl(marker.imageUrl);
  if (!image) {
    return `<div class="okr-pin"><div class="okr-pin-marker"></div><div class="okr-pin-label">${label}</div></div>`;
  }
  const icon = iconUrl ? `<img class="okr-pin-icon" src="${escapeHtml(iconUrl)}" alt="" />` : '';
  return `<div class="okr-pin okr-pin-image">${icon}<img class="okr-pin-thumb" src="${escapeHtml(image)}" alt="" referrerpolicy="no-referrer" />`
    + `<div class="okr-pin-label">${label}</div></div>`;
}

function safeImageUrl(url: string | undefined): string {
  const u = (url ?? '').trim();
  if (/^data:image\//i.test(u)) return u;
  if (!/^https?:\/\//i.test(u)) return '';
  try {
    const parsed = new URL(u);
    if (!parsed.searchParams.has('ngsw-bypass')) parsed.searchParams.set('ngsw-bypass', 'true');
    return parsed.toString();
  } catch {
    return '';
  }
}
