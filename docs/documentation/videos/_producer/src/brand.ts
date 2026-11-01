import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Brand } from './types';

const IMGIX_BASE = 'https://bkaiser.imgix.net';

/** Fallback colours (Seeclub Stäfa) when a tenant has no brand.json. */
const DEFAULT_COLORS = { primary: '#009D53', secondary: '#014DA2' };

/**
 * Resolve a tenant's branding, applied to every video by default:
 *  - colours: `videos/<tenant>/brand.json` (primary/secondary), else defaults
 *  - logo:    always `…/tenant/<tenant>/logo/logo.svg` on imgix, downloaded
 *             once into public/ so Remotion can render it via staticFile.
 */
export async function loadBrand(
  tenant: string,
  videosRoot: string,
  publicDir: string,
): Promise<Brand> {
  let name = tenant;
  let colors = { ...DEFAULT_COLORS };

  const brandJson = join(videosRoot, tenant, 'brand.json');
  if (existsSync(brandJson)) {
    try {
      const j = JSON.parse(readFileSync(brandJson, 'utf8'));
      if (typeof j.primary === 'string' && typeof j.secondary === 'string') {
        colors = { primary: j.primary, secondary: j.secondary };
      }
      if (typeof j.name === 'string') name = j.name;
    } catch {
      /* malformed brand.json → keep defaults */
    }
  }

  const logoUrl = `${IMGIX_BASE}/tenant/${tenant}/logo/logo.svg`;
  const destRel = `${tenant}/brand/logo.svg`;
  const destAbs = join(publicDir, destRel);
  let logo: string | null = null;
  try {
    mkdirSync(join(publicDir, tenant, 'brand'), { recursive: true });
    const res = await fetch(logoUrl);
    if (res.ok) {
      writeFileSync(destAbs, Buffer.from(await res.arrayBuffer()));
      logo = destRel;
    } else {
      console.warn(`  ⚠ logo fetch ${res.status} for ${logoUrl}`);
    }
  } catch (e) {
    console.warn(`  ⚠ could not fetch logo (${logoUrl}): ${(e as Error).message}`);
  }

  return { name, primary: colors.primary, secondary: colors.secondary, logo };
}
