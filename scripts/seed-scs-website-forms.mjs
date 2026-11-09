/**
 * Wires the scs-website forms (tenant `scs`):
 *
 *   1. formDefinitions/scsContact — the contact form «Kontakt» (formKey `kontakt`), a mail-only form
 *      (`target.kind: 'mail'`): nothing is stored, `submitForm` mails the answers to the section's
 *      `emailAddresses`, with Reply-To set to the sender. Replaces the hand-built form behind publicApi /contact.
 *   2. sections/scsw_kontakt_form — the form section kontakt.html mounts (it holds the recipients server-side).
 *   3. sections/scsw_kurs_erwachsene_form, sections/scsw_kurs_jugendliche_form — the course registration
 *      (formKey `kurs-anmeldung`, seeded by seed-course-registration-form.mjs) on the two website course pages.
 *      `courseId` is a fixed placeholder until the courses exist in `courses` (spec 1.132, owner 2026-11-09):
 *      then set the section's «Feste Werte» courseId to the course okey in the app.
 *   4. pages/scsw_kurs_erwachsene, pages/scsw_kurs_jugendliche — the form section appended to `sections`
 *      (arrayUnion: a re-run never adds it twice, existing sections stay).
 *
 * Run with:  node scripts/seed-scs-website-forms.mjs [--dry]
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * ⚠️ THE REAL RUN WRITES PRODUCTION FIRESTORE. Deploy `submitForm` first: an older one does not know the
 * mail target and would fail every contact message (the course sections need no new function).
 *
 * Idempotent: fixed document ids and `set` (form, sections), `arrayUnion` (pages).
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { argv, exit } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const TENANT = 'scs';
const DRY = argv.includes('--dry');
const FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/; // libs/forms/util field-kind.ts

const CONTACT_DOC_ID = 'scsContact';
const CONTACT_FORM_KEY = 'kontakt';
// publicApi /contact delivers here today (CONTACT_EMAIL is not set on the function)
const CONTACT_RECIPIENTS = ['info@seeclub.org'];
const COURSE_FORM_KEY = 'kurs-anmeldung';

const field = (order, key, type, label, extra = {}) => ({
  id: key, key, type, label, required: false, width: 'full', order, ...extra,
});

// The subjects of the old hand-built form, plus App Support and Login Probleme (owner 2026-11-09).
const SUBJECT_OPTIONS = [
  { label: 'Allgemeine Anfrage', value: 'general' },
  { label: 'Kursanmeldung', value: 'course' },
  { label: 'Bootshaus-Projekt', value: 'boathouse' },
  { label: 'App Support', value: 'appSupport' },
  { label: 'Login Probleme', value: 'loginProblems' },
];

const CONTACT_FIELDS = [
  field(0, 'name', 'text', 'Name', { required: true, width: 'half', minLength: 2, maxLength: 100 }),
  field(1, 'email', 'email', 'E-Mail', { required: true, width: 'half' }),
  field(2, 'phone', 'phone', 'Telefon', { width: 'half', region: 'CH' }),
  field(3, 'subject', 'dropdown', 'Betreff', { required: true, width: 'half', options: SUBJECT_OPTIONS }),
  field(4, 'message', 'text', 'Nachricht', { required: true, multiline: true, minLength: 10, maxLength: 5000 }),
];

const contactForm = {
  tenants: [TENANT],
  isArchived: false,
  name: 'Kontakt',
  description: 'Kontaktformular der Website. Nachrichten werden nicht gespeichert, sondern per E-Mail zugestellt.',
  tags: '',
  notes: '',
  formKey: CONTACT_FORM_KEY,
  honeypotKey: 'website',
  encryptionSalt: '',
  encryptionKeyHash: '',
  pdfTemplateId: '',
  target: { kind: 'mail' },
  fields: CONTACT_FIELDS,
  derivedValues: [],
  fillerHelpText: '',
  confirmationMessage: 'Danke {name}, deine Nachricht ist bei uns angekommen. Wir melden uns in Kürze.',
  confirmationVariants: [],
  sendFillerConfirmation: false,
  isOpen: true,
  closesAt: '',
  maxResponses: 0,
  showRemaining: false,
  closedMessage: '',
  // the old /contact route allowed 5 per IP and hour
  rateLimit: { limit: 5, periodMinutes: 60 },
  version: 1,
};

/** A form section, shaped like sections/scsw_mitgliedschaft_form (created in the app). */
function formSection(name, tags, notes, properties) {
  return {
    name,
    type: 'form',
    title: '',
    subTitle: '',
    tags: '',
    notes,
    index: `n:${name} t:form tt:${tags} st:`,
    colSize: '12',
    color: 0,
    content: { colSize: 3, htmlContent: '<p></p>', position: 0 },
    roleNeeded: 'contentAdmin',
    state: 'published',
    isArchived: false,
    tenants: [TENANT],
    properties: {
      encryptFileUpload: false,
      showCaptcha: false,
      implicitValues: {},
      rateLimit: { limit: 10, periodMinutes: 5 },
      ...properties,
    },
  };
}

