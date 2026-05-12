// Run: source ./apps/scs-app/.env && ts-node -P scripts/tsconfig.json scripts/export-i18n.ts
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const LANGS = ['de', 'en', 'fr', 'es', 'it'];

admin.initializeApp({ projectId: process.env['FIREBASE_PROJECT_ID'] });

async function exportI18n(): Promise<void> {
  const db = admin.firestore();
  const snap = await db.collection('i18nDefault')
    .where('isArchived', '==', false)
    .get();

  const byModule = new Map<string, Map<string, Record<string, string>>>();
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, string | boolean>;
    const { module, key } = d as { module: string; key: string };
    if (!byModule.has(module)) byModule.set(module, new Map());
    const langMap = byModule.get(module)!;
    for (const lang of LANGS) {
      if (!langMap.has(lang)) langMap.set(lang, {});
      const value = d[lang] as string | undefined;
      if (value) langMap.get(lang)![key] = value;
    }
  }

  for (const [module, langMap] of byModule) {
    for (const [lang, flatKeys] of langMap) {
      const nested = toNested(flatKeys);
      const outputPath = module === 'app'
        ? path.join('apps', 'scs-app', 'src', 'assets', 'i18n', 'app', `${lang}.json`)
        : path.join('libs', module, 'src', 'i18n', `${lang}.json`);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(nested, null, 2) + '\n', 'utf-8');
      console.log(`Written: ${outputPath}`);
    }
  }
}

function toNested(flat: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [dotKey, value] of Object.entries(flat)) {
    const parts = dotKey.split('.');
    let cursor = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cursor[parts[i]]) cursor[parts[i]] = {};
      cursor = cursor[parts[i]] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]] = value;
  }
  return result;
}

exportI18n().catch(err => { console.error(err); process.exit(1); });
