import '@angular/compiler'; // JIT fallback: the shared-util-core barrel transitively pulls @angular/common
import { describe, expect, it } from 'vitest';

import {
  buildSignatureLogoUrl,
  isVectorImagePath,
  SIGNATURE_LOGO_IMGIX_PARAMS,
  toGeneratedMasterRaster,
} from './signature-logo';

const BASE = 'https://bkaiser.imgix.net';
const AVATAR = 'tenant/scs/org/scs/avatar/1741870634635.png';
const CONFIG_PNG = 'tenant/elab/logo/logo.png';
const CONFIG_SVG = 'tenant/scs/logo/scs-logo.svg';
const SCS_GENERATED = 'tenant/scs/logo/logo-master.png';
const ELAB_GENERATED = 'tenant/elab/logo/logo-master.png';

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

describe('toGeneratedMasterRaster', () => {
  it('replaces the master filename with the generated raster', () => {
    expect(toGeneratedMasterRaster('tenant/scs/logo/scs-logo.svg')).toBe(SCS_GENERATED);
    expect(toGeneratedMasterRaster('tenant/kwa/logo/logo_square.svg')).toBe('tenant/kwa/logo/logo-master.png');
  });
  it('ignores a query string and a leading slash', () => {
    expect(toGeneratedMasterRaster('/tenant/scs/logo/scs-logo.svg?w=50')).toBe(SCS_GENERATED);
  });
  it('returns empty when there is no directory to anchor on', () => {
    expect(toGeneratedMasterRaster('logo.svg')).toBe('');
    expect(toGeneratedMasterRaster('')).toBe('');
    expect(toGeneratedMasterRaster(null)).toBe('');
    expect(toGeneratedMasterRaster(undefined)).toBe('');
  });
});

describe('buildSignatureLogoUrl', () => {
  it('prefers the org avatar over the configured logo', () => {
    const url = buildSignatureLogoUrl(BASE, AVATAR, CONFIG_PNG);
    expect(url).toBe(`${BASE}/${AVATAR}?${SIGNATURE_LOGO_IMGIX_PARAMS}`);
  });

  it('falls back to the generated raster beside the master when the org has no avatar', () => {
    expect(buildSignatureLogoUrl(BASE, null, CONFIG_PNG)).toBe(`${BASE}/${ELAB_GENERATED}?${SIGNATURE_LOGO_IMGIX_PARAMS}`);
    expect(buildSignatureLogoUrl(BASE, '', CONFIG_PNG)).toBe(`${BASE}/${ELAB_GENERATED}?${SIGNATURE_LOGO_IMGIX_PARAMS}`);
  });

  // The whole point of the change: six of eight tenants have an SVG master, and used to end up
  // with no signature logo at all unless somebody had uploaded an org avatar.
  it('uses the generated raster even when the master is an svg', () => {
    expect(buildSignatureLogoUrl(BASE, null, CONFIG_SVG)).toBe(`${BASE}/${SCS_GENERATED}?${SIGNATURE_LOGO_IMGIX_PARAMS}`);
  });

  // imgix passes SVG through unprocessed and Outlook/Word cannot render it, so the raw path is
  // never used directly. Without a directory there is nothing to derive, hence no logo.
  it('refuses a bare svg filename with no directory to derive from', () => {
    expect(buildSignatureLogoUrl(BASE, null, 'logo.svg')).toBeUndefined();
  });

  it('prefers the avatar over the generated raster', () => {
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
