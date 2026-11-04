/**
 * MIGRATE `calevents.locationKey` TO `calevents.locations` — dry run by default, idempotent.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * WHY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * `locationKey` was a string with three shapes (`name@okey`, `okey@name`, free text), and every
 * reader parsed it its own way. `locations: AvatarInfo[]` replaces it; no code reads the old field
 * any more, so an event that is not migrated shows no location at all. All tenants, archived
 * events included. See `parseLocationKey` for how the shapes are told apart.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * ORDER
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   1. Release the apps and deploy the Cloud Functions.
 *   2. node scripts/migrate-calevent-locations.mjs --write
 *      Writes `locations` and the search index, and blanks `locationKey`.
 *   3. Once no client older than step 1 is left (raise `minVersion`, and mind the store builds):
 *      node scripts/migrate-calevent-locations.mjs --write --drop-field
 *      Deletes the blanked field.
 *
 * Why two steps: an old client pipes `locationKey` through string functions. A blank field shows
 * no location there; a missing one throws and takes the whole calendar list down. Re-run step 2
 * if somebody saved a location from an old client in between: it is picked up like any other.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SAFETY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   Dry run is the DEFAULT. --write must be explicit.
 *   Idempotent: a migrated event is skipped.
 *   Every --write logs each event's old value to a file in the temp directory (printed at the
 *   end), which is the way back. It names places, so keep it out of the repository.
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 *
 * Usage:
 *   node scripts/migrate-calevent-locations.mjs                       # dry run
 *   node scripts/migrate-calevent-locations.mjs --write
 *   node scripts/migrate-calevent-locations.mjs --drop-field          # dry run of step 3
 *   node scripts/migrate-calevent-locations.mjs --write --drop-field
 */
import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { planEvent } from './migrate-calevent-locations.logic.mjs';

const WRITE = process.argv.includes('--write');
const DROP_FIELD = process.argv.includes('--drop-field');
/** The kinds a human should read before writing. */
const REVIEW_KINDS = new Set(['conflict', 'name@deleted', 'deleted@name']);
const MAX_SAMPLES = 25;

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

async function main() {
  console.log(`\nMigrate calevents.locationKey → locations${WRITE ? '' : '  (DRY RUN — nothing is written)'}\n`);

  const locationDocs = await db.collection('locations').select('name', 'type').get();
  const knownLocations = new Map(locationDocs.docs.map((doc) => [doc.id, doc.data()]));
  const events = await db.collection('calevents').select('locationKey', 'locations', 'index').get();
  console.log(`  ${knownLocations.size} locations, ${events.size} calevents\n`);

  const rollbackFile = join(tmpdir(), `calevent-locations-rollback-${Date.now()}.jsonl`);
  const writer = WRITE ? db.bulkWriter() : undefined;
  const counts = {};
  const samples = {};

  for (const doc of events.docs) {
    const data = doc.data();
    const plan = planEvent(data, knownLocations, DROP_FIELD);
    if (!plan) { counts.unchanged = (counts.unchanged ?? 0) + 1; continue; }

    counts[plan.kind] = (counts[plan.kind] ?? 0) + 1;
    if (REVIEW_KINDS.has(plan.kind)) (samples[plan.kind] ??= []).push(`${doc.id}: ${data.locationKey}`);

    if (writer) {
      appendFileSync(rollbackFile, `${JSON.stringify({ okey: doc.id, locationKey: data.locationKey ?? null, index: data.index ?? null })}\n`);
      writer.update(doc.ref, {
        locationKey: plan.clearField === 'delete' ? FieldValue.delete() : '',
        ...(plan.locations ? { locations: plan.locations } : {}),
        ...(plan.index === undefined ? {} : { index: plan.index }),
      });
    }
  }
  await writer?.close();

  for (const [kind, count] of Object.entries(counts).sort()) console.log(`  ${kind.padEnd(14)} ${count}`);
  for (const [kind, list] of Object.entries(samples)) {
    console.log(`\n  ${kind} (${list.length}):`);
    list.slice(0, MAX_SAMPLES).forEach((line) => console.log(`    ${line}`));
    if (list.length > MAX_SAMPLES) console.log(`    … and ${list.length - MAX_SAMPLES} more`);
  }
  if (WRITE) console.log(`\n  old values: ${rollbackFile}`);
  console.log(WRITE ? '\nDone.\n' : '\nDry run. Nothing was written. Use --write to apply.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
