#!/usr/bin/env node
/**
 * The two forms of the old www.la21staefa.ch «Verein» menu, rebuilt in the form builder (1.165):
 *
 *  - Anmeldeformular (/verein/anmeldeformular)   → formDefinitions/la21staefaMembership,
 *    target `applications.default`: every Anmeldung is an application in the app.
 *  - Kontaktformular (/verein/anmeldeformular-2) → formDefinitions/la21staefaContact,
 *    target `mail`: nothing is stored, the message goes to the section's `emailAddresses`.
 *
 * Each form gets a `form` section on its website page (pages/la21staefa_anmeldung, pages/la21staefa_kontakt).
 * The section is what the website embeds (`data-okr-form` + `data-section`) and carries the board mail
 * recipients. The Anmeldung page's placeholder text («schreib uns per E-Mail…», import-pages FORM_PAGES)
 * is replaced by the original intro, but only while nobody has edited it.
 *
 * Wording uses «Sie», as on the original site (decided 2026-11-20).
 * Project groups are single boolean checkboxes, not one checkbox list: a list cannot be an
 * application property (`propertyTypeOf` → undefined) and would land as an unschema'd top-level field.
 *
 * Dry run by default; --write creates documents that do not exist yet and never overwrites edits.
 *
 *   node scripts/la21staefa/seed-forms.mjs [--write]
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORM_PAGES } from './import-pages.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));

const T = 'la21staefa';
const BOARD_MAIL = ['info@la21staefa.ch'];
const RATE_LIMIT = { limit: 5, periodMinutes: 10 };

const field = (key, type, label, order, extra = {}) => ({ id: key, key, type, label, required: false, width: 'full', order, ...extra });

/** the project groups of the old form, in its order; key = boolean application property */
export const PROJECT_GROUPS = [
  ['pgBauEnergie', 'Bau & Energie'],
  ['pgBegegnungIntegration', 'Begegnung & Integration'],
  ['pgBtvz', 'BTVZ – Bauteilvermittlung Zürichsee-Oberland'],
  ['pgKiss', 'KISS Stäfa – Nachbarschaftshilfe'],
  ['pgLokalFair', 'Lokal & Fair'],
  ['pgNettswerk', 'Nettswerk Träff – Freiwilliges Engagement für Geflüchtete'],
  ['pgOaseKirchbuehl', 'Oase Kirchbühl – Permakultur'],
  ['pgQatira', 'Qatira – Sport und Spiel mit Geflüchteten'],
  ['pgReparaturCafe', 'Reparatur Café Stäfa'],
  ['pgSmaert', 'SMäRT – Der Stäfner Wochenmarkt'],
  ['pgStaefNet', 'StäfNet – Bringt Leben ins Dorf'],
  ['pgZukunftsbuero', 'Zukunftsbüro Stäfa'],
];

const membershipFields = () => {
  const f = [
    field('firstName', 'text', 'Vorname', 0, { required: true, width: 'half', maxLength: 100 }),
    field('lastName', 'text', 'Nachname', 1, { required: true, width: 'half', maxLength: 100 }),
    field('streetName', 'text', 'Strasse', 2, { required: true, width: 'half', maxLength: 100 }),
    field('streetNumber', 'text', 'Nr.', 3, { required: true, width: 'half', maxLength: 20 }),
    field('zipCode', 'text', 'PLZ', 4, { required: true, width: 'half', maxLength: 10 }),
    field('city', 'text', 'Ort', 5, { required: true, width: 'half', maxLength: 100 }),
    field('email', 'email', 'E-Mail', 6, { required: true }),
    field('membershipType', 'radio', 'Ihre Form der Mitgliedschaft', 7, {
      required: true, asProperty: true,
      options: [
        { value: 'student', label: 'SchülerIn / StudentIn / Lehrling – Jahresbeitrag CHF 15.–' },
        { value: 'single', label: 'Einzelmitglied – Jahresbeitrag CHF 25.–' },
        { value: 'family', label: 'Familienmitglied – Jahresbeitrag CHF 35.–' },
        { value: 'legal', label: 'Juristische Person – Jahresbeitrag CHF 60.–' },
      ],
    }),
    field('projectGroupsBlock', 'divider', 'Ich möchte aktiv bei dieser Projektgruppe mitmachen', 8),
  ];
  PROJECT_GROUPS.forEach(([key, label], i) => f.push(field(key, 'checkbox', label, 9 + i, { width: 'half', asProperty: true })));
  let o = 9 + PROJECT_GROUPS.length;
  f.push(field('engagementBlock', 'divider', '', o++));
  f.push(field('boardMember', 'checkbox', 'Ich möchte beim Vorstand mitmachen', o++, { asProperty: true }));
  f.push(field('passiveMember', 'checkbox', 'Ich möchte einfach Passiv-Mitglied sein', o++, { asProperty: true }));
  f.push(field('message', 'text', 'Ihre Nachricht', o++, {
    multiline: true, maxLength: 5000, asProperty: true, helpText: 'Haben Sie eine Frage an uns? Dann fragen Sie einfach.',
  }));
  return f;
};

