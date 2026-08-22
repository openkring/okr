/**
 * ADD (or REMOVE) A TENANT ID ON EVERY `persons` AND EVERY `addresses` DOCUMENT.
 * Dry run by default, idempotent, re-runnable.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * WHY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * A personal tenant (design `planning/specs/2026-08-22-diary-import-design.md`, V1) must be
 * able to resolve the people and places its owner's diary refers to. The directory it needs
 * lives in `persons` and in the `addresses` PII vault, both tenant-scoped through
 * `tenants[]`. V1's answer is a mass migration: stamp the tenant id onto every document in
 * those two collections.
 *
 * ⚠️ THIS DISSOLVES THE TENANT ISOLATION OF THE TARGET TENANT. Afterwards it *contains* the
 * whole directory, including the `ssn` and `dob` channels of the address vault. It is only
 * defensible while that tenant has exactly ONE user. Adding a second user means running
 * `--remove` FIRST.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * WHY A LOCAL SCRIPT AND NOT A CALLABLE
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * An earlier revision shipped this as the callable `addTenantToDirectory`. It was removed:
 *
 *   - `checkAdminRole` checks `roles.admin` GLOBALLY (`libs/shared/util-functions/src/lib/
 *     general.util.ts`) — it has no notion of WHICH tenant the caller administers — while
 *     the tenant id arrived from `request.data`. Any admin of any tenant could have named
 *     their own tenant and absorbed the entire directory plus the PII vault. Permanently.
 *   - It was not actually invocable: App Check blocks a plain CLI call, and there is no
 *     admin UI that offers it.
 *   - A 540-second function reports through a client SDK whose callable deadline is 70s.
 *
 * A local admin-SDK script is this repository's own idiom for a one-off mass mutation —
 * see `scripts/migrate-sensitive-data.mjs` and `scripts/normalize-tenant-ids.mjs`. The
 * operator is whoever holds production credentials, which is the correct authorisation
 * boundary for a write nothing can undo automatically.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SAFETY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   --dry-run is the DEFAULT, in BOTH directions. `--write` must be explicit.
 *   `--tenant=<id>` is mandatory and is VALIDATED against `app-config/<id>` before anything
 *   is counted, dry run included. A typo would otherwise be written into every person and
 *   every address, the report would echo the typo back looking successful, and there is no
 *   undo — that is exactly the defect class `scripts/normalize-tenant-ids.mjs` job 2 exists
 *   to clean up (it sweeps `tenants[]` ids that have no `app-config` document).
 *   `--remove` is the inverse of the forward run and the rollback for it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ TRIGGER FAN-OUT — the write is far larger than the `changed` counts suggest
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Every document this script touches fires a Firestore trigger:
 *
 *   - `onPersonChange` (`apps/functions/src/replication/index.ts`) treats `tenants` as a
 *     PRIVACY INPUT, so changing it always runs `writeAddressDirectory(person.<id>)` — one
 *     rewritten `address-directory` projection document per person — and then updates the
 *     person's ownership / membership / personalrel / workingrel / reservation relations,
 *     which is several queries each.
 *   - `onAddressChange` (same file) re-derives the parent's replicas and projection from the
 *     LIVE vault contents for every touched address.
 *
 * So the derived work is roughly an order of magnitude larger than `changed`. Expect the
 * function backlog, not just the Firestore write volume, to be the constraint.
 *
 * ⚠️ THE TRAP: A DROPPED TRIGGER IS PERMANENT.
 * Firestore triggers are at-least-once but not guaranteed — an invocation can fail or be
 * dropped. If it is, that parent's `address-directory` projection never learns about the
 * new tenant. And a RE-RUN CANNOT REPAIR IT: the document already carries the tenant, so
 * this script skips it, so no write happens, so no trigger fires. The projection stays
 * stale forever and nothing reports it.
 *
 * REMEDY — MANDATORY AFTER EVERY `--write` RUN, in both directions:
 * call the existing `rebuildAddressDirectory` callable
 * (`apps/functions/src/address/rebuild-address-directory.ts`). It is admin-only and fully
 * idempotent: it walks every `persons` and every `orgs` document and rebuilds the
 * projection from the live vault via `writeAddressDirectory`, returning
 * `{ persons, orgs, crossTenantAddresses, parentsAffected }`. Because it does not consult
 * `tenants[]` to decide whether to act, it repairs exactly the parents this script's
 * skip-if-present logic can no longer reach.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   node scripts/add-tenant-to-persons-and-addresses.mjs --tenant=bka
 *       dry run, forward direction (the default — no arguments does NOTHING but print this)
 *   node scripts/add-tenant-to-persons-and-addresses.mjs --tenant=bka --write
 *       THE write. Follow it with rebuildAddressDirectory.
 *   node scripts/add-tenant-to-persons-and-addresses.mjs --tenant=bka --remove
 *       dry run of the rollback
 *   node scripts/add-tenant-to-persons-and-addresses.mjs --tenant=bka --remove --write
 *       THE rollback. Follow it with rebuildAddressDirectory.
 *   --json  machine-readable result on stdout instead of the report
 *
 * Exit codes: 0 clean · 1 unexpected error · 2 refused (bad/missing arguments, unknown tenant).
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MODELS_DIR = path.join(ROOT, 'libs/shared/models/src/lib');

const APP_CONFIG = 'app-config';
/** Firestore caps a WriteBatch at 500 ops; 400 leaves the same headroom the rest of the repo uses. */
const PAGE_SIZE = 400;

