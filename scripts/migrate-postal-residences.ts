/**
 * MIGRATE POSTAL ADDRESSES TO SHARED REGISTER LOCATIONS (spec 1.164 §7.2) — dry run by default, idempotent.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * WHY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * A postal row now points at a register location (`locations`, tenants ['address-register'],
 * deduplicated by the swisstopo EGAID) and is shared by all clubs of its person or org. Existing rows
 * carry only inline text. For every active postal row this run:
 *   - geocodes Swiss addresses via swisstopo (throttled + cached by the shared client) and links an
 *     exact hit to its register location (found or created); abroad gets a manual location;
 *     ambiguous hits and misses are NOT linked, only listed in the report;
 *   - sets `locationKey`, `validFrom = ''`, `validTo = ''`;
 *   - resolves conflicts per parent and `addressUsage` (home vs work never conflict): the most
 *     recently updated row (Firestore updateTime) wins; the others — another location, or the same
 *     location from another tenant — get `isArchived = true` and the note
 *     «Migration 1.164: ersetzt durch …». Nothing is deleted;
 *   - widens the winners' `tenants` to the parent's tenants (only when the row shares one with the
 *     parent; a row sharing none is left untouched and listed under foreignTenants);
 *   - keeps at most one favorite postal row per parent (a winner takes over its loser's favorite);
 *   - writes one summary task «Adressen ersetzt (Migration)» per losing tenant per memberAdmin.
 * The logic lives in apps/functions/src/address/migrate-postal-residences.ts (unit-tested).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * ORDER
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   1. Deploy the server side of 1.164: rules, the onAddressChange heal, the residence tenants
 *      sync, the daily switch job, the location callables.
 *   2. Dry run, read the report (misses, ambiguous, conflicts, ties, foreignTenants).
 *   3. Run with --write.
 *   4. Release the UI.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SAFETY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   Dry run is the DEFAULT and writes nothing — not even a register location (they are planned in
 *   memory, one per EGAID). --write must be explicit.
 *   Idempotent: a row with a `locationKey` is not geocoded again; a second run finds no conflict, and
 *   the summary tasks have deterministic ids (create() refuses a duplicate).
 *   Every row write carries a precondition on its updateTime: a row edited meanwhile is not
 *   overwritten (its parent is listed under `failed`; re-run).
 *   The JSON report goes to the temp directory (path printed at the end). It names persons, so keep
 *   it out of the repository.
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 *
 * Usage (bundled first: the repo runs .ts scripts as ESM, where extension-less imports fail):
 *   pnpm exec esbuild scripts/migrate-postal-residences.ts --bundle --platform=node --packages=external \
 *     --outfile=dist/scripts/migrate-postal-residences.cjs
 *   node dist/scripts/migrate-postal-residences.cjs            # dry run
 *   node dist/scripts/migrate-postal-residences.cjs --write
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { runPostalResidenceMigration } from '../apps/functions/src/address/migrate-postal-residences';

async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();
  const reportPath = join(tmpdir(), `migrate-postal-residences-${write ? 'write' : 'dry-run'}-${Date.now()}.json`);

  const report = await runPostalResidenceMigration(db, { write, reportPath });

  console.log(`${write ? 'WRITE' : 'DRY RUN'}:`);
  for (const [k, v] of Object.entries(report.counts).sort()) console.log(`  ${k}: ${v}`);
  console.log(`  misses: ${report.misses.length}, ambiguous: ${report.ambiguous.length}, foreign/empty tenants: ${report.foreignTenants.length}, conflicts: ${report.conflicts.length}, ties: ${report.ties.length}, failed: ${report.failed.length}`);
  console.log(`Report: ${reportPath}`);
  if (!write) console.log('Nothing written. Re-run with --write to apply.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
