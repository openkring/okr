#!/usr/bin/env node
/**
 * Erzeugt apps/bka-website/assets/gallery-data.js aus den Alben von bka-app.
 *
 * WARUM STATISCH: Die Bilder liegen auf imgix und sind ohnehin oeffentlich
 * abrufbar — die publicApi lieferte nur die LISTE der Pfade. Diese Liste ist
 * klein (rund 150 Eintraege) und aendert sich selten, also wird sie in die
 * Website gebacken statt bei jedem Seitenaufruf geholt. Das spart den
 * Funktionsaufruf, macht die Galerie unabhaengig von der Cloud Function und
 * laesst sie auch dann noch laufen, wenn die Funktion einmal nicht antwortet.
 *
 * DER PREIS: Ein Upload in bka-app erscheint NICHT von selbst auf der Website.
 * Nach neuen Bildern dieses Skript erneut laufen lassen und die Website neu
 * deployen:
 *
 *   node scripts/gen-bka-gallery.mjs
 *   pnpm nx deploy bka-website
 *
 * Das Skript braucht Application Default Credentials (`gcloud auth
 * application-default login`) und liest ausschliesslich — es schreibt nichts
 * nach Firestore.
 */

import { writeFileSync } from 'node:fs';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'bkaiser-org';
const TENANT = 'bka';
const OUT = 'apps/bka-website/assets/gallery-data.js';

/** Laenge des zufaelligen Praefix, das buildAlbumUploadPath vor den Dateinamen setzt. */
const UPLOAD_PREFIX = /^[0-9a-z]{8}-/;

/** Der Dateiname eines Dokuments: der Originalname, sonst der Pfad ohne Zufallspraefix. */
function fileNameOf(doc) {
  const segment = (doc.fullPath ?? '').split('/').pop() ?? '';
  return doc.title || segment.replace(UPLOAD_PREFIX, '');
}

/** Natuerliche Sortierung nach Dateiname: bild2 vor bild10, Gross-/Kleinschreibung egal. */
function byFileName(a, b) {
  return fileNameOf(a).localeCompare(fileNameOf(b), undefined, { numeric: true, sensitivity: 'base' });
}

function isImage(doc) {
  if ((doc.mimeType ?? '').startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|avif|gif|tiff?)$/i.test(doc.fullPath ?? '');
}

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

const folderSnap = await db.collection('folders').where('tenants', 'array-contains', TENANT).get();
const docSnap = await db.collection('docs').where('tenants', 'array-contains', TENANT).get();

const folders = folderSnap.docs.map((d) => ({ okey: d.id, ...d.data() }));
const documents = docSnap.docs
  .map((d) => d.data())
  .filter((d) => !d.isArchived && isImage(d) && !!d.fullPath);

const galleries = {};
for (const folder of folders) {
  if (folder.isArchived) continue;
  const images = documents
    .filter((doc) => (doc.folderKeys ?? []).includes(folder.okey))
    .sort(byFileName)
    .map((doc) => ({ path: doc.fullPath, title: fileNameOf(doc) }));
  // Ordner ohne Bilder sind Rubriken (natur, jahreszeiten) oder noch leer. Beide
  // gehoeren nicht in die Datei: site.js behandelt "kein Eintrag" bereits als
  // "Diese Galerie ist noch leer."
  if (images.length === 0) continue;
  galleries[folder.name] = {
    title: folder.title || folder.name,
    description: folder.description || '',
    images
  };
}

const total = Object.values(galleries).reduce((sum, g) => sum + g.images.length, 0);
const body = Object.entries(galleries)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([slug, g]) => {
    const images = g.images.map((i) => `      { path: ${JSON.stringify(i.path)}, title: ${JSON.stringify(i.title)} }`);
    return `    ${JSON.stringify(slug)}: {\n`
      + `      title: ${JSON.stringify(g.title)},\n`
      + `      description: ${JSON.stringify(g.description)},\n`
      + `      images: [\n${images.join(',\n')}\n      ]\n`
      + `    }`;
  });

const out = `/* ERZEUGT — nicht von Hand bearbeiten.
 * Quelle: die Alben von bka-app (Firestore folders/docs, Mandant ${TENANT}).
 * Neu erzeugen mit:  node scripts/gen-bka-gallery.mjs
 * ${Object.keys(galleries).length} Galerien, ${total} Bilder.
 */
window.BKA_GALLERY = {
  galleries: {
${body.join(',\n')}
  }
};
`;

writeFileSync(OUT, out);
console.log(`${OUT}: ${Object.keys(galleries).length} Galerien, ${total} Bilder`);
for (const [slug, g] of Object.entries(galleries)) console.log(`  ${slug.padEnd(14)} ${g.images.length}`);
