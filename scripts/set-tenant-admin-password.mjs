/**
 * Sets a NEW random password on a tenant's admin user and prints it once, for hand-off.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────────────
 * A freshly provisioned tenant can end up with an admin account nobody can get into:
 *
 *  - Password-reset mail only works if `app-config/{tenant}.emailDomain` is a VERIFIED
 *    Mailtrap sending domain. The Basic plan allows five, and all five are taken
 *    (p13.ch, elab.glp-staefa.ch, bkaiser.com, kring.ch, seeclub.org). A tenant outside
 *    that set — `okr`, `bka` — cannot send mail at all.
 *  - The reset path swallows every error and returns `{success: true}` on purpose
 *    (anti-enumeration, M-3), so the app shows a green toast either way. The failure is
 *    invisible from the UI.
 *
 * The result is a locked-out admin with no signal as to why. Handing over a generated
 * password at provisioning time removes the dependency on mail entirely.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────────────
 *   node scripts/set-tenant-admin-password.mjs <tenantId>          # all admins of the tenant
 *   node scripts/set-tenant-admin-password.mjs <tenantId> --uid X  # one specific user
 *   node scripts/set-tenant-admin-password.mjs <tenantId> --dry-run
 *
 * The password is printed to stdout ONCE and never persisted — not to Firestore, not to a
 * file, not to the user document's `notes`. Copy it from the terminal, hand it over, and
 * have the recipient change it after first login.
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const TENANT = process.argv[2];
if (!TENANT || TENANT.startsWith('--')) {
  console.error('Usage: node scripts/set-tenant-admin-password.mjs <tenantId> [--uid <uid>] [--dry-run]');
  process.exit(1);
}

const uidIdx = process.argv.indexOf('--uid');
const ONLY_UID = uidIdx !== -1 ? process.argv[uidIdx + 1] : undefined;
const DRY_RUN = process.argv.includes('--dry-run');

// Ambiguity-free alphabet: no O/0, l/1/I. A generated password gets read off a screen and
// typed by hand, so characters that look alike cost more than the entropy they add.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const LENGTH = 20; // ~114 bits over this alphabet

function generatePassword() {
  let out = '';
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();
const auth = getAuth();

const snap = await db.collection('users').where('tenants', 'array-contains', TENANT).get();
const admins = snap.docs
  .map((d) => ({ uid: d.id, ...d.data() }))
  .filter((u) => u.roles?.admin === true && !u.isArchived)
  .filter((u) => !ONLY_UID || u.uid === ONLY_UID);

if (admins.length === 0) {
  console.error(`No admin user found for tenant "${TENANT}"${ONLY_UID ? ` with uid ${ONLY_UID}` : ''}.`);
  process.exit(1);
}

console.log(`Tenant "${TENANT}": ${admins.length} admin user(s)\n`);

for (const admin of admins) {
  // The Firestore doc id must BE the Firebase Auth uid — that is the link between the two.
  // If Auth does not know it, the account was never created and a password cannot be set.
  let authUser;
  try {
    authUser = await auth.getUser(admin.uid);
  } catch {
    console.error(`  ✗ ${admin.uid}: no Firebase Auth account for this uid — create the account first.`);
    continue;
  }

  const password = generatePassword();
  if (DRY_RUN) {
    console.log(`  [dry-run] would set a new password for ${authUser.email} (uid ${admin.uid})`);
    continue;
  }

  await auth.updateUser(admin.uid, { password });
  console.log(`  ✓ ${authUser.email}`);
  console.log(`      uid:      ${admin.uid}`);
  console.log(`      password: ${password}`);
  console.log(`      ↳ copy it now — it is not stored anywhere and cannot be shown again.\n`);
}
