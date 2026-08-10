/**
 * C3 §5 / C4 / C5 §6 — seeds the two test partners the partner channel has never been exercised
 * against. `partners` is empty, so no `serviceUid` exists, so nothing downstream of it has ever
 * run: not the metering push, not a pool claim, and not either SLA leg of the escalation queue.
 *
 * Run with:  node scripts/seed-test-partners.mjs [--dry]
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Three writes per partner, in this order — each one is the previous one's prerequisite:
 *
 *  1. an **Org** with `tenants: ['bkg','kring']`. A partner IS an Org (C1 §3): the commercial
 *     identity — address, UID, invoices — lives there, and `PartnerModel` deliberately does not
 *     duplicate it, because a company with two spellings puts the wrong one on the invoice. The
 *     dual tenancy is written directly here rather than through `mergeOrgIntoTenant`, which is the
 *     same `arrayUnion` behind a memberAdmin check this script (Admin SDK) does not have and does
 *     not need. Its other half — the `address-directory` rebuild — is a no-op for an org with no
 *     addresses, which is what a freshly seeded test partner is.
 *
 *  2. a **Firebase Auth user**, the partner's *reporting identity*. Password sign-in rather than a
 *     service-account key, because the credential bkaiser hands a partner has to be revocable by
 *     bkaiser alone: disable this account and every push, claim and escalation from that
 *     installation stops. A key minted in the partner's own project could not be taken back.
 *
 *  3. the **Partner** record, whose `okey` IS the `partnerKey` every push authenticates against and
 *     every metering/commission document joins on. Never rename it for a live partner.
 *
 * ⚠️ **The generated passwords are printed once and never written anywhere.** They belong in the
 * partner installation's `METERING_CONFIG` secret (see `apps/functions/src/business/push.ts`), which
 * is exactly one JSON blob per installation so it cannot end up half-configured. Do not commit them,
 * do not paste them into a doc; re-run with `--reset-password` if one is lost.
 *
 * Idempotent: fixed document ids and `set`, and the Auth user is looked up by e-mail before it is
 * created. A re-run republishes the records; it does not mint a second partner or a second identity.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { randomBytes } from 'node:crypto';
import { argv, exit } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
/** Everything the partner channel writes lives in the platform tenant (C3 §6). */
const PLATFORM_TENANT = 'kring';
/** The partner COMPANY's org is shared into bkaiser's own tenant, where the invoice is raised. */
const ORG_TENANT = 'bkg';

const DRY = argv.includes('--dry');
const RESET_PASSWORD = argv.includes('--reset-password');

/**
 * Deliberately unmistakable test data on a domain bkaiser controls, so a later purge is one grep.
 * `contractStart` is left to the run date; `contractEnd` empty means the contract is running.
 */
const PARTNERS = [
  { id: 'test-alpha', name: 'Partner Alpha AG',   email: 'partner-alpha@bkaiser.ch' },
  { id: 'test-beta',  name: 'Partner Beta GmbH',  email: 'partner-beta@bkaiser.ch' },
];

/** `DateFormat.StoreDate` — yyyymmdd, the only date shape any of these records accepts. */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** 24 bytes of urandom, base64url. Long enough that nobody is tempted to retype it by hand. */
function generatePassword() {
  return randomBytes(24).toString('base64url');
}

/** Mirrors `getOrgIndex` (`n:name z:zipCode ot:orgType dof:dateOfFoundation`). */
function orgIndex(name) {
  return `n:${name} ot:association`;
}

/** Mirrors `getPartnerIndex`. `serviceUid` is NOT indexed — it is credential-like (C3 §5). */
function partnerIndex(name, status, orgKey) {
  return `name:${name} status:${status} org:${orgKey}`;
}

async function ensureAuthUser(auth, { email, name }) {
  try {
    const existing = await auth.getUserByEmail(email);
    if (!RESET_PASSWORD) {
      console.log(`    auth   ${email} → exists (${existing.uid}), password untouched`);
      return { uid: existing.uid, password: undefined };
    }
    const password = generatePassword();
    await auth.updateUser(existing.uid, { password });
    console.log(`    auth   ${email} → password RESET (${existing.uid})`);
    return { uid: existing.uid, password };
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    const password = generatePassword();
    const created = await auth.createUser({
      email, password, displayName: `${name} (reporting identity)`, emailVerified: false,
    });
    console.log(`    auth   ${email} → CREATED (${created.uid})`);
    return { uid: created.uid, password };
  }
}

