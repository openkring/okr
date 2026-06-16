/**
 * One-time seed: publishes the gss Spendenbestätigung template (+ version 1) to Firestore.
 *
 * Run with:  node scripts/seed-gss-spendenbestaetigung.mjs
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, 'templates', 'gss-spendenbestaetigung.hbs'), 'utf8');

const TENANT = 'gss';
const TEMPLATE_ID = 'gss-spendenbestaetigung';
const now = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // yyyymmdd

const sampleData = {
  logoUrl: 'https://bkaiser.imgix.net/tenant/scs/logo/gss.png',
  greeting: 'Liebe Anna',
  firstName: 'Anna', lastName: 'Muster',
  streetName: 'Seestrasse', streetNumber: '12',
  zipCode: '8712', city: 'Stäfa',
  date: '07.05.2026',
  amount: '1\'000.00',
};

await db.collection('templates').doc(TEMPLATE_ID).set({
  tenants: [TENANT],
  isArchived: false,
  index: TEMPLATE_ID,
  name: 'Gönnerbestätigung GSS',
  description: 'Spendenbestätigung Gönnerverein Seeclub Stäfa',
  category: 'other',
  language: 'de',
  currentVersion: 1,
  draftVersion: null,
  status: 'published',
  defaultOutputFormat: 'pdf',
  defaultFormat: 'A4',
  defaultOrientation: 'portrait',
  sampleData: JSON.stringify(sampleData),
  payloadSchema: '',
  createdAt: now,
  createdBy: 'seed',
  updatedAt: now,
  updatedBy: 'seed',
});

await db.collection('templates').doc(TEMPLATE_ID)
  .collection('versions').doc('1').set({
    version: 1,
    html,
    css: '',
    partials: {},
    assets: [],
    status: 'published',
    changelog: 'Initial seed',
    publishedAt: now,
    publishedBy: 'seed',
    createdAt: now,
    createdBy: 'seed',
  });

console.log(`Seeded template ${TEMPLATE_ID} (version 1) for tenant ${TENANT}.`);
process.exit(0);