const formBase = {
  tenants: [T], isArchived: false, tags: '', pdfTemplateId: '', encryptionSalt: '', encryptionKeyHash: '',
  honeypotKey: 'website', derivedValues: [], fillerHelpText: '', confirmationVariants: [], sendFillerConfirmation: false,
  isOpen: true, closesAt: '', maxResponses: 0, showRemaining: false, closedMessage: '', rateLimit: RATE_LIMIT, version: 1,
};

export const FORMS = {
  la21staefaMembership: {
    ...formBase,
    name: 'Anmeldeformular',
    formKey: 'anmeldeformular',
    description: 'Anmeldung als Mitglied der Lokalen Agenda 21 Stäfa (Website). Jede Anmeldung wird ein Antrag in «Anträge».',
    notes: 'von www.la21staefa.ch/verein/anmeldeformular übernommen (1.165)',
    target: { kind: 'collection', mappingKey: 'applications.default', modelType: 'ApplicationModel', collectionName: 'applications' },
    confirmationMessage: 'Vielen Dank, {firstName}. Wir haben Ihre Anmeldung erhalten und melden uns bei Ihnen.',
    fields: membershipFields(),
  },
  la21staefaContact: {
    ...formBase,
    name: 'Kontaktformular',
    formKey: 'kontakt',
    description: 'Kontaktformular der Website. Nachrichten werden nicht gespeichert, sondern per E-Mail an info@la21staefa.ch zugestellt.',
    notes: 'von www.la21staefa.ch/verein/anmeldeformular-2 übernommen (1.165)',
    target: { kind: 'mail' },
    confirmationMessage: 'Vielen Dank, {firstName}. Ihre Nachricht ist bei uns angekommen. Wir melden uns in Kürze.',
    fields: [
      field('firstName', 'text', 'Vorname', 0, { required: true, width: 'half', maxLength: 100 }),
      field('lastName', 'text', 'Nachname', 1, { required: true, width: 'half', maxLength: 100 }),
      field('email', 'email', 'E-Mail', 2, { required: true }),
      field('message', 'text', 'Kommentare', 3, {
        required: true, multiline: true, minLength: 10, maxLength: 5000,
        helpText: 'Bitte lassen Sie uns wissen, was Sie auf dem Herzen haben. Haben Sie eine Frage an uns? Dann fragen Sie einfach.',
      }),
    ],
  },
};

const formSection = (key, title, formKey, notes) => ({
  name: key, type: 'form', state: 'published', roleNeeded: 'public', colSize: '12', color: 0, title, subTitle: '',
  notes, content: { htmlContent: '<p></p>', colSize: 3, position: 0 },
  properties: { formKey, implicitValues: {}, emailAddresses: BOARD_MAIL, rateLimit: RATE_LIMIT, showCaptcha: false, encryptFileUpload: false },
  tags: '', isArchived: false, tenants: [T], index: `n:${key} t:form tt:${formKey} st:`,
});

