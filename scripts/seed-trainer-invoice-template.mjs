/**
 * Seeds the global trainer invoice template (spec 1.167 §8) into `templates/trainer-invoice` and
 * `templates/trainer-invoice/versions/1`. One layout for every trainer and club: the doc belongs to no
 * tenant (`tenants: ['system']`, like the shared email templates), so no tenant's template editor lists it;
 * `sendTrainerInvoice` renders it by id with admin rights.
 *
 * Sources: scripts/templates/trainer-invoice.html (Handlebars) + scripts/templates/trainer-invoice.css.
 *
 * Idempotent: the template doc is written with `set(..., { merge: true })` (metadata only; `currentVersion`
 * and `createdAt` are set only when the doc is new, so a later published version is never reset), and
 * version 1 is created only when it is absent — an existing version is never overwritten.
 * `attachQrSlip` stays false: the trainer's profile (`showQrSlip`) decides through the render override.
 *
 * Usage:
 *   node scripts/seed-trainer-invoice-template.mjs            # dry run (default): reads, prints the doc
 *   node scripts/seed-trainer-invoice-template.mjs --write    # write
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { readFileSync } from 'node:fs';

import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'bkaiser-org';
const TEMPLATE_ID = 'trainer-invoice';
const write = process.argv.includes('--write');

const html = readFileSync(new URL('./templates/trainer-invoice.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./templates/trainer-invoice.css', import.meta.url), 'utf8');

/** Fake sample data for the template editor preview — never real persons or accounts. */
const sampleData = {
  logoUrl: '',
  senderName: 'Muster Sport',
  senderAddress: ['Seestrasse 12', '8712 Stäfa'],
  recipientName: 'Ruderclub Beispiel',
  recipientAddress: ['Kassier', 'Seeweg 1', '8000 Zürich'],
  invoiceNo: '2607',
  invoiceDateText: '30. August 2026',
  dueDateText: '29. September 2026',
  ourRef: 'Hans Muster',
  monthTitle: 'Juli 2026',
  rows: [
    { dateText: '1. Juli 2026', service: 'Trainingsbetreuung Rotsee', quantityText: '3 Std.', rateText: '50.00', amountText: '150.00' },
    { dateText: '8. Juli 2026', service: 'Trainingsbetreuung', quantityText: '2 Std.', rateText: '50.00', amountText: '100.00' },
  ],
  subtotalText: '250.00',
  totalText: '250.00',
  vatNote: 'Rechnungsbetrag netto, nicht mehrwertsteuerpflichtig.',
  bankName: 'Testbank',
  iban: 'CH9300762011623852957',
  ibanText: 'CH93 0076 2011 6238 5295 7',
  closingText: 'Herzlichen Dank für deinen Auftrag.',
  amount: '250.00',
  qrMessage: 'Rechnung 2607',
};

function templateMeta(now) {
  return {
    tenants: ['system'],
    isArchived: false,
    index: TEMPLATE_ID,
    name: 'Trainer-Rechnung',
    description: 'Monatsrechnung eines Trainers an den Verein (Trainer-Abrechnung, spec 1.167). Global, nicht anpassbar.',
    kind: 'pdf',
    category: 'invoice',
    language: 'de',
    draftVersion: null,
    status: 'published',
    defaultOutputFormat: 'pdf',
    defaultFormat: 'A4',
    defaultOrientation: 'portrait',
    attachQrSlip: false, // the render override (profile.showQrSlip) decides
    qrSlipWithAmount: true,
    payeeOrgId: '', // unused: the payee is the trainer (render override)
    addressWindow: 'right',
    sampleData: JSON.stringify(sampleData),
    payloadSchema: '',
    updatedAt: now,
    updatedBy: 'seed',
  };
}

function versionDoc(now) {
  return {
    version: 1,
    html,
    css,
    subject: '',
    text: '',
    partials: {},
    assets: [],
    status: 'published',
    changelog: 'Initial seed (spec 1.167)',
    publishedAt: now,
    publishedBy: 'seed',
    createdAt: now,
    createdBy: 'seed',
  };
}

async function main() {
  const app = getApps().length ? getApps()[0] : initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();
  console.log(write ? 'WRITE MODE\n' : 'DRY RUN (no writes) — pass --write to write.\n');

  const now = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // StoreDate
  const templateRef = db.collection('templates').doc(TEMPLATE_ID);
  const versionRef = templateRef.collection('versions').doc('1');
  const [templateSnap, versionSnap] = await Promise.all([templateRef.get(), versionRef.get()]);

  const meta = templateMeta(now);
  if (!templateSnap.exists) Object.assign(meta, { currentVersion: 1, createdAt: now, createdBy: 'seed' });

  console.log(`templates/${TEMPLATE_ID}: ${templateSnap.exists ? 'MERGE (exists)' : 'CREATE'}`);
  console.log(JSON.stringify({ ...meta, sampleData: '(json, ' + meta.sampleData.length + ' chars)' }, null, 2));
  console.log(`\ntemplates/${TEMPLATE_ID}/versions/1: ${versionSnap.exists ? 'SKIP (exists, never overwritten)' : `CREATE (html ${html.length} chars, css ${css.length} chars)`}`);

  if (write) {
    await templateRef.set(meta, { merge: true });
    if (!versionSnap.exists) await versionRef.create(versionDoc(now));
    console.log('\n✓ written');
  }
  await deleteApp(app);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
