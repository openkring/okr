/**
 * Resolve the org logo shown in the email signature (spec §5).
 *
 * The logo is **not** configured in code. It is, in order of preference:
 *
 * 1. the **default org's avatar** (`avatars/org.{tenantId}`) — uploaded through the org edit
 *    modal's avatar toolbar, so an admin can change the signature logo without a deploy;
 * 2. the tenant's **`appConfig.logoUrl`**, but only when it is a raster image;
 * 3. nothing — the signature then renders without a logo rather than with a broken image.
 *
 * **Why SVG is skipped in step 2.** Two independent reasons, either one disqualifying:
 * imgix passes SVG through unprocessed (verified 2026-08-25 — `fm=png` does not rasterize
 * `logo_round.svg`, the response stays `image/svg+xml`), and Outlook for Windows renders mail
 * through Word, which cannot display SVG at all. A tenant whose `logoUrl` is an SVG therefore
 * needs an org avatar; there is no way to derive a usable raster from it here.
 */

/**
 * imgix params for the signature logo.
 *
 * `fit=fill` + a white pad squares the image off instead of squashing it: the template emits a
 * fixed `width="50" height="50"`, so a wide logo returned by `fit=clip` would be stretched.
 * Signatures sit on white, so the pad is invisible. `dpr=2` covers retina; `fm=png` keeps the
 * pad lossless (JPEG would ring around a logo's hard edges).
 */
export const SIGNATURE_LOGO_IMGIX_PARAMS = 'w=50&h=50&fit=fill&fill=solid&fill-color=FFFFFF&fm=png&dpr=2';

/** Extensions imgix cannot rasterize and/or Outlook cannot render — never usable in a signature. */
const VECTOR_EXTENSIONS = ['.svg', '.svgz'];

/** True when the path is a vector image, i.e. unusable as a signature logo. See the file header. */
export function isVectorImagePath(path: string): boolean {
  const withoutQuery = (path ?? '').split('?')[0].trim().toLowerCase();
  return VECTOR_EXTENSIONS.some((ext) => withoutQuery.endsWith(ext));
}

/**
 * Build the absolute imgix URL for the signature logo, or `undefined` when the tenant has no
 * usable logo (the template then omits the image entirely).
 *
 * @param imgixBaseUrl  `env.services.imgixBaseUrl`, e.g. `https://bkaiser.imgix.net`
 * @param avatarStoragePath  the default org's avatar `storagePath`, or null/'' when it has none
 * @param configLogoUrl  `appConfig.logoUrl` — an imgix-relative path, used only if it is a raster
 */
export function buildSignatureLogoUrl(
  imgixBaseUrl: string,
  avatarStoragePath: string | null | undefined,
  configLogoUrl: string | null | undefined,
): string | undefined {
  const base = (imgixBaseUrl ?? '').trim().replace(/\/+$/, '');
  if (!base) return undefined;

  // 1. the default org's avatar — always an uploaded raster, and user-editable
  const avatar = (avatarStoragePath ?? '').trim();
  // 2. the configured tenant logo, raster only
  const config = (configLogoUrl ?? '').trim();
  const path = avatar || (config && !isVectorImagePath(config) ? config : '');
  if (!path) return undefined;

  return `${base}/${path.replace(/^\/+/, '')}?${SIGNATURE_LOGO_IMGIX_PARAMS}`;
}
