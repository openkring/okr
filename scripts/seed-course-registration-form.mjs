/**
 * 1.125 phase B (Task 11) — seeds the ONE SCS course registration form «Kursanmeldung» (tenant `scs`,
 * mapping `applications.course`, `formKey` `kurs-anmeldung`). It is the first user of the phase B features:
 * an implicit field (`courseId`, the course comes from the page), «Andere», conditions on a block and on a
 * single field, a confirmation variant and the filler confirmation mail.
 *
 * Run with:  node scripts/seed-course-registration-form.mjs [--dry]
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * ⚠️ THE REAL RUN (without --dry) WRITES PRODUCTION FIRESTORE AND IS THE OWNER'S: run it only after the
 * functions, the rules and the app release of 1.125 phase B are deployed, in that order — an older
 * `submitForm` does not know the implicit field, «Andere», limits or the course mapping.
 *
 * Flags:
 *   --dry   print the document and exit; NEVER writes (the guard sits in `write()`). Needs no network.
 *
 * The seed is idempotent: a fixed document id and `set`, so a re-run republishes the current wording rather
 * than creating a second form. NO CMS page and NO section is created: the owner places the form
 * (formKey `kurs-anmeldung`) once per course, on a page with a form section (Task 9) that sets the fixed
 * value `courseId` = the course's `okey` (collection `courses`), and, per course, places and deadline.
 * Without that section the form is closed: its implicit `courseId` has no default and no `fromLink`, so
 * `submitForm` refuses a submission that does not come from a verified section.
 *
 * Decisions D-W4 / R1: the course is stored as the typed property `courseId` (text) of the application;
 * there is NO AHV (`ssn`) field in this form.
 *
 * Conditions reference the controlling field's `id`, never its `key`, and only fields with a lower `order`.
 * Here `id === key` for every input field. A divider's rule governs everything up to the NEXT divider, so each
 * conditional block is ended by an empty divider without a rule. `validate()` below checks the shape before
 * anything is printed or written and fails loudly.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { argv, exit } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const TENANT = 'scs';
const FORM_KEY = 'kurs-anmeldung';
const DOC_ID = 'scsCourseRegistration';
const DRY = argv.includes('--dry');

const OTHER_VALUE = 'other'; // OTHER_OPTION_VALUE of @okr/shared-models
const FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/; // libs/forms/util field-kind.ts

const field = (order, key, type, label, extra = {}) => ({
  id: key, key, type, label, required: false, width: 'full', order, ...extra,
});
const rule = (match, ...conditions) => ({ match, conditions });
const when = (fieldId, op, value) => (value === undefined ? { fieldId, op } : { fieldId, op, value });

const PRIOR_KNOWLEDGE_OPTIONS = [
  { label: 'Keine', value: 'keine' },
  { label: 'Etwas', value: 'etwas' },
  { label: 'Viel', value: 'viel' },
];

const FIELDS = [
  // The course: set by the form section of the page (its `implicitValues`), never typed, never shown, never
  // required. The value is the `okey` of the course (`courses`); it is stored as the typed property `courseId`.
  field(0, 'courseId', 'implicit', 'Kurs', { valueType: 'text', asProperty: true, fromLink: false }),

  field(1, 'firstName', 'text', 'Vorname', { required: true, width: 'half' }),
  field(2, 'lastName', 'text', 'Nachname', { required: true, width: 'half' }),
  field(3, 'gender', 'category', 'Geschlecht', { required: true, categoryName: 'gender' }),
  field(4, 'dateOfBirth', 'date', 'Geburtsdatum', { required: true }),
  field(5, 'email', 'email', 'E-Mail', { required: true, width: 'half' }),
  field(6, 'phone', 'phone', 'Telefon', { width: 'half', region: 'CH' }),

  // Under 18 (by year of birth): the guardian. The divider's rule is the block rule.
  field(7, 'guardianBlock', 'divider', 'Erziehungsberechtigte Person', {
    visibleIf: rule('all', when('dateOfBirth', 'ageLt', 18)),
  }),
  field(8, 'parentFirstName', 'text', 'Vorname', { required: true, width: 'half' }),
  field(9, 'parentLastName', 'text', 'Nachname', { required: true, width: 'half' }),
  field(10, 'parentEmail', 'email', 'E-Mail', { required: true, width: 'half' }),
  field(11, 'parentPhone', 'phone', 'Telefon', { width: 'half', region: 'CH' }),

  // No rule on this divider: it ends the guardian block, so the question below is asked of everyone.
  field(12, 'knowledgeBlock', 'divider', ''),
  field(13, 'priorKnowledge', 'radio', 'Vorkenntnisse', {
    required: true, asProperty: true, allowOther: true, options: PRIOR_KNOWLEDGE_OPTIONS,
  }),

  // Only for those who bring some knowledge, or name their own («Andere»).
  field(14, 'experienceBlock', 'divider', 'Bisherige Erfahrung', {
    visibleIf: rule('all', when('priorKnowledge', 'in', ['etwas', 'viel', OTHER_VALUE])),
  }),
  field(15, 'experience', 'text', 'Beschreibe kurz, was du schon kannst', { multiline: true, asProperty: true }),

  // No rule: ends the experience block, so the question below is governed by its own rule only.
  field(16, 'swimBlock', 'divider', ''),
  field(17, 'canSwim300m', 'checkbox', 'Ich kann 300m schwimmen', {
    required: true,
    asProperty: true,
    visibleIf: rule('all', when('dateOfBirth', 'ageLt', 20)),
  }),
];

const CONFIRMATION_VARIANTS = [
  {
    when: rule('all', when('dateOfBirth', 'ageLt', 18)),
    message: 'Danke {firstName}, wir haben die Anmeldung erhalten und melden uns bei deinen Eltern.',
  },
];

const formDefinition = {
  tenants: [TENANT],
  isArchived: false,
  name: 'Kursanmeldung',
  description: 'Anmeldung zu einem Kurs. Der Kurs ergibt sich aus der Seite, auf der das Formular steht.',
  tags: '',
  notes: '',
  formKey: FORM_KEY,
  honeypotKey: 'website',
  encryptionSalt: '',
  encryptionKeyHash: '',
  pdfTemplateId: '',
  target: {
    kind: 'collection',
    mappingKey: 'applications.course',
    modelType: 'ApplicationModel',
    collectionName: 'applications',
  },
  fields: FIELDS,
  derivedValues: [],
  fillerHelpText: 'Je nach Alter siehst du nur die Fragen, die für dich gelten.',
  confirmationMessage: 'Danke {firstName}, wir haben deine Anmeldung erhalten. Du hörst von uns, sobald der Kurs feststeht.',
  confirmationVariants: CONFIRMATION_VARIANTS,
  sendFillerConfirmation: true,
  // Form-wide: open, no deadline, unlimited. The places and the deadline are set per course on its page.
  isOpen: true,
  closesAt: '',
  maxResponses: 0,
  showRemaining: false,
  closedMessage: '',
  rateLimit: { limit: 5, periodMinutes: 10 },
  version: 1,
};

/** Fails loudly when the shape is wrong (mirrors the builder's suites, which the dry run is also checked against). */
function validate() {
  const byId = new Map();
  for (const f of FIELDS) {
    if (byId.has(f.id)) throw new Error(`duplicate field id '${f.id}'`);
    byId.set(f.id, f);
  }
  const inputs = FIELDS.filter((f) => f.type !== 'divider' && f.type !== 'label' && f.type !== 'paragraph');
  const keys = inputs.map((f) => f.key);
  const dup = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dup) throw new Error(`duplicate field key '${dup}'`);
  for (const k of keys) if (!FIELD_KEY_PATTERN.test(k)) throw new Error(`field key '${k}' is not camelCase`);
  for (const f of FIELDS) {
    if (f.allowOther && keys.includes(`${f.key}Other`)) throw new Error(`'${f.key}Other' clashes with the «Andere» text key`);
    if (f.type === 'ssn' || f.key === 'ssnId') throw new Error('no AHV field in this form (R1)');
  }
  const checkRule = (owner, r, mustBeEarlier) => {
    for (const c of r?.conditions ?? []) {
      const ctrl = byId.get(c.fieldId);
      if (!ctrl) throw new Error(`${owner} references unknown field '${c.fieldId}'`);
      if (mustBeEarlier && ctrl.order >= mustBeEarlier.order) throw new Error(`${owner} references field '${c.fieldId}' that is not earlier`);
      if (ctrl.type === 'divider' || ctrl.type === 'label') throw new Error(`${owner} references display field '${c.fieldId}'`);
      if (ctrl.type === 'implicit') throw new Error(`${owner} references implicit field '${c.fieldId}'`);
      if (Array.isArray(c.value) && ctrl.options) {
        const known = new Set([...ctrl.options.map((o) => o.value), ...(ctrl.allowOther ? [OTHER_VALUE] : [])]);
        for (const v of c.value) if (!known.has(v)) throw new Error(`${owner} compares '${v}', not an answer of '${c.fieldId}'`);
      }
    }
  };
  FIELDS.forEach((f, i) => {
    if (f.order !== i) throw new Error(`field '${f.id}' has order ${f.order}, expected ${i}`);
    checkRule(`field '${f.id}'`, f.visibleIf, f);
  });
  formDefinition.confirmationVariants.forEach((v, i) => checkRule(`confirmationVariants.${i}`, v.when));
  if (!FIELDS.some((f) => f.type === 'email')) throw new Error('sendFillerConfirmation needs an e-mail field');
}

function db() {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  return getFirestore();
}

/** The only write path. Never reached with --dry. */
async function write(ref, data) {
  if (DRY) throw new Error('refusing to write with --dry');
  await ref.set(data);
}

async function seed() {
  validate();
  console.log(`\n── formDefinitions/${DOC_ID} ───────────────`);
  console.log(JSON.stringify(formDefinition, null, 2));
  if (DRY) { console.log('\n(--dry: not written)'); return; }
  await write(db().collection('formDefinitions').doc(DOC_ID), formDefinition);
  console.log(`✓ formDefinitions/${DOC_ID}`);
  console.log(`\nformKey '${FORM_KEY}' — place it once per course on a page with a form section (courseId = the course okey); no CMS content was created.`);
}

seed().catch((e) => { console.error(e); exit(1); });
