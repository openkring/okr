/**
 * Seeds the boathouse-reservation FORM DEFINITION that replaces `ReservationApplyModal`
 * (spec planning/specs/2026-08-29-generic-workflow-triggers-spec.md §6b, decision O1).
 *
 * What this buys, beyond deleting a modal:
 *  - the fields become tenant-editable in the form builder;
 *  - the submission inherits the whole `submitForm` gateway (rate limit, honeypot, timing
 *    check, optional captcha, file encryption);
 *  - the reservation is created SERVER-side by `createBoathouseReservation`, where the old
 *    modal's client-side `isReservation()` check cannot be bypassed;
 *  - the Vertragsbedingungen stop being hard-coded German HTML inside a SHARED ui component
 *    (reservation-apply.form.ts) and become one tenant's content.
 *
 * Run with:  node scripts/seed-boathouse-reservation-form.mjs [--dry]
 *            node scripts/seed-boathouse-reservation-form.mjs --apply
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: the document has a fixed id and is written with `set`, so a re-run republishes
 * the current wording rather than creating a second form.
 *
 * AFTER RUNNING, two things are still manual and deliberate:
 *  1. point the button section's config at `form:bootshaus-reservation` (it currently reads
 *     'bhres', which `resolveButtonModal` maps to the legacy domain modal);
 *  2. only THEN delete ReservationApplyModal and its form/validations. Deleting
 *     ReservationApplyModel from shared-models is a schema change and needs a decision.
 *
 * KNOWN DIFFERENCE from the modal, on purpose: `usesTent` and `company` exist on
 * ReservationApplyModel and are written into the reservation's description, but the modal's
 * template never rendered them — they were always false/''. They are real fields here.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { argv, exit } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const TENANT = 'scs';
const FORM_KEY = 'bootshaus-reservation';
const DOC_ID = 'scsBoathouseReservation';
const APPLY = argv.includes('--apply');

const TERMS = "<ol> \n<li>Der <b>Ruderbetrieb</b> hat immer Vorrang. Dazu gehören das Bereitstellen der Boote, das Ein- und\nAuswassern, sowie die Benützung der Garderoben und Toiletten. Ebenfalls sind die Mitgliederrechte\ngemäss Ziffer 1.b) zu gewährleisten. Eine Ausnahme stellt die Mitbenutzung des Aussencheminées\ndurch ein nicht an der Veranstaltung teilnehmendes Mitglied dar. Dies ist nur nach Absprache mit der\nMieterin/dem Mieter möglich.</li> \n<li>Für einen genehmigten Anlass dürfen <b>Fahrzeuge</b> fur das Anliefern und Abtransportieren von\nMaterialien jeweils fur maximal eine halbe Stunde das Grundstück befahren und dort abgestellt\nwerden.</li> \n<li>Das Aufstellen von <b>Zelten</b> auf der Spielwiese ist nur in Absprache mit der für die Infrastruktur\nzuständigen Person gestattet. Die Beseitigung von allfälligen Rasenschäden, welche nicht innerhalb\nvon zwei Wochen auswachsen, werden durch die für die Infrastruktur zuständige Person organisiert\nund müssen von der Mieterin/vom Mieter bezahlt werden.</li> \n<li>Die Benützung von <b>Sportgeräten</b> des Clubs (Ruderboote, Ergometer, Geräte im Kraftraum, und\nMotorboote) durch die Gäste der Mieterin/des Mieters ist untersagt. Gästen unter 10 Jahren ist das\nBetreten des Clubhauses nur unter Aufsicht erlaubt.</li> \n<li>Die <b>Tore</b> zu den Bootshallen sind während der gesamten Veranstaltung geschlossen zu halten\n(Ausnahme ist der Ruderbetrieb). Die Bootshallen dürfen nicht betreten werden. Zwischen der\nHaupteingangstüre und der Treppe ist mit Absperrband ein Durchgang einzurichten. Die\nAbsperrbänder dürfen nicht übertreten werden. Ein allfällig gemieteter Kühlschrank ist links von der\nHaupteingangstüre an der Hausmauer aufzustellen. Beispielbilder sind auf der folgenden Seite zu\nfinden.</li> \n<li>Veranstaltungen müssen um 24.00 Uhr <b>beendet</b> sein und das Areal ist bis 00.30 Uhr zu verlassen.\nVerlängerungen im Rahmen der gesetzlichen Bestimmungen sind auf Beschluss des Vorstandes\nmöglich. Eine allfällige Polizeibewilligung muss von der Mieterin/vom Mieter bei der\nGemeindebehörde eingeholt werden. </li> \n<li>Der Seeclub Stäfa lehnt jegliche <b>Verantwortung</b> für allfällige Übertretungen oder Verzeigungen ab, die\ndurch die betreffende Mieterin/den betreffenden Mieter verursacht wurden.</li> \n<li>Die Aufräumarbeiten sind durch die Mieterin/den Mieter in der Regel unmittelbar nach der\nVeranstaltung durchzuführen. Falls die Lichtverhältnisse eine gründliche Reinigung und Kontrolle der\nAussenanlagen nicht zulassen, so ist am Folgetag bis spätestens 9.00 Uhr eine Nachreinigung\ndurchzuführen. </li> \n<li>Allfällige Beanstandungen durch die für die Infrastruktur zuständige Person oder andere\nVorstandsmitglieder sind im Rahmen der gesetzten Frist zu beheben. Andernfalls werden sie zu\nLasten der Mieterin/des Mieters behoben.</li> \n<li>\nDie <b>Mietgebühr</b> bezieht sich auf die Veranstaltungsdauer und das Ausmass der Benutzung der\nvorhandenen Infrastruktur.<br />\nFür die Benutzung des Areals und der Einrichtungen (Wiese, Aussencheminée, sanitäre Anlagen,\nGarderoben, Küche) sind folgende Gebühren zu entrichten:<br />\nGrundgebühr: CHF 300, ab 50 Gästen CHF 400.-<br />\nZuschlag beim Aufstellen eines Zeltes: CHF 200.-<br />\nDie Gebühr muss 5 Tage vor der Durchführung des Anlasses bezahlt werden.</li> \n<li>Die Mieterin/der Mieter setzt sich mindestens eine Woche vor der Veranstaltung mit der\nzuständigen Person für die Infrastruktur in Verbindung, damit alle nötigen Details und Fragen geklärt werden können.</li> \n<li>Eine <b>Absage</b> der Veranstaltung ist mindestens 3 Tage vor der Veranstaltung der für die Vermietung\nverantwortlichen Person mitzuteilen. Spätere Absagen berechtigen nicht zu einer Erstattung der\nbereits bezahlten Mietgebühr.</li> </ol> \n<p> Neben den vertraglichen Bedingungen erklärt sich die Mieterin/der Mieter einverstanden mit den im\nAllgemeinen Reglement für die Benutzung des Clubareals\" festgelegten Bedingungen. Bei abweichenden Vorschriften gehen die mietvertraglichen Bedingungen vor. </p> \n<p> Bei Nichteinhaltung von Vertragsbedingungen oder des Allgemeinen Reglements werden daraus\nentstehende Kosten der Mieterin/dem Mieter nachträglich in Rechnung gestellt (Reparaturen, Reinigung,\nnicht nachgefülltes Brennholz, nicht mitgenommene volle Abfallsäcke, herumliegende\nZigarettenstummeln etc.). Der Vorstand behält sich zudem das Recht vor, die Mieterin/den Mieter für\nzukünftige Veranstaltungen zu sperren.\n</p>";

const field = (order, key, type, label, extra = {}) => ({
  id: key, key, type, label, required: false, width: 'full', order, ...extra,
});

const FIELDS = [
  field(1, 'name', 'text', 'Anlass', {
    required: true, placeholder: 'Name der Reservation',
    helpText: 'Eine kurze Beschreibung.', maxLength: 50, minLength: 5, width: 'half',
  }),
  // reservation_reason as a dropdown: the builder has no category-select field type, so the
  // options are the category's item NAMES. Keep them in sync with the reservation_reason
  // category if a tenant edits it.
  field(2, 'reason', 'dropdown', 'Grund', {
    required: true, width: 'half',
    // The twelve items of the live `reservation_reason` category, in its own order, with the
    // labels from libs/relationship/reservation/feature/src/i18n/de.json (verified 2026-08-30).
    // The builder has no category-select field type, so these are a snapshot: a tenant that
    // edits the category has to edit this form too.
    options: [
      { label: 'Sozialer Anlass', value: 'social' },
      { label: 'Unterhalt / Reparatur', value: 'maintenance' },
      { label: 'Sportanlass', value: 'sport' },
      { label: 'Geschäftsanlass', value: 'business' },
      { label: 'Privatanlass', value: 'private' },
      { label: 'Öffentlicher Anlass', value: 'public' },
      { label: 'Lagerung', value: 'storage' },
      { label: 'Clubanlass', value: 'club' },
      { label: 'Kurs', value: 'course' },
      { label: 'Workshop', value: 'workshop' },
      { label: 'Besprechung', value: 'meeting' },
      { label: 'Party', value: 'party' },
    ],
  }),
  field(3, 'fullDay', 'checkbox', 'Ganztägig', {
    helpText: 'Die Reservation gilt während des ganzen Tages.', width: 'half',
  }),
  field(4, 'startDate', 'date', 'Startdatum', {
    required: true, placeholder: 'TT.MM.JJJJ',
    helpText: 'Die Reservation ist ab diesem Datum gültig.', width: 'half',
  }),
  field(5, 'startTime', 'time', 'Startzeit', { placeholder: 'HH:MM', width: 'half' }),
  field(6, 'durationMinutes', 'number', 'Dauer (Minuten)', {
    placeholder: 'nnn', helpText: 'Die Dauer der Reservation in Minuten.',
    min: 15, integer: true, width: 'half',
  }),
  field(7, 'endDate', 'date', 'Enddatum', {
    placeholder: 'TT.MM.JJJJ', helpText: 'Die Reservation endet an diesem Datum. Leer lassen für einen einzelnen Tag.',
    width: 'half',
  }),
  field(8, 'participants', 'text', 'Teilnehmer', {
    placeholder: 'Teilnehmer',
    helpText: 'Hier kannst du die Teilnehmer etwas beschreiben, wer kommt, wieviele etc.',
    maxLength: 50, width: 'half',
  }),
  field(9, 'area', 'text', 'Bereich', {
    placeholder: 'Bereich',
    helpText: 'Eine genauere Ortsbezeichnung, falls verschiedene Bereiche reserviert werden können (z.B. Sitzungsraum).',
    maxLength: 20, width: 'half',
  }),
  field(10, 'usesTent', 'checkbox', 'Zelt', {
    helpText: 'Für ein Zelt auf der Spielwiese gilt Ziffer 3 und ein Zuschlag nach Ziffer 10.',
    width: 'half',
  }),
  field(11, 'company', 'text', 'Firma', {
    helpText: 'Falls du im Namen einer Firma reservierst.', maxLength: 50, width: 'half',
  }),
  field(12, 'description', 'text', 'Hinweise zur Reservation', {
    multiline: true, maxLength: 500,
    placeholder: 'Diese Hinweise sind für alle Anwender sichtbar. Du kannst beliebige Kontext-Information einfügen, welche für diese Reservation wichtig sind.',
  }),
  field(13, 'terms', 'label', 'Vertragsbedingungen', { helpText: TERMS }),
  field(14, 'isConfirmed', 'checkbox', 'Hiermit bestätige ich, die obigen Bestimmungen gelesen zu haben und mich daran zu halten.', {
    required: true,
    helpText: 'Die Vermietung der Clubanlagen erfolgt nur, wenn die obigen Bestimmungen eingehalten werden. Der Club behält sich vor, bei Missachtung der Bestimmungen die Veranstaltung abzusagen oder dem Mieter allfällige Schäden oder Mehraufwände zu verrechnen.',
  }),
];

const formDefinition = {
  tenants: [TENANT],
  isArchived: false,
  name: 'Reservation Bootshaus',
  tags: '',
  notes: 'Seeded by scripts/seed-boathouse-reservation-form.mjs',
  formKey: FORM_KEY,
  honeypotKey: 'website',
  encryptionSalt: '',
  encryptionKeyHash: '',
  pdfTemplateId: '',
  description: 'Reservation des Bootshauses. Ersetzt ReservationApplyModal (Spec 1.44 §6b).',
  target: {
    kind: 'collection',
    mappingKey: 'reservations.boathouse',
    modelType: 'ReservationModel',
    collectionName: 'reservations',
  },
  fields: FIELDS,
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: 'seed-boathouse-reservation-form.mjs',
};

if (!APPLY) {
  console.log(`formDefinitions/${DOC_ID} (dry run)\n`);
  console.log(JSON.stringify(formDefinition, null, 2));
  console.log('\ndry run — re-run with --apply to write');
  exit(0);
}

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
await db.collection('formDefinitions').doc(DOC_ID).set(formDefinition);
console.log(`✓ formDefinitions/${DOC_ID} (formKey '${FORM_KEY}')`);
console.log(`Next: set the button section's config to 'form:${FORM_KEY}'.`);
