// Run: npx tsx scripts/extract-i18n-keys.ts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIBS_ROOT = path.join(__dirname, '..', 'libs');
const DE_JSON_PATH = path.join(__dirname, '..', 'apps', 'scs-app', 'src', 'assets', 'i18n', 'de.json');

// Matches any quoted string starting with @ that contains at least one dot
// Covers: 'key', "key", `key` — in both TS source and inline templates
const KEY_RE = /['"`](@[a-z][a-zA-Z0-9]*(?:[./][a-zA-Z0-9_]+)+)['"`]/g;

function walkTs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walkTs(full);
    if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) return [full];
    return [];
  });
}

// Returns the value at dotKey — may be a string (leaf) or an object (prefix for child keys).
function getNestedAny(obj: Record<string, unknown>, dotKey: string): unknown {
  let cursor: unknown = obj;
  for (const part of dotKey.split('.')) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function getNestedValue(obj: Record<string, unknown>, dotKey: string): string | undefined {
  const v = getNestedAny(obj, dotKey);
  return typeof v === 'string' ? v : undefined;
}

// Collect all dot-key → string pairs under an object (i.e. expand a prefix into its leaf keys)
function collectLeafs(obj: unknown, prefix: string, out: Record<string, string>): void {
  if (typeof obj === 'string') { out[prefix] = obj; return; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      collectLeafs(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
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
    // Skip npm-style scoped imports: first segment has / or - (e.g. @bk2/lib, @angular/core)
    if (firstSeg.includes('/') || firstSeg.includes('-')) continue;
    keys.add(raw);
  }
  return [...keys];
}

function countLeafs(obj: Record<string, unknown>): number {
  let n = 0;
  for (const v of Object.values(obj)) {
    if (typeof v === 'string') n++;
    else if (v && typeof v === 'object') n += countLeafs(v as Record<string, unknown>);
  }
  return n;
}

// Find all dirs that contain a src/lib subfolder, at any depth under LIBS_ROOT
function findLibDirs(dir: string, relBase: string): Array<{ module: string; srcLibDir: string }> {
  const results: Array<{ module: string; srcLibDir: string }> = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const hasLib = entries.some(e => e.isDirectory() && e.name === 'lib');
  if (hasLib && dir.endsWith('/src')) {
    // This is a src dir with a lib subdir — parent is the module root
    const moduleRoot = path.dirname(dir); // e.g. libs/chat/feature
    const module = path.relative(LIBS_ROOT, moduleRoot); // e.g. chat/feature
    results.push({ module, srcLibDir: path.join(dir, 'lib') });
    return results;
  }
  for (const e of entries) {
    // Skip i18n dirs only when they're children of `src/` (output dirs, not domain dirs like libs/i18n/)
    const skipI18n = e.name === 'i18n' && dir.endsWith('/src');
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'dist' && !skipI18n) {
      results.push(...findLibDirs(path.join(dir, e.name), relBase));
    }
  }
  return results;
}

function main(): void {
  const deJson = JSON.parse(fs.readFileSync(DE_JSON_PATH, 'utf-8')) as Record<string, unknown>;
  const modules = findLibDirs(LIBS_ROOT, LIBS_ROOT);
  const missing: Array<{ module: string; key: string }> = [];
  let written = 0;

  for (const { module, srcLibDir } of modules.sort((a, b) => a.module.localeCompare(b.module))) {
    const allKeys = new Set<string>();
    for (const f of walkTs(srcLibDir)) {
      for (const k of extractKeysFromFile(f)) allKeys.add(k);
    }
    if (allKeys.size === 0) continue;

    const nested: Record<string, unknown> = {};
    for (const key of allKeys) {
      const raw = getNestedAny(deJson, key);
      if (raw === undefined) {
        missing.push({ module, key });
      } else if (typeof raw === 'string') {
        setNestedValue(nested, key, raw);
      } else if (raw && typeof raw === 'object') {
        // Key is a prefix (e.g. @calevent.operation.create → object with .conf/.label/.error)
        // Include all leaf children so scoped files contain the runtime-accessed strings
        const leafs: Record<string, string> = {};
        collectLeafs(raw, '', leafs);
        for (const [subKey, val] of Object.entries(leafs)) {
          setNestedValue(nested, `${key}.${subKey}`, val);
        }
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
