import Handlebars from 'handlebars';
import type { IndexRow, SubjectDataBundle } from './gather';

/**
 * D-P5-3 export — renders the *human-readable* half of a GDPR/revDSG subject-access
 * export: a self-contained `report.html` a member can open straight out of the
 * downloaded ZIP (no server, possibly offline), plus a plain-language `README.txt`.
 *
 * The machine-readable half (raw JSON per collection) is a different task; this file
 * only turns `SubjectDataBundle` (see `gather.ts`) into prose.
 *
 * SECURITY: `bundle.full`/`bundle.index` values are member-supplied data (names,
 * notes, free text) rendered straight into HTML. Handlebars' default `{{ }}` mustache
 * HTML-escapes every interpolation; this file MUST NEVER use a triple-stash `{{{ }}}`
 * anywhere, or a crafted name (`<img src=x onerror=...>`) becomes a script that runs
 * the moment the member opens the export. See `report.spec.ts` for the regression test.
 */

/** Homeserver hostname is deployment-specific and not part of `SubjectDataBundle` or
 * this function's parameters. Filled in by the caller (or by a future task that wires
 * the tenant's actual Matrix `server_name` through) — see the report accompanying this
 * task for the exact value to substitute per tenant. */
const HOMESERVER_PLACEHOLDER = '[HOMESERVER-HOSTNAME einsetzen]';

// ---------------------------------------------------------------------------
// View-model: SubjectDataBundle -> plain data the template can iterate without
// needing any Handlebars helper (no helper means nothing can accidentally bypass
// the default escaping by returning a Handlebars.SafeString).
// ---------------------------------------------------------------------------

interface FullSectionField {
  readonly key: string;
  readonly value: string;
}

interface FullSectionRow {
  readonly fields: readonly FullSectionField[];
}

interface FullSection {
  readonly label: string;
  readonly collection: string;
  readonly rows: readonly FullSectionRow[];
}

interface IndexSection {
  readonly label: string;
  readonly collection: string;
  readonly rows: readonly IndexRow[];
}

/**
 * Every collection this file can be asked to label. MUST cover every row in
 * `SUBJECT_DATA_MAP` with `onExport: 'full' | 'index'` — enforced by
 * `report.spec.ts`'s "labels every exported collection" test, which walks the map and
 * fails the moment a new exported row has no entry here. Without that guard a raw
 * Firestore collection name (`scs-memberfees`, `personal-rels`, …) leaks into an
 * otherwise all-German legal document as soon as someone adds a row upstream and
 * forgets this file exists.
 *
 * Values are the SAME words the member already sees in the app for that data — the
 * corresponding feature lib's `de.json` `list.title` (or the closest equivalent) —
 * not an invented translation of the internal collection name. Source noted per row;
 * three collections (`invoice-positions`, `stats_members`) have no member-facing list
 * view of their own, so the label is the nearest shipped term for that concept
 * (documented inline) rather than a guess.
 */
