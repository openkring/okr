/**
 * READ-ONLY census — counts documents per collection per tenant.
 *
 * Zählt pro Mandant die Dokumente je Collection — die Grundlage dafür, das Datenprofil
 * eines Mandanten auf einem anderen nachzubilden. Nur Lesezugriffe (`.count().get()`),
 * niemals Schreibzugriffe.
 *
 * Usage:
 *   node scripts/tenant-data-census.mjs <tenantId> [<tenantId> ...]
 *   node scripts/tenant-data-census.mjs scs okr
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTIONS = [
  'persons', 'orgs', 'groups', 'memberships', 'addresses', 'avatars',
  'tasks', 'calevents', 'activities', 'invitations', 'comments',
  'documents', 'pages', 'sections', 'menuItems', 'resources', 'categories',
];

const tenants = process.argv.slice(2);
if (tenants.length === 0) {
  console.error('Usage: node scripts/tenant-data-census.mjs <tenantId> [<tenantId> ...]');
  process.exit(1);
}

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

const rows = [];
for (const collectionName of COLLECTIONS) {
  const row = { collection: collectionName };
  for (const tenant of tenants) {
    try {
      const snap = await db.collection(collectionName)
        .where('tenants', 'array-contains', tenant)
        .count().get();
      row[tenant] = snap.data().count;
    } catch (err) {
      row[tenant] = `ERR ${err.code ?? err.message}`;
    }
  }
  rows.push(row);
}
console.table(rows);
