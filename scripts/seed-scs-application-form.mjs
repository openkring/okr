/**
 * 1.125 phase A, spec §13.1 — seeds the ONE SCS membership application form «Anmeldung» (renamed
 * from «Mitgliedschaft beantragen» in 1.152, formKey unchanged; course field per 1.152 §7)
 * (tenant `scs`, mapping `applications.default`) that replaces the four old forms, and
 * repairs the duplicate field key `field_11` in two existing form definitions (spec §7.3).
 *
 * Run with:  node scripts/seed-scs-application-form.mjs [--dry]                 seed the form
 *            node scripts/seed-scs-application-form.mjs [--dry] --repair-keys   repair the two forms
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * ⚠️ THE REAL RUN (without --dry) WRITES PRODUCTION FIRESTORE AND IS THE OWNER'S: run it only after
 * the functions (`submitForm`) and the app release of 1.125 phase A are deployed, in that order —
 * an older `submitForm` ignores `visibleIf` / `derivedValues` / `asProperty` and would store every
 * answer, including the hidden ones.
 *
 * Flags:
 *   --dry           print the documents and exit; NEVER writes (the guard sits in `write()`).
 *                   Seeding needs no network. With --repair-keys it READS the two stored
 *                   definitions to print before/after (a read only); without credentials it prints
 *                   the planned rename instead.
 *   --repair-keys   run ONLY the repair (not the seed, so a later run cannot clobber edits the
 *                   owner made to the seeded form). Renames the SECOND `field_11` (the checkbox
 *                   «Ich kann 300m schwimmen») to `canSwim300m` in formDefinitions/
 *                   wytl3en79g8ox5hg10uh and formDefinitions/z6xtg2kt1ziieght78tn. Idempotent:
 *                   once no checkbox with key `field_11` is left, a re-run changes nothing.
 *
 * The seed is idempotent: a fixed document id and `set`, so a re-run republishes the current
 * wording rather than creating a second form. NO CMS section and NO page is created — the owner
 * places the form (formKey `mitgliedschaft-beantragen`) where it belongs.
 *
 * Conditions reference the controlling field's `id`, never its `key`, and only fields with a lower
 * `order`. Here `id === key` for every field. `validate()` below checks that before anything is
 * printed or written and fails loudly.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { argv, exit } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const TENANT = 'scs';
const FORM_KEY = 'mitgliedschaft-beantragen';
const DOC_ID = 'scsMembershipApplication';
const DRY = argv.includes('--dry');
const REPAIR = argv.includes('--repair-keys');

const REPAIR_DOC_IDS = ['wytl3en79g8ox5hg10uh', 'z6xtg2kt1ziieght78tn'];
const DUPLICATE_KEY = 'field_11';
const REPAIRED_KEY = 'canSwim300m';

const field = (order, key, type, label, extra = {}) => ({
  id: key, key, type, label, required: false, width: 'full', order, ...extra,
});
const rule = (match, ...conditions) => ({ match, conditions });
const when = (fieldId, op, value) => (value === undefined ? { fieldId, op } : { fieldId, op, value });

// A divider's rule is the block rule: it governs the divider and every field up to the next divider.
// Required flags mirror `applicationValidations` (libs/subject/application/util), so a submitted application
// can always be saved in the edit modal. `phone` is required for everyone: the suite needs it for adults and
// transfers, and for youth it accepts the own phone or the guardian's — always asking for the own phone is the
// one setting that never leaves an application unsaveable (a required flag cannot depend on the age).
const FIELDS = [
  field(0, 'firstName', 'text', 'Vorname', { required: true, width: 'half' }),
  field(1, 'lastName', 'text', 'Nachname', { required: true, width: 'half' }),
  field(2, 'gender', 'category', 'Geschlecht', { required: true, categoryName: 'gender' }),
  field(3, 'dateOfBirth', 'date', 'Geburtsdatum', { required: true }),
  // Same age limit as `needsSsn` (youth or under 20). An `ssn` field: the server checks the number
  // (EAN-13), stores it as 13 digits in the application only and shows it as «angegeben» in the
  // notification e-mail — it never reaches a task note, a workflow event or an export.
  field(4, 'ssnId', 'ssn', 'AHV-Nummer', {
    required: true,
    visibleIf: rule('all', when('dateOfBirth', 'ageLt', 20)),
  }),
  field(5, 'email', 'email', 'E-Mail', { required: true, width: 'half' }),
  field(6, 'phone', 'phone', 'Telefon', { required: true, width: 'half', region: 'CH' }),
  // address rows tile: street + number (½ + ½), then zip + city + country (⅓ each)
  field(7, 'streetName', 'text', 'Strasse', { required: true, width: 'half' }),
  field(8, 'streetNumber', 'text', 'Nr.', { required: true, width: 'half' }),
  field(9, 'zipCode', 'text', 'PLZ', { required: true, width: 'third' }),
  field(10, 'city', 'text', 'Ort', { required: true, width: 'third' }),
  field(11, 'countryCode', 'text', 'Land', { required: true, width: 'third' }),

  field(12, 'rowingExperience', 'checkbox', 'Ich bin schon gerudert', {
    asProperty: true,
    visibleIf: rule('all', when('dateOfBirth', 'ageGte', 20)),
  }),

  field(13, 'rowingBlock', 'divider', 'Rudererfahrung', {
    visibleIf: rule('all', when('rowingExperience', 'isChecked')),
  }),
  field(14, 'previousClub', 'text', 'Bisheriger Club', { asProperty: true }),

  // Under 18 (by year of birth), the age at which applicationValidations requires the guardian's
  // names (`needsGuardian`). An 18- or 19-year-old is still a youth applicant (applicationAs below)
  // but applies without a guardian.
  field(15, 'guardianBlock', 'divider', 'Erziehungsberechtigte Person', {
    visibleIf: rule('all', when('dateOfBirth', 'ageLt', 18)),
  }),
  field(16, 'parentFirstName', 'text', 'Vorname', { required: true, width: 'half' }),
  field(17, 'parentLastName', 'text', 'Nachname', { required: true, width: 'half' }),
  field(18, 'parentEmail', 'email', 'E-Mail', { required: true, width: 'half' }),
  field(19, 'parentPhone', 'phone', 'Telefon', { width: 'half', region: 'CH' }),

  // No rule on this divider: it ends the guardian block so the field below is governed by its own rule.
  field(20, 'swimBlock', 'divider', ''),
  field(21, 'canSwim300m', 'checkbox', 'Ich kann 300m schwimmen', {
    required: true,
    asProperty: true,
    visibleIf: rule('all', when('dateOfBirth', 'ageLt', 20)),
  }),

  // 1.152 §7 — the announced courses for the derived applicant type. Optional (A3); the server re-checks
  // audience, announcement and places. The visibleIf matters: without a date of birth `applicationAs`
  // falls back to 'adult', so adult courses would show before the age is known.
  field(22, 'courseKey', 'course', 'Möchtest du dich gleich für einen Kurs anmelden?', {
    audienceFrom: 'applicationAs',
    visibleIf: rule('all', when('dateOfBirth', 'isFilled')),
  }),
];

// Spec §6 — the server derives `applicationAs`; the filler never types it. First matching case wins.
const DERIVED_VALUES = [
  {
    key: 'applicationAs',
    cases: [
      { when: rule('all', when('dateOfBirth', 'ageLt', 20)), value: 'youth' },
      { when: rule('all', when('rowingExperience', 'isChecked')), value: 'transfer' },
    ],
    otherwise: 'adult',
  },
];

const RATE_LIMIT = { limit: 5, periodMinutes: 10 };

const formDefinition = {
  tenants: [TENANT],
  isArchived: false,
  name: 'Anmeldung',
  description: 'Eine Anmeldung für alle: Junioren, Kandidierende und Quereinsteiger. Die Art der Anmeldung ergibt sich aus Alter und Rudererfahrung.',
  tags: '',
  notes: '',
  formKey: FORM_KEY,
  honeypotKey: 'website',
  encryptionSalt: '',
  encryptionKeyHash: '',
  pdfTemplateId: '',
  target: {
    kind: 'collection',
    mappingKey: 'applications.default',
    modelType: 'ApplicationModel',
    collectionName: 'applications',
  },
  fields: FIELDS,
  derivedValues: DERIVED_VALUES,
  fillerHelpText: 'Je nach Alter und Rudererfahrung siehst du nur die Fragen, die für dich gelten.',
  rateLimit: RATE_LIMIT,
  version: 1,
};

/** Fails loudly when a rule points to a missing, later or equal-order field. */
function validate() {
  const byId = new Map();
  for (const f of FIELDS) {
    if (byId.has(f.id)) throw new Error(`duplicate field id '${f.id}'`);
    byId.set(f.id, f);
  }
  const keys = FIELDS.filter((f) => f.type !== 'divider').map((f) => f.key);
  const dup = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dup) throw new Error(`duplicate field key '${dup}'`);
  FIELDS.forEach((f, i) => {
    if (f.order !== i) throw new Error(`field '${f.id}' has order ${f.order}, expected ${i}`);
    for (const c of f.visibleIf?.conditions ?? []) {
      const ctrl = byId.get(c.fieldId);
      if (!ctrl) throw new Error(`'${f.id}' references unknown field '${c.fieldId}'`);
      if (ctrl.order >= f.order) throw new Error(`'${f.id}' references field '${c.fieldId}' that is not earlier`);
      if (ctrl.type === 'divider' || ctrl.type === 'label') throw new Error(`'${f.id}' references display field '${c.fieldId}'`);
    }
  });
  for (const d of DERIVED_VALUES) {
    for (const k of d.cases) {
      for (const c of k.when.conditions) {
        if (!byId.has(c.fieldId)) throw new Error(`derived '${d.key}' references unknown field '${c.fieldId}'`);
      }
    }
    if (keys.includes(d.key)) throw new Error(`derived key '${d.key}' equals an input field key`);
  }
}