export const COLLECTION_LABELS: Record<string, string> = {
  // — identity / membership —
  persons: 'Personendaten',
  users: 'Benutzerkonto',
  avatars: 'Avatare', // libs/avatar/ui/src/i18n/de.json: avatars.title
  addresses: 'Adressen', // libs/subject/address/feature/src/i18n/de.json: addresses
  memberships: 'Mitgliedschaften',
  ownerships: 'Nutzungen', // libs/relationship/ownership/feature/src/i18n/de.json: list.all.title
  workrels: 'Beschäftigungen', // libs/relationship/workrel/feature/src/i18n/de.json: list.title
  'personal-rels': 'Persönliche Beziehungen', // libs/relationship/personal-rel/feature/src/i18n/de.json: list.title
  invitations: 'Einladungen', // libs/relationship/invitation/feature/src/i18n/de.json: invitations
  responsibilities: 'Verantwortlichkeiten', // libs/relationship/responsibility/feature/src/i18n/de.json: list.title
  groups: 'Gruppen',
  // competition-levels is an admin-only derived cache with no member-facing list of
  // its own; "Wettkampf-Kategorien" is the label already shipped for this exact data
  // in the AOC admin tool (libs/aoc/feature/src/i18n/de.json).
  'competition-levels': 'Wettkampf-Kategorien',
  // "Anmeldungen" (the previous label here) collides with the login/auth terminology
  // used elsewhere in this same document (`sessions`, `logAuth`) — this collection is
  // the membership APPLICATION, whose shipped list title is "Anträge"
  // (libs/subject/application/feature/src/i18n/de.json: list.title).
  applications: 'Anträge',

  // — financial (10-year retention) —
  bookings: 'Buchungen', // libs/finance/booking/feature/src/i18n/de.json: list.title
  invoices: 'Rechnungen',
  // invoice-positions has no page of its own — it's edited inline inside the invoice
  // form; "Rechnungsposition(en)" is the term the invoice feature already uses for
  // this exact concept (libs/finance/invoice/feature/src/i18n/de.json).
  'invoice-positions': 'Rechnungspositionen',
  'scs-memberfees': 'Mitgliedergebühren', // libs/relationship/membership/feature/src/i18n/de.json: scsMemberFee.list.title
  bills: 'Kreditoren-Rechnungen', // libs/finance/bill/feature/src/i18n/de.json: list.title
  expenses: 'Spesen',
  'payment-orders': 'Zahlungsaufträge',
  paymentOrders: 'Zahlungsaufträge',

  // — authored content —
  tasks: 'Aufgaben',
  comments: 'Kommentare',
  docs: 'Dokumente',
  documents: 'Dokumente',
  calevents: 'Kalendereinträge',
  trips: 'Fahrten', // libs/geo/trip/feature/src/i18n/de.json: trips (not "Ausfahrten")
  // stats_members has no list view either — it's the per-member half of the trip
  // logbook's statistics view, already labelled "Personen-Statistik" there
  // (libs/geo/trip/feature/src/i18n/de.json: stats.member_title).
  stats_members: 'Personen-Statistik',
  reservations: 'Reservationen',
  transfers: 'Transfers', // libs/relationship/transfer/feature/src/i18n/de.json: list.title
  whiteboards: 'Whiteboards', // libs/instruments/whiteboard/feature/src/i18n/de.json: plural
  instruments: 'Instrumente', // libs/instruments/feature/src/i18n/de.json: plural
  esignList: 'Unterschriebene Dokumente',
  esignAudit: 'Unterschriften-Protokoll',

  // — logs —
  sessions: 'Anmeldesitzungen',
  activities: 'Aktivitäten', // libs/activity/feature/src/i18n/de.json: title
  logAuth: 'Anmeldeprotokoll',
  docGenerations: 'Erzeugte Dokumente',
};

