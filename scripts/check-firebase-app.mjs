#!/usr/bin/env node
/**
 * Client code must use the Firebase app of this start (spec 1.179): `activeFirebaseApp()`, never the
 * default app. In the iOS portal the app is named after the tenant and no default app exists, so
 * `getApp()` and every Firebase getter called without an app (`getFirestore()`, `getStorage()`,
 * `getAuth()`, `getFunctions()`, `getMessaging()`) throws «No Firebase App '[DEFAULT]'» there — while
 * every tenant app keeps working, which is why such a call slips through builds and tests.
 *
 * Scans libs/ and apps/*-app/src (TypeScript, specs excluded). Server code that uses firebase-admin,
 * where a no-argument getter is right, is skipped (libs/shared/util-functions, apps/functions).
 *
 *   node scripts/check-firebase-app.mjs      exit 1 on a finding
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const SKIP = ['libs/shared/util-functions/', 'apps/functions/', 'node_modules/', 'libs/shared/config/src/lib/firebase-app.ts'];
const CALL = /\b(getApp|getFirestore|getStorage|getAuth|getFunctions|getMessaging)\(\s*\)/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) yield p;
  }
}

const roots = [join(ROOT, 'libs'), ...readdirSync(join(ROOT, 'apps')).filter((d) => d.endsWith('-app')).map((d) => join(ROOT, 'apps', d, 'src'))];
const findings = [];
for (const root of roots) {
  let files;
  try { files = [...walk(root)]; } catch { continue; } // an app submodule may be absent
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (SKIP.some((s) => rel.startsWith(s) || rel === s)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').trim();
      if (code.startsWith('*') || code.startsWith('/*')) return;
      if (CALL.test(code)) findings.push(`${rel}:${i + 1}  ${code}`);
    });
  }
}
if (findings.length) {
  console.error(`check-firebase-app: ${findings.length} call(s) to the default Firebase app — use activeFirebaseApp() (spec 1.179):`);
  findings.forEach((f) => console.error(`  ${f}`));
  process.exit(1);
}
console.log('check-firebase-app: ok');