const SECTIONS = {
  scsw_kontakt_form: formSection('scsw_kontakt_form', 'kontakt',
    'Kontaktformular auf der Website (kontakt.html). Nachrichten gehen per E-Mail an die Adressen unten, nichts wird gespeichert.',
    { formKey: CONTACT_FORM_KEY, emailAddresses: CONTACT_RECIPIENTS, rateLimit: { limit: 5, periodMinutes: 60 } }),
  scsw_kurs_erwachsene_form: formSection('scsw_kurs_erwachsene_form', 'kurs erwachsene anmeldung',
    'Kursanmeldung «Kurs für Erwachsene» auf der Website. courseId ist ein Platzhalter, bis der Kurs in «Kurse» existiert; dann dessen Schlüssel eintragen.',
    { formKey: COURSE_FORM_KEY, responsibilityKey: 'memberAdmin', implicitValues: { courseId: 'kurs-erwachsene' } }),
  scsw_kurs_jugendliche_form: formSection('scsw_kurs_jugendliche_form', 'kurs jugendrudern anmeldung',
    'Kursanmeldung «Jugendrudern» auf der Website. courseId ist ein Platzhalter, bis der Kurs in «Kurse» existiert; dann dessen Schlüssel eintragen.',
    { formKey: COURSE_FORM_KEY, responsibilityKey: 'memberAdmin', implicitValues: { courseId: 'jugendrudern' } }),
};

const PAGE_SECTIONS = {
  scsw_kurs_erwachsene: 'scsw_kurs_erwachsene_form',
  scsw_kurs_jugendliche: 'scsw_kurs_jugendliche_form',
};

function validate() {
  const keys = CONTACT_FIELDS.map((f) => f.key);
  const dup = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dup) throw new Error(`duplicate field key '${dup}'`);
  for (const k of keys) if (!FIELD_KEY_PATTERN.test(k)) throw new Error(`field key '${k}' is not camelCase`);
  CONTACT_FIELDS.forEach((f, i) => { if (f.order !== i) throw new Error(`field '${f.id}' has order ${f.order}, expected ${i}`); });
  if (!CONTACT_FIELDS.some((f) => f.type === 'email')) throw new Error('the Reply-To needs an e-mail field');
  if (CONTACT_RECIPIENTS.length === 0) throw new Error('a mail-only form needs recipients on its section');
}

function db() {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  return getFirestore();
}

/** The only write path. Never reached with --dry. */
async function write(fn) {
  if (DRY) throw new Error('refusing to write with --dry');
  await fn();
}

async function seed() {
  validate();
  console.log(`\n── formDefinitions/${CONTACT_DOC_ID} ───────────────`);
  console.log(JSON.stringify(contactForm, null, 2));
  for (const [id, data] of Object.entries(SECTIONS)) {
    console.log(`\n── sections/${id} ───────────────`);
    console.log(JSON.stringify(data, null, 2));
  }
  for (const [page, section] of Object.entries(PAGE_SECTIONS)) console.log(`\npages/${page}.sections += ${section}`);
  if (DRY) { console.log('\n(--dry: not written)'); return; }

  const store = db();
  // Refuse to append to a page that is missing or belongs to another tenant.
  for (const page of Object.keys(PAGE_SECTIONS)) {
    const snap = await store.collection('pages').doc(page).get();
    if (!snap.exists || !(snap.get('tenants') ?? []).includes(TENANT)) throw new Error(`pages/${page} missing or not in tenant ${TENANT}`);
  }
  await write(() => store.collection('formDefinitions').doc(CONTACT_DOC_ID).set(contactForm));
  console.log(`✓ formDefinitions/${CONTACT_DOC_ID}`);
  for (const [id, data] of Object.entries(SECTIONS)) {
    await write(() => store.collection('sections').doc(id).set(data));
    console.log(`✓ sections/${id}`);
  }
  for (const [page, section] of Object.entries(PAGE_SECTIONS)) {
    await write(() => store.collection('pages').doc(page).update({ sections: FieldValue.arrayUnion(section) }));
    console.log(`✓ pages/${page}`);
  }
}

seed().catch((e) => { console.error(e); exit(1); });
