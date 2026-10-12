/**
 * Spec 1.97 §7 — moves the seven insurance policies of the scs page `pages/f_versicherung` from
 * section-owned files into contracts, and points their buttons at the contracts.
 *
 * Per policy section (see POLICY_SECTIONS in migrate-insurance-contracts.logic.mjs):
 *   1. contracts/ins_<sectionKey>            insurance contract, active, internal, scs + insurer org
 *   2. contract-documents/ins_<sectionKey>_1 the PDF, copied into the private bucket, shared with members
 *   3. sections/<sectionKey>                 properties.action → { type: ContractDocument, url: <contractKey> }
 *
 * Idempotent (deterministic ids): a section already pointing at its contract is reported as done.
 * The original files stay until a separate --delete-originals run, which removes
 * tenant/scs/section/<sectionKey>/file/* only for sections whose button already opens a contract
 * that shares a file. Run it after checking the page as a regular member.
 *
 * Run with:  node scripts/migrate-insurance-contracts.mjs                      (dry run, the default)
 *            node scripts/migrate-insurance-contracts.mjs --apply              (migrate)
 *            node scripts/migrate-insurance-contracts.mjs --delete-originals   (dry run of the cleanup)
 *            node scripts/migrate-insurance-contracts.mjs --delete-originals --apply
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 * Order:     functions + rules deployed and the app released first (spec 1.97 §8).
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import {
  BUTTON_ACTION_CONTRACT_DOCUMENT, TENANT_ID, buildContractDocument, buildInsuranceContract, canDeleteOriginal, contractDocumentPath,
  contractIdOf, documentIdOf, findInsurerOrg, orgAvatar, planSection, POLICY_SECTIONS,
} from './migrate-insurance-contracts.logic.mjs';

const PROJECT_ID = 'bkaiser-org';
if (!getApps().length) initializeApp({ projectId: PROJECT_ID, storageBucket: `${PROJECT_ID}.appspot.com` });
const db = getFirestore();
const defaultBucket = getStorage().bucket();
const privateBucket = getStorage().bucket(`${PROJECT_ID}-private`);

const APPLY = process.argv.includes('--apply');
const DELETE_ORIGINALS = process.argv.includes('--delete-originals');
const mode = APPLY ? 'APPLY' : 'DRY RUN';

function today() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function migrate() {
  const ownOrgSnap = await db.collection('orgs').doc(TENANT_ID).get();
  const ownOrg = orgAvatar(TENANT_ID, ownOrgSnap.get('name') ?? TENANT_ID);
  const orgs = (await db.collection('orgs').where('tenants', 'array-contains', TENANT_ID).get()).docs.map((d) => ({ okey: d.id, ...d.data() }));
  const counts = { migrated: 0, done: 0, skipped: 0 };

  for (const entry of POLICY_SECTIONS) {
    const sectionRef = db.collection('sections').doc(entry.sectionKey);
    const section = (await sectionRef.get()).data();
    const plan = planSection(entry, section);
    if (plan.action !== 'migrate') {
      counts[plan.action === 'done' ? 'done' : 'skipped']++;
      console.log(`${entry.sectionKey} ${entry.name}: ${plan.action}${plan.reason ? ` — ${plan.reason}` : ''}`);
      continue;
    }

    const contractKey = contractIdOf(entry.sectionKey);
    const docKey = documentIdOf(entry.sectionKey);
    const targetPath = contractDocumentPath(TENANT_ID, contractKey, docKey, plan.fileName);
    const insurer = findInsurerOrg(orgs, entry.insurer);
    const [meta] = await defaultBucket.file(plan.sourcePath).getMetadata();
    const size = Number(meta.size ?? 0);
    console.log(`${entry.sectionKey} ${entry.name}: migrate ${plan.sourcePath} (${size} B) → ${targetPath}; insurer ${insurer ? insurer.name2 : 'not found, left for the treasurer'}`);
    if (!APPLY) { counts.migrated++; continue; }

    // the copy first: a contract must never list a file that is not there
    await defaultBucket.file(plan.sourcePath).copy(privateBucket.file(targetPath));
    const docRef = { docKey, role: 'contract', title: plan.fileName, docState: 'final', sharedWithMembers: true };
    const batch = db.batch();
    batch.set(db.collection('contracts').doc(contractKey), buildInsuranceContract(entry, plan.fileName, ownOrg, insurer, docRef));
    batch.set(db.collection('contract-documents').doc(docKey),
      buildContractDocument({ title: plan.fileName, path: targetPath, size, contractKey, today: today() }));
    batch.update(sectionRef, { 'properties.action.type': BUTTON_ACTION_CONTRACT_DOCUMENT, 'properties.action.url': contractKey });
    await batch.commit();
    counts.migrated++;
  }
  console.log(`\n${mode}: ${counts.migrated} to migrate/migrated, ${counts.done} already done, ${counts.skipped} skipped`);
}

async function deleteOriginals() {
  let deleted = 0;
  for (const entry of POLICY_SECTIONS) {
    const section = (await db.collection('sections').doc(entry.sectionKey).get()).data();
    const contract = (await db.collection('contracts').doc(contractIdOf(entry.sectionKey)).get()).data();
    if (!canDeleteOriginal(entry, section, contract)) {
      console.log(`${entry.sectionKey} ${entry.name}: kept — button does not yet open a contract with a shared file`);
      continue;
    }
    const [files] = await defaultBucket.getFiles({ prefix: `tenant/${TENANT_ID}/section/${entry.sectionKey}/file/` });
    for (const f of files) {
      console.log(`${entry.sectionKey} ${entry.name}: delete ${f.name}`);
      if (APPLY) await f.delete({ ignoreNotFound: true });
      deleted++;
    }
  }
  console.log(`\n${mode}: ${deleted} original file(s) ${APPLY ? 'deleted' : 'to delete'}`);
}

console.log(`${mode} — ${DELETE_ORIGINALS ? 'delete originals' : 'migrate policies'} (project ${PROJECT_ID})\n`);
await (DELETE_ORIGINALS ? deleteOriginals() : migrate());
