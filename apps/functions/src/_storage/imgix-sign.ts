import { createHash } from 'node:crypto';

/** The private imgix source (spec 1.74): reads only the private bucket, accepts only signed URLs. */
export const IMGIX_PRIVATE_HOST = 'bkaiser-private.imgix.net';

/**
 * imgix Secure URL: `s = md5(token + path + '?' + query)` (bare path when there is no query),
 * appended as the last parameter. Put `expires` (unix seconds) into `params` to make it expire.
 * The path is percent-encoded per segment exactly as it appears in the final URL.
 */
export function signImgixUrl(host: string, token: string, path: string, params: Record<string, string | number>): string {
  if (!token) throw new Error('signImgixUrl: no signing token');
  const encodedPath = '/' + path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  const query = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  const signature = createHash('md5').update(token + encodedPath + (query ? `?${query}` : '')).digest('hex');
  return `https://${host}${encodedPath}?${query ? `${query}&` : ''}s=${signature}`;
}