// ───────────────────────────────────────────────────────────────────────────────────────
// arguments — dry run by default, in both directions
// ───────────────────────────────────────────────────────────────────────────────────────
const ARGS = process.argv.slice(2);
const has = (flag) => ARGS.includes(flag);
const valueOf = (name) => {
  const hit = ARGS.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const TENANT_ID = (valueOf('tenant') ?? '').trim();
const WRITE = has('--write');
const REMOVE = has('--remove');
const JSON_OUT = has('--json');

const log = (...a) => { if (!JSON_OUT) console.log(...a); };
const rule = (ch = '─') => log(ch.repeat(100));

function usage() {
  console.error(`
ADD (or REMOVE) A TENANT ID ON EVERY persons AND addresses DOCUMENT — dry run by default.

  node scripts/add-tenant-to-persons-and-addresses.mjs --tenant=<id>                  dry run (forward)
  node scripts/add-tenant-to-persons-and-addresses.mjs --tenant=<id> --write          write   (forward)
  node scripts/add-tenant-to-persons-and-addresses.mjs --tenant=<id> --remove         dry run (rollback)
  node scripts/add-tenant-to-persons-and-addresses.mjs --tenant=<id> --remove --write write   (rollback)
  --json   machine-readable result instead of the report

--tenant is mandatory and must name an existing app-config document.
After ANY --write run, call the rebuildAddressDirectory callable — see the header comment
of this file ("THE TRAP"): a dropped trigger leaves a stale address-directory projection
that a re-run of this script can never repair.

Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
`);
  process.exit(2);
}

function refuse(message) {
  console.error(`\nREFUSED: ${message}\n`);
  process.exit(2);
}

if (ARGS.length === 0 || has('--help') || has('-h')) usage();
if (!TENANT_ID) {
  refuse('--tenant=<id> is required. There is no default tenant and no "current" tenant here.');
}

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

// Collection names are inlined rather than imported. `person.model.ts` and `address.model.ts`
// both import `@okr/shared-constants`, an alias jiti cannot resolve from a plain node script —
// importing them fails at runtime with MODULE_NOT_FOUND. The two values are stable strings that
// also appear verbatim in every Firestore path; the source of truth stays
// `libs/shared/models/src/lib/{person,address}.model.ts`, which the check below verifies.
const PersonCollection = 'persons';
const AddressCollection = 'addresses';

// Guard against silent drift: if either constant is ever renamed in the model, fail loudly here
// rather than walking an empty collection and reporting a reassuring "0 changed".
for (const [file, expected] of [['person.model.ts', PersonCollection], ['address.model.ts', AddressCollection]]) {
  const source = readFileSync(path.join(MODELS_DIR, file), 'utf8');
  if (!source.includes(`Collection = '${expected}'`)) {
    refuse(`${file} no longer declares the collection name '${expected}' — update this script.`);
  }
}

// ───────────────────────────────────────────────────────────────────────────────────────
// the migration itself
// ───────────────────────────────────────────────────────────────────────────────────────

/** Iterate a collection in id-ordered pages; runs `fn` per doc. Returns docs seen. */
async function forEachDoc(base, fn) {
  let last;
  let seen = 0;
  for (;;) {
    let q = base.orderBy('__name__').limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      await fn(doc.id, doc.data());
      seen++;
    }
    last = snap.docs[snap.docs.length - 1].id;
    if (snap.size < PAGE_SIZE) break;
  }
  return seen;
}

