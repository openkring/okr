import '@angular/compiler'; // JIT fallback: the shared-util-core barrel transitively pulls @angular/common
import { describe, expect, it } from 'vitest';

import { buildSignatureLogoUrl, isVectorImagePath, SIGNATURE_LOGO_IMGIX_PARAMS } from './signature-logo';

const BASE = 'https://bkaiser.imgix.net';
const AVATAR = 'tenant/scs/org/scs/avatar/1741870634635.png';
const CONFIG_PNG = 'tenant/elab/logo/logo.png';
const CONFIG_SVG = 'tenant/scs/logo/logo_round.svg';

describe('isVectorImagePath', () => {
  it('detects svg regardless of case', () => {
    expect(isVectorImagePath('a/b/logo.svg')).toBe(true);
    expect(isVectorImagePath('a/b/LOGO.SVG')).toBe(true);
    expect(isVectorImagePath('a/b/logo.svgz')).toBe(true);
  });
  it('ignores a query string when checking the extension', () => {
    expect(isVectorImagePath('a/b/logo.svg?w=50')).toBe(true);
    expect(isVectorImagePath('a/b/logo.png?fm=svg')).toBe(false);
  });
  it('treats raster formats as usable', () => {
    expect(isVectorImagePath('a/b/logo.png')).toBe(false);
    expect(isVectorImagePath('a/b/logo.jpg')).toBe(false);
    expect(isVectorImagePath('')).toBe(false);
  });
});

describe('buildSignatureLogoUrl', () => {
  it('prefers the org avatar over the configured logo', () => {
    const url = buildSignatureLogoUrl(BASE, AVATAR, CONFIG_PNG);
    expect(url).toBe(`${BASE}/${AVATAR}?${SIGNATURE_LOGO_IMGIX_PARAMS}`);
  });

  it('falls back to a raster appConfig logo when the org has no avatar', () => {
    expect(buildSignatureLogoUrl(BASE, null, CONFIG_PNG)).toBe(`${BASE}/${CONFIG_PNG}?${SIGNATURE_LOGO_IMGIX_PARAMS}`);
    expect(buildSignatureLogoUrl(BASE, '', CONFIG_PNG)).toBe(`${BASE}/${CONFIG_PNG}?${SIGNATURE_LOGO_IMGIX_PARAMS}`);
  });

  // imgix passes SVG through unprocessed and Outlook/Word cannot render it — an SVG logoUrl
  // is never usable, so such a tenant gets no logo rather than a broken one.
  it('refuses an svg appConfig logo', () => {
    expect(buildSignatureLogoUrl(BASE, null, CONFIG_SVG)).toBeUndefined();
  });

  it('still uses the avatar when the configured logo is an svg', () => {
    expect(buildSignatureLogoUrl(BASE, AVATAR, CONFIG_SVG)).toBe(`${BASE}/${AVATAR}?${SIGNATURE_LOGO_IMGIX_PARAMS}`);
  });

  it('returns undefined when there is no usable source at all', () => {
    expect(buildSignatureLogoUrl(BASE, null, null)).toBeUndefined();
    expect(buildSignatureLogoUrl(BASE, '', '')).toBeUndefined();
    expect(buildSignatureLogoUrl(BASE, undefined, undefined)).toBeUndefined();
  });

  it('returns undefined without an imgix base url', () => {
    expect(buildSignatureLogoUrl('', AVATAR, CONFIG_PNG)).toBeUndefined();
  });

  it('does not double the slash between base and path', () => {
    expect(buildSignatureLogoUrl(`${BASE}/`, `/${AVATAR}`, null)).toBe(`${BASE}/${AVATAR}?${SIGNATURE_LOGO_IMGIX_PARAMS}`);
  });

  it('squares the logo off with a white pad rather than clipping it', () => {
    // the template emits a fixed 50x50 <img>, so a wide logo must be padded, not stretched
    expect(SIGNATURE_LOGO_IMGIX_PARAMS).toContain('fit=fill');
    expect(SIGNATURE_LOGO_IMGIX_PARAMS).toContain('fill-color=FFFFFF');
  });
});