/** page → its form section */
export const SECTIONS = {
  la21staefa_anmeldung: formSection(`${T}_anmeldung_form`, '', 'anmeldeformular',
    'Anmeldeformular der Website. Jede Anmeldung wird ein Antrag und meldet sich per E-Mail bei info@la21staefa.ch.'),
  la21staefa_kontakt: formSection(`${T}_kontakt_form`, '', 'kontakt',
    'Kontaktformular der Website. Nachrichten gehen per E-Mail an info@la21staefa.ch.'),
};

/** the original intro of the Anmeldung page, replacing the import's placeholder */
export const ANMELDUNG_INTRO = '<p>Wir freuen uns, dass Sie Teil des Vereins für Nachhaltigkeit in Stäfa werden wollen!</p>'
  + '<p>Sie können als aktives Mitglied in einer Projektgruppe mitarbeiten oder im Vorstand der Lokalen Agenda mitwirken. '
  + 'Sie können auch einfach als passives Mitglied den Jahresbeitrag bezahlen und an der jährlichen Mitgliederversammlung teilnehmen.</p>'
  + '<p>Wenn Sie eine Projektgruppe besonders unterstützenswert finden, können Sie auf der jeweiligen '
  + '<a href="/projektgruppen">Projektgruppenseite</a> diese auch mit einer Direktspende mitfinanzieren und Kontakt aufnehmen.</p>';

async function main() {
  const write = process.argv.includes('--write');
  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { getFirestore, FieldValue } = rootRequire('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();
  const verb = (w, d) => (write ? w : d);

  for (const [id, data] of Object.entries(FORMS)) {
    const ref = db.doc(`formDefinitions/${id}`);
    if ((await ref.get()).exists) { console.log(`exists        formDefinitions/${id}`); continue; }
    const clash = await db.collection('formDefinitions').where('formKey', '==', data.formKey).where('tenants', 'array-contains', T).get();
    if (!clash.empty) { console.log(`SKIP          formDefinitions/${id}: formKey '${data.formKey}' already used by ${clash.docs.map(d => d.id).join(', ')}`); continue; }
    console.log(`${verb('creating     ', 'would create ')} formDefinitions/${id} (${data.fields.length} fields, target ${data.target.kind})`);
    if (write) await ref.create({ ...data, createdAt: new Date().toISOString(), createdBy: 'seed-forms' });
  }

  for (const [pageKey, section] of Object.entries(SECTIONS)) {
    const ref = db.doc(`sections/${section.name}`);
    if ((await ref.get()).exists) console.log(`exists        sections/${section.name}`);
    else {
      console.log(`${verb('creating     ', 'would create ')} sections/${section.name}`);
      if (write) await ref.create(section);
    }
    const pageRef = db.doc(`pages/${pageKey}`);
    const page = (await pageRef.get()).data();
    if (!page) { console.log(`MISSING       pages/${pageKey}`); continue; }
    if ((page.sections ?? []).includes(section.name)) console.log(`exists        pages/${pageKey} → ${section.name}`);
    else {
      console.log(`${verb('appending    ', 'would append ')} ${section.name} to pages/${pageKey}`);
      if (write) await pageRef.update({ sections: FieldValue.arrayUnion(section.name) });
    }
  }

  const introRef = db.doc(`sections/${T}_anmeldung_s01`);
  const intro = (await introRef.get()).data();
  if (intro?.content?.htmlContent === FORM_PAGES.la21staefa_anmeldung) {
    console.log(`${verb('replacing    ', 'would replace')} the placeholder text of sections/${T}_anmeldung_s01`);
    if (write) await introRef.update({ 'content.htmlContent': ANMELDUNG_INTRO, title: 'Anmeldung als Mitglied der Lokalen Agenda 21 Stäfa' });
  } else console.log(`kept          sections/${T}_anmeldung_s01 (edited since the import)`);

  if (!write) console.log('\nDry run. Re-run with --write to apply.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