/**
 * Stamp (or strip) `tenantId` on every document of `collection`.
 *
 * `seen`    — documents visited
 * `changed` — documents whose `tenants[]` this run does / would alter
 * `skipped` — documents with NO `tenants` array at all: a data defect this migration
 *             deliberately leaves alone (see normalize-tenant-ids.mjs, which reports them)
 */
async function applyTenant(collection) {
  const result = { seen: 0, changed: 0, skipped: 0 };
  result.seen = await forEachDoc(db.collection(collection), async (id, data) => {
    const tenants = data['tenants'];
    // a document with no tenants array at all is a data defect, not our business to repair
    if (!Array.isArray(tenants)) {
      result.skipped++;
      return;
    }
    // kept only to keep `changed` honest for the dry-run report; arrayUnion/arrayRemove
    // below are no-ops regardless, so a concurrent writer racing us here cannot cause a
    // double-add or a double-remove
    const present = tenants.includes(TENANT_ID);
    if (REMOVE ? !present : present) return;
    result.changed++;
    if (WRITE) {
      await db.collection(collection).doc(id).update({
        tenants: REMOVE ? FieldValue.arrayRemove(TENANT_ID) : FieldValue.arrayUnion(TENANT_ID),
      });
    }
  });
  return result;
}

async function main() {
  // ── VALIDATE THE TENANT ID FIRST — dry run included ──────────────────────────────────
  // Without this, `--tenant=bkka` writes a junk id into every person and every address and
  // reports success. There is no undo, and the cleanup is a separate script (job 2 of
  // normalize-tenant-ids.mjs). Refuse in dry-run mode too: the dry run is what a human
  // reviews and approves, so a typo must not survive it looking plausible.
  const config = await db.collection(APP_CONFIG).doc(TENANT_ID).get();
  if (!config.exists) {
    const known = (await db.collection(APP_CONFIG).listDocuments()).map((d) => d.id).sort();
    refuse(
      `no app-config document exists for tenant "${TENANT_ID}".\n` +
      'The application joins on the app-config DOCUMENT ID; an id with no document is not a\n' +
      'tenant, it is a typo — and writing it into persons[] and addresses[] is not undoable\n' +
      'by anything but a separate sweep.\n\n' +
      `known tenant ids: ${known.join(', ') || '(none)'}`,
    );
  }

  const mode = REMOVE ? 'REMOVE' : 'ADD';
  rule('=');
  log(`${mode} TENANT "${TENANT_ID}" ON persons + addresses — ${WRITE ? 'WRITE' : 'DRY RUN'}`);
  log(new Date().toISOString());
  rule('=');

  const persons = await applyTenant(PersonCollection);
  const addresses = await applyTenant(AddressCollection);

  const result = { mode: mode.toLowerCase(), dryRun: !WRITE, tenantId: TENANT_ID, persons, addresses };

  if (JSON_OUT) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const report = (name, r) => {
    log(`  ${name.padEnd(10)} seen ${String(r.seen).padStart(6)}   ` +
        `${WRITE ? 'changed' : 'would change'} ${String(r.changed).padStart(6)}   ` +
        `skipped (no tenants[]) ${String(r.skipped).padStart(4)}`);
  };
  log('');
  report(PersonCollection, persons);
  report(AddressCollection, addresses);

  rule();
  if (!WRITE) {
    log('\nDRY RUN — nothing was written. Re-run with --write to apply.');
  } else {
    log('\nWRITTEN.');
    log('⚠️  NOW RUN THE rebuildAddressDirectory CALLABLE.');
    log('    Every document above fired onPersonChange / onAddressChange, each of which');
    log('    rewrites an address-directory projection. A dropped trigger leaves that');
    log('    projection stale FOREVER: the document now carries the tenant, so a re-run of');
    log('    this script skips it and no trigger ever fires again. rebuildAddressDirectory');
    log('    is idempotent and does not consult tenants[], so it is the only repair.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
