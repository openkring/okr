// Run: npx tsx scripts/extract-i18n-keys.ts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIBS_ROOT = path.join(__dirname, '..', 'libs');
const DE_JSON_PATH = path.join(__dirname, '..', 'apps', 'scs-app', 'src', 'assets', 'i18n', 'de.json');

const KEY_RE = /['"`](@[a-z][a-zA-Z0-9]*(?:[./][a-zA-Z0-9_]+)+)['"`]/g;

function walkTs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walkTs(full);
    return e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') ? [full] : [];
  });
}

function getNestedValue(obj: Record<string, unknown>, dotKey: string): string | undefined {
  let cursor: unknown = obj;
  for (const part of dotKey.split('.')) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === 'string' ? cursor : undefined;
}

function setNestedValue(obj: Record<string, unknown>, dotKey: string, value: string): void {
  const parts = dotKey.split('.');
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cursor[parts[i]]) cursor[parts[i]] = {};
    cursor = cursor[parts[i]] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

function extractKeysFromFile(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const keys = new Set<string>();
  let m: RegExpExecArray | null;
  KEY_RE.lastIndex = 0;
  while ((m = KEY_RE.exec(content)) !== null) {
    const raw = m[1].substring(1); // strip leading @
    const firstSeg = raw.split('.')[0];
    // Skip npm-style imports: first segment has / or - (e.g. @bk2/lib, @angular/core)
    if (firstSeg.includes('/') || firstSeg.includes('-')) continue;
    keys.add(raw);
  }
  return [...keys];
}

function countLeafs(obj: Record<string, unknown>): number {
  let count = 0;
  for (const v of Object.values(obj)) {
    if (typeof v === 'string') count++;
    else if (v && typeof v === 'object') count += countLeafs(v as Record<string, unknown>);
  }
  return count;
}

function main(): void {
  const deJson = JSON.parse(fs.readFileSync(DE_JSON_PATH, 'utf-8')) as Record<string, unknown>;

  // Discover all domain/layer dirs that have a src/lib subfolder
  const modules: Array<{ module: string; srcLibDir: string }> = [];
  for (const domain of fs.readdirSync(LIBS_ROOT)) {
    const domainDir = path.join(LIBS_ROOT, domain);
    if (!fs.statSync(domainDir).isDirectory()) continue;
    for (const layer of fs.readdirSync(domainDir)) {
      const layerDir = path.join(domainDir, layer);
      if (!fs.statSync(layerDir).isDirectory()) continue;
      const srcLib = path.join(layerDir, 'src', 'lib');
      if (fs.existsSync(srcLib)) {
        modules.push({ module: `${domain}/${layer}`, srcLibDir: srcLib });
      }
    }
  }

  const missing: Array<{ module: string; key: string }> = [];
  let written = 0;

  for (const { module, srcLibDir } of modules) {
    const allKeys = new Set<string>();
    for (const f of walkTs(srcLibDir)) {
      for (const k of extractKeysFromFile(f)) allKeys.add(k);
    }
    if (allKeys.size === 0) continue;

    const nested: Record<string, unknown> = {};
    for (const key of allKeys) {
      const value = getNestedValue(deJson, key);
      if (value !== undefined) {
        setNestedValue(nested, key, value);
      } else {
        missing.push({ module, key });
      }
    }

    if (Object.keys(nested).length === 0) continue;

    const outputPath = path.join(LIBS_ROOT, module, 'src', 'i18n', 'de.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(nested, null, 2) + '\n', 'utf-8');
    console.log(`  libs/${module}/src/i18n/de.json  (${countLeafs(nested)} leaf keys)`);
    written++;
  }

  if (missing.length > 0) {
    console.log('\nKeys not found in de.json:');
    for (const { module, key } of missing) {
      console.log(`  [${module}] @${key}`);
    }
  }

  console.log(`\nDone — ${written} module files written.`);
}

main();
