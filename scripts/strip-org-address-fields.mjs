/**
 * One-time strip of the legacy address replicas on org documents:
 *
 *   orgs -> FieldValue.delete() favStreetName, favStreetNumber, favCity, favCountryCode
 *
 * `favZipCode` STAYS (low sensitivity, load-bearing: search index, QR slip, public org card —
 * see privacy spec 1.19). The four stripped fields are already absent from `OrgModel` and no
 * live code reads them; the addresses vault is the only source afterwards.
 *
 * PRECONDITION (checked, aborts otherwise): every org carrying a preservable legacy address
 * (street/number/zip/city) has a matching non-archived postal address in the vault. Run
 * `scripts/migrate-org-postal-address.mjs` first — the coverage rule is shared with it, so a
 * street-less vault address (Postfach / Vereinsadresse) counts, and a legacy address parked on
 * a NON-favorite postal doc counts too.
 *
 * `--force` skips the abort and strips anyway — only for legacy values you have deliberately
 * decided to discard (e.g. a superseded address after a relocation).
 *
 * Idempotent: re-running skips orgs that no longer carry the fields.
 *
 * Run with:  node scripts/strip-org-address-fields.mjs --dry     (inspect first)
 *            node scripts/strip-org-address-fields.mjs           (execute)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { coversLegacy, hasPreservableAddress, legacyAddressOf, loadPostalByParent } from './migrate-org-postal-address.mjs';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry') || process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

const FIELDS = ['favStreetName', 'favStreetNumber', 'favCity', 'favCountryCode'];

/** Aborts unless every org's preservable legacy address is represented in the vault. */
async function assertVaultCoverage(orgs) {
  const postalByParent = await loadPostalByParent(db);
  const uncovered = [];
  for (const doc of orgs.docs) {
    const org = doc.data();
    const legacy = legacyAddressOf(org);
    if (!hasPreservableAddress(legacy)) continue;
    const postals = postalByParent.get(`org.${doc.id}`) ?? [];
    if (postals.some((a) => coversLegacy(a, legacy))) continue;
    uncovered.push(
      `orgs/${doc.id} "${org.name ?? ''}" :: "${legacy.streetName}" "${legacy.streetNumber}" ` +
        `"${legacy.zipCode}" "${legacy.city}" "${legacy.countryCode}"`
    );
  }
  if (uncovered.length === 0) {
    console.log(`precondition OK — every org's legacy address is represented in the addresses vault.`);
    return;
  }
  console.error(`\n${uncovered.length} org(s) would LOSE their only postal address:`);
  for (const line of uncovered) console.error(`  - ${line}`);
  if (!FORCE) {
    console.error(`\nABORTED. Run 'node scripts/migrate-org-postal-address.mjs' first, or pass --force to discard these values.`);
    process.exit(1);
  }
  console.error(`\n--force given — stripping anyway; the values above are discarded.`);
}

async function main() {
  const orgs = await db.collection('orgs').get();
  await assertVaultCoverage(orgs);

  let stripped = 0;
  let batch = db.batch();
  let pending = 0;
  for (const doc of orgs.docs) {
    const data = doc.data();
    const present = FIELDS.filter((f) => data[f] !== undefined);
    if (present.length === 0) continue;
    if (!DRY_RUN) {
      const update = {};
      for (const f of present) update[f] = FieldValue.delete();
      batch.update(doc.ref, update);
      pending++;
      if (pending >= 400) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
    stripped++;
  }
  if (!DRY_RUN && pending > 0) await batch.commit();

  console.log(
    `orgs: ${orgs.size} docs scanned, ${stripped} ${DRY_RUN ? 'would be ' : ''}stripped of [${FIELDS.join(', ')}]`
  );
  if (DRY_RUN) console.log('DRY RUN — nothing was written. Re-run without --dry to execute.');
}

await main();
process.exit(0);