function db() {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  return getFirestore();
}

/** The only write path. Never reached with --dry. */
async function write(ref, data, mode) {
  if (DRY) throw new Error('refusing to write with --dry');
  await (mode === 'update' ? ref.update(data) : ref.set(data));
}

const brief = (f) => `${f.order}  id=${f.id}  key=${f.key}  type=${f.type}  "${f.label}"`;

async function repairKeys() {
  let client = null;
  try {
    client = db();
  } catch (e) {
    console.log(`(no Firestore client: ${e.message})`);
  }
  for (const id of REPAIR_DOC_IDS) {
    const path = `formDefinitions/${id}`;
    console.log(`\n── ${path} ───────────────`);
    let data = null;
    try {
      const snap = client ? await client.collection('formDefinitions').doc(id).get() : null;
      if (snap) {
        if (!snap.exists) { console.log('  not found — nothing to do'); continue; }
        data = snap.data();
      }
    } catch (e) {
      console.log(`  cannot read ${path}: ${e.message}`);
    }
    if (!data) {
      if (!DRY) throw new Error(`cannot read ${path} — nothing written`);
      console.log(`  credentials unavailable — cannot show before/after. Planned: in ${path}, rename the checkbox with`);
      console.log(`  key '${DUPLICATE_KEY}' ("Ich kann 300m schwimmen") to key '${REPAIRED_KEY}'. The field id stays unchanged.`);
      continue;
    }
    const fields = Array.isArray(data.fields) ? data.fields : [];
    const sharing = fields.filter((f) => f.key === DUPLICATE_KEY);
    console.log(`  ${data.name} (${data.formKey}) — fields with key '${DUPLICATE_KEY}':`);
    sharing.forEach((f) => console.log(`    before: ${brief(f)}`));
    const target = sharing.find((f) => f.type === 'checkbox');
    if (!target) { console.log(`  no checkbox with key '${DUPLICATE_KEY}' — nothing to do`); continue; }
    if (fields.some((f) => f.key === REPAIRED_KEY)) { console.log(`  key '${REPAIRED_KEY}' already exists — nothing to do`); continue; }
    const next = fields.map((f) => (f === target ? { ...f, key: REPAIRED_KEY } : f));
    const after = next.find((f) => f.id === target.id);
    console.log(`    after:  ${brief(after)}`);
    if (DRY) { console.log('  (--dry: not written)'); continue; }
    await write(client.collection('formDefinitions').doc(id), { fields: next }, 'update');
    console.log(`  ✓ ${path}`);
  }
}

async function seed() {
  validate();
  console.log(`\n── formDefinitions/${DOC_ID} ───────────────`);
  console.log(JSON.stringify(formDefinition, null, 2));
  if (DRY) { console.log('\n(--dry: not written)'); return; }
  await write(db().collection('formDefinitions').doc(DOC_ID), formDefinition, 'set');
  console.log(`✓ formDefinitions/${DOC_ID}`);
  console.log(`\nformKey '${FORM_KEY}' — place it on a page / section yourself; no CMS content was created.`);
}

(REPAIR ? repairKeys() : seed()).catch((e) => { console.error(e); exit(1); });
