/**
 * C5 §2 — seeds the prospect signup form of tenant `kring`: the form definition, the CMS section
 * that renders it, and the public page it sits on.
 *
 * Run with:  node scripts/seed-prospect-form.mjs [--dry]
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: every document has a fixed id and is written with `set`, so a re-run republishes the
 * current wording rather than creating a second form.
 *
 * The submission is NOT written by the generic form-builder collection path. `prospects.default`
 * is dispatched in `submitForm` to `createProspect`, which writes the prospect record AND its
 * contact details into the address vault (`parentKey = 'prospect.<okey>'`) — see the doc comment
 * on `createProspect` in apps/functions/src/business/prospect.ts.
 *
 * ⚠️ The privacy notice below is the §4 blocker and is quoted verbatim from
 * `planning/reference/2026-08-04-partnerprogramm-vertragswerk.md` Teil III.2. It must be shown at
 * the point of collection — it states the onward transfer to a partner, the 24-month retention and
 * the revocation route — and it cannot be retrofitted onto prospects already collected. Do not
 * paraphrase it here; change the Vertragswerk first, then re-run this script.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { argv, exit } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const TENANT = 'kring';
const FORM_KEY = 'prospect-signup';
const DOC_ID = 'kringProspectSignup';   // form definition + section share it; the page is FORM_KEY
const CONTACT = 'info@bkaiser.ch';
const DRY = argv.includes('--dry');

const PRIVACY_NOTICE = [
  'Was mit Ihrer Anfrage geschieht',
  '',
  'Wir erfassen Ihren Namen, Ihre Organisation und Ihre Kontaktdaten, um Ihre Anfrage zu bearbeiten.',
  'Kring wird von unabhängigen Partnerunternehmen verkauft und betreut. Ihre Anfrage wird deshalb an',
  'ein Partnerunternehmen weitergegeben, das sich bei Ihnen meldet. Dieses Unternehmen ist ab diesem',
  'Zeitpunkt eigenständig für die Bearbeitung Ihrer Daten verantwortlich; welches es ist, teilen wir',
  'Ihnen mit, sobald es feststeht.',
  '',
  'Rechtsgrundlage ist Ihre Einwilligung, die Sie jederzeit für die Zukunft widerrufen können.',
  `Wir bewahren Ihre Anfrage 24 Monate ab dem letzten Kontakt auf und löschen sie danach.`,
  `Für Auskunft, Berichtigung und Löschung: ${CONTACT}. Ein Widerruf wirkt gegenüber der bkaiser GmbH`,
  'ab Eingang; gegenüber einem Partnerunternehmen, dem Ihre Anfrage bereits übergeben wurde, richten',
  'Sie ihn direkt an dieses.',
].join('\n');

const field = (order, key, type, label, extra = {}) => ({
  id: key, key, type, label, required: false, width: 'full', order, ...extra,
});

const FIELDS = [
  field(1, 'name', 'text', 'Ihre Organisation', { required: true, placeholder: 'Turnverein Musterhausen', maxLength: 60 }),
  field(2, 'segment', 'dropdown', 'Was für eine Organisation?', {
    required: true,
    // Mirrors PartnerSegment in shared-models and the five worlds on kring.ch.
    options: [
      { label: 'Verein', value: 'club' },
      { label: 'Alumni-Organisation', value: 'alumni' },
      { label: 'Stockwerkeigentümerschaft', value: 'steg' },
      { label: 'Genossenschaft', value: 'coop' },
      { label: 'KMU', value: 'kmu' },
    ],
  }),
  field(3, 'contactName', 'text', 'Ihr Name', { required: true, width: 'half', maxLength: 60 }),
  field(4, 'email', 'email', 'E-Mail', { required: true, width: 'half' }),
  field(5, 'phone', 'phone', 'Telefon (optional)', { width: 'half', region: 'CH' }),
  field(6, 'divider', 'divider', ''),
  field(7, 'privacyNotice', 'label', PRIVACY_NOTICE),
  field(8, 'consent', 'checkbox', 'Ich willige ein, dass meine Anfrage an ein Partnerunternehmen weitergegeben wird.', { required: true }),
];

const RATE_LIMIT = { limit: 5, periodMinutes: 10 };

const formDefinition = {
  tenants: [TENANT],
  isArchived: false,
  name: 'Kring — Interessenten-Anmeldung',
  description: 'Anfrage von kring.ch. Erzeugt einen Eintrag im Interessentenpool (C5).',
  tags: '',
  notes: '',
  formKey: FORM_KEY,
  honeypotKey: 'website',
  encryptionSalt: '',
  encryptionKeyHash: '',
  pdfTemplateId: '',
  target: {
    kind: 'collection',
    mappingKey: 'prospects.default',
    modelType: 'ProspectModel',
    collectionName: 'prospects',
  },
  fields: FIELDS,
  // `submitForm` reads the rate limit off the DEFINITION, not off the section.
  rateLimit: RATE_LIMIT,
  version: 1,
};

const section = {
  tenants: [TENANT],
  isArchived: false,
  type: 'form',
  state: 'published',
  name: DOC_ID,
  title: 'Kring kennenlernen',
  subTitle: '',
  index: `n:${DOC_ID} t:form`,
  color: 0,
  colSize: '12',
  roleNeeded: 'none',   // public page — no login
  content: { htmlContent: '<p></p>', colSize: 4, position: 0 },
  properties: {
    formKey: FORM_KEY,
    mappingKey: 'prospects.default',
    emailAddresses: [CONTACT],
    showCaptcha: false,
    encryptFileUpload: false,
    rateLimit: RATE_LIMIT,
  },
  notes: '',
  tags: '',
};

const page = {
  tenants: [TENANT],
  isArchived: false,
  name: 'Interessenten-Anmeldung',
  index: `n:Interessenten-Anmeldung k:${FORM_KEY}`,
  tags: '',
  title: 'Kring kennenlernen',
  subTitle: '',
  abstract: 'Erzählen Sie uns von Ihrer Organisation — ein Partnerunternehmen meldet sich bei Ihnen.',
  logoUrl: '', logoAltText: '', bannerUrl: '', bannerAltText: '',
  meta: [{ name: 'keywords', content: 'kring, anmeldung, interessent, demo' }],
  type: 'content',
  state: 'published',
  notes: '',
  sections: [DOC_ID],
  isPrivate: false,   // reachable at /public/prospect-signup without a login
  blogType: '',
};

async function main() {
  const writes = [
    ['formDefinitions', DOC_ID, formDefinition],
    ['sections', DOC_ID, section],
    ['pages', FORM_KEY, page],
  ];
  if (DRY) {
    for (const [collection, id, data] of writes) {
      console.log(`\n── ${collection}/${id} ───────────────`);
      console.log(JSON.stringify(data, null, 2));
    }
    return;
  }
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();
  for (const [collection, id, data] of writes) {
    await db.collection(collection).doc(id).set(data);
    console.log(`✓ ${collection}/${id}`);
  }
  console.log(`\nRendered by kring-app at /public/${FORM_KEY}.`);
}

main().catch((e) => { console.error(e); exit(1); });
