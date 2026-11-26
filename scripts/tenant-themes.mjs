#!/usr/bin/env node
/**
 * Copies every tenant app's Ionic theme to dist/tenant-themes/<tenantId>.css (spec 1.179, phase 1).
 *
 * A runtime-tenant build (the iOS portal) cannot compile one tenant's theme in; it loads
 * assets/tenant-themes/<tenantId>.css at start instead (loadTenantTheme in @okr/shared-config).
 * The source stays apps/<tenant>-app/src/theme/variables.scss, which is plain CSS today. The script
 * refuses Sass syntax rather than serve a file a browser cannot read.
 *
 *   node scripts/tenant-themes.mjs
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const OUT = join(ROOT, 'dist', 'tenant-themes');
const SASS = /@use\b|@import\b|@include\b|@mixin\b|#\{|^\s*\$[\w-]+\s*:/m;

mkdirSync(OUT, { recursive: true });
const written = [];
for (const dir of readdirSync(join(ROOT, 'apps')).filter((d) => d.endsWith('-app')).sort()) {
  const src = join(ROOT, 'apps', dir, 'src/theme/variables.scss');
  if (!existsSync(src)) continue;
  const css = readFileSync(src, 'utf8');
  if (SASS.test(css)) {
    console.error(`tenant-themes: ${src} uses Sass syntax; it cannot be served as CSS.`);
    process.exit(1);
  }
  const tenant = dir.replace(/-app$/, '');
  writeFileSync(join(OUT, `${tenant}.css`), css);
  written.push(tenant);
}
console.log(`tenant-themes: ${written.length} themes → dist/tenant-themes (${written.join(', ')})`);