async function main() {
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();
  const auth = getAuth();
  const today = todayStr();
  const credentials = [];

  console.log(`\nseed-test-partners → ${PROJECT_ID}${DRY ? '  (DRY RUN — nothing is written)' : ''}\n`);

  for (const partner of PARTNERS) {
    const orgKey = `partner-${partner.id}`;
    console.log(`  ${partner.name}`);

    // 1. the Org — dual-tenant, because the invoice is raised in `bkg` and the channel joins in `kring`
    const org = {
      name: partner.name,
      type: 'association',
      dateOfFoundation: '',
      dateOfLiquidation: '',
      taxId: '',
      notes: 'Testpartner — angelegt zum Durchspielen von Metering, Lead-Pool und Eskalationen.',
      tags: 'test',
      bexioId: '',
      membershipCategoryKey: 'mcat',
      tenants: [ORG_TENANT, PLATFORM_TENANT],
      isArchived: false,
      index: orgIndex(partner.name),
      favZipCode: '',
    };
    console.log(`    org    orgs/${orgKey} (tenants: ${org.tenants.join(', ')})`);
    if (!DRY) await db.collection('orgs').doc(orgKey).set(org);

    // 2. the reporting identity
    const { uid, password } = DRY
      ? { uid: `<uid of ${partner.email}>`, password: '<generated at run time>' }
      : await ensureAuthUser(auth, partner);

    // 3. the partner record — `okey` IS the partnerKey; never rename it once it is live
    const record = {
      tenants: [PLATFORM_TENANT],
      isArchived: false,
      name: partner.name,
      index: partnerIndex(partner.name, 'active', orgKey),
      tags: 'test',
      notes: 'Testpartner. Nicht abrechnen.',
      orgKey,
      // `active`, not `prospect`: only an active partner may push metering, claim a lead or
      // escalate (C2 §13.3), and a `prospect` record would make every downstream call fail with a
      // permission error that looks like a bug in the thing being tested.
      status: 'active',
      contractStart: today,
      contractEnd: '',
      // Left empty on purpose. `lastHeartbeatAt` is written by the ingest and is what C2 §13.3's
      // termination right is read from — seeding a heartbeat that never happened would make the
      // heartbeat check pass for a partner that has never reported.
      lastHeartbeatAt: '',
      reportedVersion: '',
      serviceUid: uid,
    };
    console.log(`    partner partners/${partner.id} → serviceUid ${uid}`);
    if (!DRY) await db.collection('partners').doc(partner.id).set(record);

    credentials.push({ partnerKey: partner.id, email: partner.email, password });
    console.log('');
  }

  if (DRY) {
    console.log('DRY RUN — nothing was written.\n');
    return;
  }

  console.log('─'.repeat(78));
  console.log('Sign-in credentials — printed ONCE, stored nowhere. Do not commit them.');
  console.log('─'.repeat(78));
  for (const c of credentials) {
    console.log(`  partnerKey ${c.partnerKey}`);
    console.log(`  email      ${c.email}`);
    console.log(`  password   ${c.password ?? '(unchanged — re-run with --reset-password to mint a new one)'}`);
    console.log('');
  }
  console.log('─'.repeat(78));
  console.log('⚠️  The password is NOT what goes into METERING_CONFIG.');
  console.log('─'.repeat(78));
  console.log(`
App Check is ENFORCED on identitytoolkit for this project, and a Cloud Function has no
attestation to present — so a partner installation cannot sign in with a password at all
(401 "Firebase App Check token is invalid", before the credential is even looked at). What
it uses instead is a REFRESH token, exchanged against securetoken, which is not enforced.

Mint one per partner, ONCE, from an attested client:

  1. Open an App-Check-registered app (e.g. the kring app) in a browser.
  2. Sign in with the e-mail + password above.
  3. In devtools, read the refresh token the SDK stored:

       JSON.parse(localStorage.getItem(
         Object.keys(localStorage).find(k => k.startsWith('firebase:authUser:'))
       )).stsTokenManager.refreshToken

  4. Put THAT string into the installation's METERING_CONFIG as \`serviceRefreshToken\`,
     alongside its own endpoint, apiKey and tenants[] — see apps/functions/src/business/push.ts.
  5. Sign out of the browser. The refresh token stays valid; it dies only to
     revokeRefreshTokens(uid), to disabling the account, or to a password change — all of
     which are bkaiser's alone, which is the revocability C3 §3 asked for.
`);
}

main().catch((error) => { console.error(error); exit(1); });
