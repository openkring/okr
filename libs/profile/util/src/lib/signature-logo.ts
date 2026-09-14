/**
 * Resolve the org logo shown in the email signature (spec §5).
 *
 * The logo is **not** configured in code. It is, in order of preference:
 *
 * 1. the **default org's avatar** (`avatars/org.{tenantId}`) — uploaded through the org edit
 *    modal's avatar toolbar, so an admin can change the signature logo without a deploy;
 * 2. **`logo-master.png`**, the raster `pnpm logo:gen` writes next to the tenant's icon master;
 * 3. the tenant's **`appConfig.logoUrl`** itself, when it is already a raster — a guard for a
 *    malformed path without a directory, not a route a well-formed tenant ever takes;
 * 4. nothing — the signature then renders without a logo rather than with a broken image.
 *
 * **Why `logoUrl` itself is not enough.** Two independent reasons, either one disqualifying:
 * imgix passes SVG through unprocessed (verified 2026-08-25 — `fm=png` does not rasterize
 * `logo_round.svg`, the response stays `image/svg+xml`), and Outlook for Windows renders mail
 * through Word, which cannot display SVG at all. Six of the eight tenants have an SVG master,
 * so for them step 3 is dead and this used to mean *no signature logo at all* unless an org
 * avatar happened to exist — silently.
 *
 * Step 2 closes that gap. `logo-master.png` is a plain 1024² PNG that `logo:gen` uploads into
 * the SAME directory as the master, so its path is derivable from `logoUrl` alone. It exists
 * for every tenant that has been through `logo:gen`; a tenant provisioned but never generated
 * has neither, and falls through to step 4 as before.
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

/** The raster `pnpm logo:gen` writes beside the icon master; see `scripts/gen-logo-assets.mjs`. */
const GENERATED_MASTER_RASTER = 'logo-master.png';

/**
 * `tenant/scs/logo/scs-logo.svg` -> `tenant/scs/logo/logo-master.png`.
 * Returns '' when the path carries no directory, so a malformed `logoUrl` cannot produce a
 * bare `logo-master.png` at the bucket root.
 */
export function toGeneratedMasterRaster(configLogoUrl: string | null | undefined): string {
  const path = (configLogoUrl ?? '').split('?')[0].trim().replace(/^\/+/, '');
  const slash = path.lastIndexOf('/');
  return slash <= 0 ? '' : `${path.slice(0, slash)}/${GENERATED_MASTER_RASTER}`;
}

/**
 * Build the absolute imgix URL for the signature logo, or `undefined` when the tenant has no
 * usable logo (the template then omits the image entirely).
 *
 * @param imgixBaseUrl  `env.services.imgixBaseUrl`, e.g. `https://bkaiser.imgix.net`
 * @param avatarStoragePath  the default org's avatar `storagePath`, or null/'' when it has none
 * @param configLogoUrl  `appConfig.logoUrl` — an imgix-relative path; the generated
 *                       `logo-master.png` beside it is preferred over the path itself
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
  // 2. the generated raster beside the icon master — works for an SVG master too
  const generated = toGeneratedMasterRaster(configLogoUrl);
  // 3. the configured tenant logo itself, raster only
  const config = (configLogoUrl ?? '').trim();
  const path = avatar || generated || (config && !isVectorImagePath(config) ? config : '');
  if (!path) return undefined;

  return `${base}/${path.replace(/^\/+/, '')}?${SIGNATURE_LOGO_IMGIX_PARAMS}`;
}
