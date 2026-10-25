/**
 * Backfills the shared location avatars `avatars/location.<okey>` for every existing location:
 * the Gemeinde's coat of arms, else the canton's / Bundesland's, else the country's flag
 * (apps/functions/src/location/location-avatar.util.ts — the same code the onLocationWritten
 * trigger runs, so a later save of the location agrees with this run).
 *
 * Dry run is the DEFAULT; `--write` must be explicit. Hand-uploaded avatars are never touched.
 * Idempotent: an up-to-date avatar is skipped. Prints counts only.
 *
 * Usage (bundled first: the repo runs .ts scripts as ESM, where extension-less imports fail):
 *   pnpm exec esbuild scripts/backfill-location-avatars.ts --bundle --platform=node --packages=external \
 *     --format=cjs --outfile=dist/scripts/backfill-location-avatars.cjs
 *   node dist/scripts/backfill-location-avatars.cjs            # dry run
 *   node dist/scripts/backfill-location-avatars.cjs --write
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { loadLocationAvatarCatalog } from '../apps/functions/src/location/location-avatar.catalog';
import {
  ExistingAvatar, LocationLike, locationAvatarDocId, planLocationAvatar,
} from '../apps/functions/src/location/location-avatar.util';

const AVATARS = 'avatars';
const LOCATIONS = 'locations';

async function main(): Promise<void> {
  const isWrite = process.argv.includes('--write');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org', storageBucket: 'bkaiser-org.appspot.com' });
  const db = getFirestore();

  const catalog = await loadLocationAvatarCatalog();
  const [locations, avatars] = await Promise.all([
    db.collection(LOCATIONS).get(),
    db.collection(AVATARS).where('__name__', '>=', 'location.').where('__name__', '<', 'location.\uf8ff').get(),
  ]);
  const existing = new Map(avatars.docs.map((d) => [d.id, d.data() as ExistingAvatar]));

  const counts: Record<string, number> = {};
  const count = (key: string) => { counts[key] = (counts[key] ?? 0) + 1; };
  let batch = db.batch();
  let pending = 0;

  for (const doc of locations.docs) {
    const id = locationAvatarDocId(doc.id);
    const action = planLocationAvatar(doc.data() as LocationLike, existing.get(id), catalog);
    if (action.kind === 'set') {
      count(`set ${action.storagePath.split('/')[1]}`);
      batch.set(db.collection(AVATARS).doc(id), { tenants: ['system'], isArchived: false, storagePath: action.storagePath });
    } else if (action.kind === 'delete') {
      count('delete');
      batch.delete(db.collection(AVATARS).doc(id));
    } else {
      count(existing.has(id) ? 'skip (up to date or hand-uploaded)' : 'skip (no picture found)');
      continue;
    }
    if (++pending === 400 && isWrite) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending && isWrite) await batch.commit();

  console.log(`${isWrite ? 'WRITE' : 'DRY RUN'}: ${locations.size} locations`);
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k}: ${v}`);
  if (!isWrite) console.log('Nothing written. Re-run with --write to apply.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