function humanizeCollectionName(collection: string): string {
  return COLLECTION_LABELS[collection] ?? collection
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

/** Turns any Firestore field value into a printable string. Nested objects/arrays
 * (embedded maps like `AvatarInfo`, or arrays) are rendered as compact JSON rather
 * than silently dropped or stringified into `"[object Object]"`. */
function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildFullSections(bundle: Pick<SubjectDataBundle, 'full'>): FullSection[] {
  return Object.entries(bundle.full).map(([collection, docs]): FullSection => ({
    label: humanizeCollectionName(collection),
    collection,
    rows: docs.map((doc): FullSectionRow => ({
      fields: Object.entries(doc as Record<string, unknown>).map(([key, value]): FullSectionField => ({
        key,
        value: stringifyValue(value),
      })),
    })),
  }));
}

function buildIndexSections(bundle: Pick<SubjectDataBundle, 'index'>): IndexSection[] {
  return Object.entries(bundle.index).map(([collection, rows]): IndexSection => ({
    label: humanizeCollectionName(collection),
    collection,
    rows,
  }));
}

// ---------------------------------------------------------------------------
// report.html template
// ---------------------------------------------------------------------------

// No triple-stash anywhere below: every interpolation is `{{ }}`, so Handlebars'
// default escaping (on by default, `Handlebars.compile` is never called with
// `noEscape: true`) applies to all member-supplied data.
const REPORT_TEMPLATE = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Datenauskunft {{tenantName}}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1b1b1b; margin: 2rem; line-height: 1.4; }
  h1 { border-bottom: 2px solid #333; padding-bottom: 0.4rem; }
  h2 { margin-top: 2rem; color: #234; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
  th, td { border: 1px solid #ccc; padding: 0.35rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; width: 14rem; }
  ul.index-list { padding-left: 1.2rem; }
  ul.index-list li { margin-bottom: 0.3rem; }
  .meta { color: #555; margin-bottom: 1.5rem; }
  .empty { color: #777; font-style: italic; }
</style>
</head>
<body>
<h1>Datenauskunft — {{tenantName}}</h1>
<p class="meta">
  Erstellt am {{generatedAtDate}} um {{generatedAtTime}} Uhr (UTC)&nbsp;·&nbsp;Verantwortliche Stelle: {{tenantName}}
</p>

<h2>Daten, die vollständig enthalten sind</h2>
{{#if fullSections.length}}
{{#each fullSections}}
<h3>{{this.label}}</h3>
{{#if this.rows.length}}
{{#each this.rows}}
<table>
  <tbody>
  {{#each this.fields}}
  <tr><th>{{this.key}}</th><td>{{this.value}}</td></tr>
  {{/each}}
  </tbody>
</table>
{{/each}}
{{else}}
<p class="empty">Keine Einträge.</p>
{{/if}}
{{/each}}
{{else}}
<p class="empty">Keine Einträge.</p>
{{/if}}

<h2>Eigene Inhalte (als Verweis)</h2>
{{#if indexSections.length}}
{{#each indexSections}}
<h3>{{this.label}}</h3>
{{#if this.rows.length}}
<ul class="index-list">
{{#each this.rows}}
<li><a href="{{this.route}}">{{this.title}}</a> — {{this.date}}</li>
{{/each}}
</ul>
{{else}}
<p class="empty">Keine Einträge.</p>
{{/if}}
{{/each}}
{{else}}
<p class="empty">Keine Einträge.</p>
{{/if}}

</body>
</html>
`;

const compiledReportTemplate = Handlebars.compile(REPORT_TEMPLATE);

/**
 * Renders the self-contained `report.html` for a subject-access export.
 *
 * `bundle.full[collection]` (raw documents, verbatim) is rendered as one key/value
 * table per document; `bundle.index[collection]` (title/date/route only, see
 * `gather.ts`) is rendered as a plain link list — never anything more than those
 * three fields, matching the contract that keeps a member's authored content a list
 * of links rather than a wholesale dump.
 */
export function renderExportReport(bundle: SubjectDataBundle, tenantName: string): string {
  return compiledReportTemplate({
    tenantName,
    generatedAtDate: bundle.generatedAt.slice(0, 10),
    generatedAtTime: bundle.generatedAt.slice(11, 16),
    fullSections: buildFullSections(bundle),
    indexSections: buildIndexSections(bundle),
  });
}

// ---------------------------------------------------------------------------
// README.txt — plain text, no HTML, so no escaping helper is needed here.
// ---------------------------------------------------------------------------

/**
 * Renders the plain-language `README.txt` that accompanies the export ZIP.
 *
 * Must state, in German: what the archive contains; that chat message bodies are
 * NOT included and which homeserver holds them (see `HOMESERVER_PLACEHOLDER` above —
 * this function has no parameter to receive the real hostname); that backups are not
 * covered by this export; and who the data controller is (the `controller` param,
 * printed verbatim — not escaped, since this is a `.txt` file, not HTML).
 */
export function renderReadme(tenantName: string, controller: string): string {
  return `Datenauskunft ${tenantName} — Erläuterung zu diesem Archiv
${'='.repeat(`Datenauskunft ${tenantName} — Erläuterung zu diesem Archiv`.length)}

Hallo

Du hast bei ${tenantName} eine Datenauskunft angefordert. Dieses Archiv (ZIP) ist
die Antwort darauf. Es enthält:

  - report.html
    Eine übersichtliche, lesbare Zusammenfassung aller Daten, die wir über dich
    gespeichert haben (Personendaten, Kontaktangaben, Mitgliedschaft, Finanzen
    usw.). Öffne die Datei einfach in einem Browser — sie funktioniert auch
    offline, ohne Internetverbindung.
  - mehrere .json-Dateien
    Dieselben Daten, aber im rohen Datenformat, falls du sie technisch
    weiterverarbeiten möchtest (z.B. in ein anderes Programm importieren).

Was NICHT enthalten ist
------------------------
Die Chat-Nachrichten selbst (die Texte, die du oder andere in einem Gruppenchat
geschrieben haben) sind in diesem Archiv NICHT enthalten. Sie liegen nicht in
unserer eigenen Datenbank, sondern auf dem Matrix-Chat-Server (Homeserver)
${HOMESERVER_PLACEHOLDER}. Wenn du auch diese Nachrichten sehen oder exportieren
möchtest, melde dich bitte direkt bei uns — wir sagen dir dann, wie das geht.

Ausserdem gilt: Dieses Archiv zeigt dir den aktuellen Stand unserer Daten. Ältere
Sicherungskopien (Backups), die wir aus technischen Gründen für eine begrenzte
Zeit aufbewahren, sind hier nicht enthalten und werden durch dieses Archiv nicht
abgedeckt.

Wer ist verantwortlich?
------------------------
Verantwortlich für die Daten in diesem Archiv ist:
${controller}

Bei Fragen zu dieser Auskunft wende dich bitte an diese Stelle.
`;
}
