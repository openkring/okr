import { TileImageFit } from '@okr/shared-models';

/**
 * The picture of an image tile (spec 1.165 §10.1) as an imgix url: a storage path is served from
 * imgix, an https url is passed through; both get the card size. 'cover' crops to the card (photo),
 * 'contain' keeps the whole picture (logo). Anything else — no value, another scheme, a path that
 * climbs up — gives '' and the tile shows no picture. Same rule as the website mapper (tileImageSrc).
 */
export function tileImageUrl(raw: string | undefined, fit: TileImageFit | undefined, imgixBaseUrl: string): string {
  const path = (raw ?? '').trim();
  if (!path) return '';
  const params = fit === 'contain' ? 'w=640&h=480&fit=max&auto=format,compress' : 'w=640&h=480&fit=crop&auto=format,compress';
  if (/^https:\/\//.test(path)) return `${path}${path.includes('?') ? '&' : '?'}${params}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9/_. -]*$/.test(path) || path.includes('..')) return '';
  return `${imgixBaseUrl}/${path.split('/').map(encodeURIComponent).join('/')}?${params}`;
}
