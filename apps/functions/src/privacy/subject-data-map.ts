import { FieldPath, Filter, getFirestore } from 'firebase-admin/firestore';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import type { AvatarInfo } from '@okr/shared-models';
import type { Blocker, SubjectCtx, SubjectDataEntry } from './types';

/**
 * D-P5-3 — the single enumeration of every collection that holds personal data.
 *
 * Four features read this table and nothing else: the data export, the erasure
 * preview, the erasure executor and the retention audit. If any of them ever
 * enumerates collections on its own they drift apart within a release; that drift is
 * the entire reason this file exists.
 *
 * ## Reading a row
 * - `find`      mirrors the query helpers in `@okr/shared-util-functions` so that no
 *               new composite index is needed. It does NOT filter by tenant — see the
 *               consumer contract on `SubjectDataEntry`.
 * - `matches`   present only where the subject sits inside an array of embedded
 *               `AvatarInfo` maps, which Firestore cannot query. `find` is then a
 *               tenant-scoped scan and the consumer MUST apply `matches`.
 * - `onErasure` `'anonymize'` is reserved for records under a legal retention duty
 *               (GebüV / OR Art. 958f) and for club records whose substance belongs to
 *               the association: amounts, dates and document references stay, only the
 *               name fields and the person key are overwritten. Everything freely
 *               deletable is `'delete'`.
 *
 * ## Key shapes (see `SubjectCtx`)
 * `ctx.personKey` is the raw `persons` doc id and is what `memberKey`, `ownerKey`,
 * `subjectKey`, `authorKey`, `personKey` and every `AvatarInfo.key` store.
 * `ctx.parentKey` is the prefixed `person.<okey>` form and is used ONLY by
 * `addresses.parentKey`, `address-directory.parentKey` and the `avatars` doc id.
 * `ctx.uid` is the Firebase Auth uid = the `users` doc id.
 *
 * The bottom of this file lists every Firestore collection deliberately left out and
 * why. Do not remove those comments — the privacy audit grades this file against the
 * live collection list, so an unexplained omission becomes a permanent false finding.
 */

const db = () => getFirestore();

const RETAIN_10Y = { months: 120, legalBasis: 'GebüV / OR Art. 958f — 10 Jahre Aufbewahrungspflicht' } as const;
const KEEP_WHILE_MEMBER = { months: 'indefinite', legalBasis: 'Vertragserfüllung (Mitgliedschaft)' } as const;
const CLUB_RECORD = { months: 'indefinite', legalBasis: 'Vereinsdokumentation (berechtigtes Interesse)' } as const;
const APPLICATION_RECORD = { months: 24, legalBasis: 'Nachweis über das Aufnahmeverfahren — 2 Jahre' } as const;
const LOG_12M = { months: 12, legalBasis: 'Betriebssicherheit und Missbrauchserkennung — 12 Monate' } as const;
const LOG_24M = { months: 24, legalBasis: 'Nachvollziehbarkeit von Datenänderungen — 24 Monate' } as const;

/** Reads a nested `AvatarInfo` array field and tells whether the subject is in it. */
function avatarArrayHolds(doc: DocumentSnapshot, field: string, personKey: string): boolean {
  const list = doc.get(field) as AvatarInfo[] | undefined;
  return Array.isArray(list) && list.some((a) => a?.key === personKey && a?.modelType === 'person');
}

function blockOpenInvoice(count: number, detail: string): Blocker | undefined {
  return count === 0 ? undefined : { code: 'openInvoice', count, detail };
}

export const SUBJECT_DATA_MAP: readonly SubjectDataEntry[] = [
  // ─────────────────────────────── identity & consent ───────────────────────────────
  {
    collection: 'persons',
    dataClass: 'identity',
    // `okey` is the document id and is stripped before every write — it is NOT a field,
    // so this must be a documentId() query, not `where('okey', '==', …)`.
    find: (c: SubjectCtx) => db().collection('persons').where(FieldPath.documentId(), '==', c.personKey),
    onExport: 'full',
    onErasure: 'delete',          // only reached when tenants[] empties — see erasure executor
    retention: KEEP_WHILE_MEMBER,
  },
  {
    collection: 'users',
    // Classified as `consent` because this doc is the only place the consent evidence
    // lives (policyAcceptedVersion/At, cookieConsent/At, plus the usage* privacy flags).
    // It also carries loginEmail, names, roles and UI preferences, all exported in full.
    dataClass: 'consent',
    find: (c: SubjectCtx) => db().collection('users').where(FieldPath.documentId(), '==', c.uid),
    onExport: 'full',
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },
  {
    collection: 'avatars',
    dataClass: 'identity',
    // the avatar doc id is the PREFIXED key: `person.<okey>` (newAvatarModel)
    find: (c: SubjectCtx) => db().collection('avatars').where(FieldPath.documentId(), '==', c.parentKey),
    onExport: 'full',
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },

  // ────────────────────────────────── the PII vault ─────────────────────────────────
  {
    collection: 'addresses',
    dataClass: 'contact',
    find: (c: SubjectCtx) => db().collection('addresses').where('parentKey', '==', c.parentKey),
    onExport: 'full',             // D-P5-1: the sanctioned vault egress
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },
  {
    collection: 'address-directory',
    dataClass: 'contact',
    // derived projection of `addresses` — never exported (it would duplicate the vault
    // rows) but it MUST be erased, otherwise contact data survives the deletion.
    find: (c: SubjectCtx) => db().collection('address-directory').where('parentKey', '==', c.parentKey),
    onExport: 'none',
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },

  // ───────────────────────────── memberships & relations ────────────────────────────
  {
    collection: 'memberships',
    dataClass: 'membership',
    // memberKey holds the RAW person okey; memberModelType disambiguates the
    // person/org/group key collision (see getAllMembershipsOfMember).
    find: (c: SubjectCtx) => db().collection('memberships')
      .where('memberKey', '==', c.personKey)
      .where('memberModelType', '==', 'person'),
    onExport: 'full',
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
    blocksErasure: (docs) => {
      const active = docs.filter((d) => (d.get('dateOfExit') ?? '') === '');
      return active.length === 0 ? undefined : {
        code: 'activeMembership', count: active.length,
        detail: 'Sie haben eine laufende Mitgliedschaft. Solange sie besteht, brauchen wir Ihre Daten, um sie zu führen. Bitte treten Sie zuerst aus, dann können wir Ihre Daten löschen.',
      };
    },
  },
  {
    collection: 'ownerships',
    dataClass: 'membership',
    find: (c: SubjectCtx) => db().collection('ownerships')
      .where('ownerKey', '==', c.personKey)
      .where('ownerModelType', '==', 'person'),
    onExport: 'full',
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },
  {
    collection: 'workrels',
    dataClass: 'membership',
    find: (c: SubjectCtx) => db().collection('workrels')
      .where('subjectKey', '==', c.personKey)
      .where('subjectModelType', '==', 'person'),
    onExport: 'full',
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },
  {
    collection: 'personal-rels',
    dataClass: 'membership',
    // a person appears on either side of the relation
    find: (c: SubjectCtx) => db().collection('personal-rels').where(Filter.or(
      Filter.where('subjectKey', '==', c.personKey),
      Filter.where('objectKey', '==', c.personKey),
    )),
    onExport: 'full',
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },
  {
    collection: 'invitations',
    dataClass: 'membership',
    find: (c: SubjectCtx) => db().collection('invitations').where(Filter.or(
      Filter.where('inviteeKey', '==', c.personKey),
      Filter.where('inviterKey', '==', c.personKey),
    )),
    onExport: 'full',
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },
  {
    collection: 'responsibilities',
    dataClass: 'membership',
    find: (c: SubjectCtx) => db().collection('responsibilities').where(Filter.or(
      Filter.where('responsibleAvatar.key', '==', c.personKey),
      Filter.where('delegateAvatar.key', '==', c.personKey),
    )),
    onExport: 'full',
    // the function/role history belongs to the association; only the name goes
    onErasure: 'anonymize',
    anonymizeFields: [
      'responsibleAvatar.key', 'responsibleAvatar.name1', 'responsibleAvatar.name2',
      'delegateAvatar.key', 'delegateAvatar.name1', 'delegateAvatar.name2',
    ],
    retention: CLUB_RECORD,
  },
  {
    collection: 'groups',
    dataClass: 'membership',
    // `admins` is an array of embedded AvatarInfo maps — not queryable, hence the scan
    find: (c: SubjectCtx) => db().collection('groups').where('tenants', 'array-contains', c.tenantId),
    matches: (doc, c) => avatarArrayHolds(doc, 'admins', c.personKey),
    onExport: 'none',             // group membership is already covered by `memberships`
    onErasure: 'anonymize',
    anonymizeFields: ['admins'],  // remove the matching array element, keep the group
    retention: CLUB_RECORD,
    blocksErasure: (docs) => {
      const orphaned = docs.filter((d) => ((d.get('admins') as unknown[] | undefined) ?? []).length <= 1);
      return orphaned.length === 0 ? undefined : {
        code: 'soleAdmin', count: orphaned.length,
        detail: 'Sie sind die einzige Person, die eine Ihrer Gruppen verwalten kann. Bitte geben Sie diese Aufgabe zuerst an jemanden ab, sonst bleibt die Gruppe ohne Verwaltung zurück.',
      };
    },
  },
  {
    collection: 'competition-levels',
    dataClass: 'identity',
    // holds a plain-text dateOfBirth replica (inventory §5, sensitivity high)
    find: (c: SubjectCtx) => db().collection('competition-levels').where('personKey', '==', c.personKey),
    onExport: 'full',
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },
  {
    collection: 'applications',
    dataClass: 'identity',
    // self-submitted membership application: dob + ssnId + parent contact details
    find: (c: SubjectCtx) => db().collection('applications').where('personKey', '==', c.personKey),
    onExport: 'full',
    onErasure: 'delete',
    retention: APPLICATION_RECORD,
  },

  // ─────────────────── financial records under the 10-year retention ────────────────
  {
    collection: 'bookings',
    dataClass: 'financial',
    find: (c: SubjectCtx) => db().collection('bookings')
      .where('counterparty.key', '==', c.personKey)
      .where('counterparty.modelType', '==', 'person'),
    onExport: 'full',
    onErasure: 'anonymize',
    anonymizeFields: ['counterparty.key', 'counterparty.name1', 'counterparty.name2'],
    retention: RETAIN_10Y,
  },
  {
    collection: 'invoices',
    dataClass: 'financial',
    find: (c: SubjectCtx) => db().collection('invoices')
      .where('receiver.key', '==', c.personKey)
      .where('receiver.modelType', '==', 'person'),
    onExport: 'full',
    onErasure: 'anonymize',
    anonymizeFields: ['receiver.key', 'receiver.name1', 'receiver.name2'],
    retention: RETAIN_10Y,
    blocksErasure: (docs) => blockOpenInvoice(
      docs.filter((d) => (d.get('paymentDate') ?? '') === '' && d.get('state') !== 'cancelled').length,
      'Auf Ihren Namen sind noch Rechnungen offen. Sobald sie bezahlt oder storniert sind, können wir Ihre Daten löschen.',
    ),
  },
  {
    collection: 'invoice-positions',
    dataClass: 'financial',
    find: (c: SubjectCtx) => db().collection('invoice-positions').where('personKey', '==', c.personKey),
    onExport: 'full',
    onErasure: 'anonymize',
    anonymizeFields: ['personKey', 'firstName', 'lastName'],
    retention: RETAIN_10Y,
  },
  {
    collection: 'scs-memberfees',
    dataClass: 'financial',
    find: (c: SubjectCtx) => db().collection('scs-memberfees')
      .where('member.key', '==', c.personKey)
      .where('member.modelType', '==', 'person'),
    onExport: 'full',
    onErasure: 'anonymize',
    anonymizeFields: ['member.key', 'member.name1', 'member.name2'],
    retention: RETAIN_10Y,
    blocksErasure: (docs) => blockOpenInvoice(
      docs.filter((d) => !['paid', 'cancelled'].includes(String(d.get('state') ?? ''))).length,
      'Ihr Mitgliederbeitrag ist noch nicht beglichen. Sobald die Zahlung eingegangen ist, können wir Ihre Daten löschen.',
    ),
  },
  {
    collection: 'bills',
    dataClass: 'financial',
    // creditor invoices — `vendor` is usually an org, but a private person can bill too
    find: (c: SubjectCtx) => db().collection('bills')
      .where('vendor.key', '==', c.personKey)
      .where('vendor.modelType', '==', 'person'),
    onExport: 'full',
    onErasure: 'anonymize',
    anonymizeFields: ['vendor.key', 'vendor.name1', 'vendor.name2'],
    retention: RETAIN_10Y,
  },
  {
    collection: 'expenses',
    dataClass: 'financial',
    // linked by the Firebase Auth uid, not the personKey (createExpense CF)
    find: (c: SubjectCtx) => db().collection('expenses').where('userId', '==', c.uid),
    onExport: 'full',
    onErasure: 'anonymize',
    anonymizeFields: ['userId', 'iban'],   // the IBAN is the payout account, not a booking fact
    retention: RETAIN_10Y,
    blocksErasure: (docs) => blockOpenInvoice(
      docs.filter((d) => !['booked', 'rejected'].includes(String(d.get('status') ?? ''))).length,
      'Sie haben noch eine Spesenabrechnung offen. Sobald sie ausbezahlt oder abgelehnt ist, können wir Ihre Daten löschen.',
    ),
  },

  // ───────────────────────────── club content & activity ────────────────────────────
  {
    collection: 'tasks',
    dataClass: 'content',
    find: (c: SubjectCtx) => db().collection('tasks').where(Filter.or(
      Filter.where('author.key', '==', c.personKey),
      Filter.where('assignee.key', '==', c.personKey),
    )),
    onExport: 'index',
    indexFields: { title: 'name', date: 'dueDate', route: '/task' },
    onErasure: 'anonymize',       // the task stays, the name does not
    anonymizeFields: ['author.key', 'author.name1', 'author.name2', 'assignee.key', 'assignee.name1', 'assignee.name2'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'comments',
    dataClass: 'communication',
    // authorKey holds the personKey of the commenting user (createComment)
    find: (c: SubjectCtx) => db().collection('comments').where('authorKey', '==', c.personKey),
    onExport: 'index',
    indexFields: { title: 'description', date: 'creationDateTime', route: '/comment' },
    onErasure: 'anonymize',
    anonymizeFields: ['authorKey', 'authorName'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'docs',
    dataClass: 'content',
    find: (c: SubjectCtx) => db().collection('docs').where('authorKey', '==', c.personKey),
    onExport: 'index',
    indexFields: { title: 'title', date: 'dateOfDocCreation', route: '/document' },
    onErasure: 'anonymize',
    anonymizeFields: ['authorKey', 'authorName'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'calevents',
    dataClass: 'content',
    // responsiblePersons[] and attendees[].person are embedded arrays — not queryable
    find: (c: SubjectCtx) => db().collection('calevents').where('tenants', 'array-contains', c.tenantId),
    matches: (doc, c) => avatarArrayHolds(doc, 'responsiblePersons', c.personKey)
      || ((doc.get('attendees') as { person?: AvatarInfo }[] | undefined) ?? [])
        .some((a) => a?.person?.key === c.personKey),
    onExport: 'index',
    indexFields: { title: 'name', date: 'startDate', route: '/calevent' },
    onErasure: 'anonymize',
    anonymizeFields: ['responsiblePersons', 'attendees'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'trips',
    dataClass: 'content',
    find: (c: SubjectCtx) => db().collection('trips').where('tenants', 'array-contains', c.tenantId),
    matches: (doc, c) => avatarArrayHolds(doc, 'participants', c.personKey),
    onExport: 'index',
    indexFields: { title: 'name', date: 'startDate', route: '/trip' },
    onErasure: 'anonymize',       // the logbook entry (boat, distance, date) stays
    anonymizeFields: ['participants'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'reservations',
    dataClass: 'content',
    find: (c: SubjectCtx) => db().collection('reservations')
      .where('reserver.key', '==', c.personKey)
      .where('reserver.modelType', '==', 'person'),
    onExport: 'index',
    indexFields: { title: 'name', date: 'startDate', route: '/reservation' },
    onErasure: 'anonymize',
    anonymizeFields: ['reserver.key', 'reserver.name1', 'reserver.name2'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'transfers',
    dataClass: 'membership',
    // subjects[]/objects[] are embedded arrays — not queryable
    find: (c: SubjectCtx) => db().collection('transfers').where('tenants', 'array-contains', c.tenantId),
    matches: (doc, c) => avatarArrayHolds(doc, 'subjects', c.personKey) || avatarArrayHolds(doc, 'objects', c.personKey),
    onExport: 'full',
    onErasure: 'anonymize',       // the resource handover history stays with the club
    anonymizeFields: ['subjects', 'objects'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'whiteboards',
    dataClass: 'content',
    find: (c: SubjectCtx) => db().collection('whiteboards').where('author.key', '==', c.personKey),
    onExport: 'none',             // no usable date field to build an index row from
    onErasure: 'anonymize',
    anonymizeFields: ['author.key', 'author.name1', 'author.name2'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'instruments',
    dataClass: 'content',
    find: (c: SubjectCtx) => db().collection('instruments').where('author.key', '==', c.personKey),
    onExport: 'none',             // no usable date field to build an index row from
    onErasure: 'anonymize',
    anonymizeFields: ['author.key', 'author.name1', 'author.name2'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'folders',
    dataClass: 'content',
    // ownerKey is the personKey of the creator (enforced in firestore.rules)
    find: (c: SubjectCtx) => db().collection('folders').where('ownerKey', '==', c.personKey),
    onExport: 'none',
    onErasure: 'anonymize',
    anonymizeFields: ['ownerKey'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'assets',
    dataClass: 'membership',
    find: (c: SubjectCtx) => db().collection('assets').where('responsiblePersonKey', '==', c.personKey),
    onExport: 'none',             // the asset register is club property, not member data
    onErasure: 'anonymize',
    anonymizeFields: ['responsiblePersonKey'],
    retention: RETAIN_10Y,        // part of the accounting records (Anlagebuchhaltung)
  },

  // ────────────────────────────────────── logs ──────────────────────────────────────
  {
    collection: 'sessions',
    dataClass: 'log',
    // userKey is the users doc id = the Firebase Auth uid; the doc also holds userEmail
    find: (c: SubjectCtx) => db().collection('sessions').where('userKey', '==', c.uid),
    onExport: 'full',
    onErasure: 'delete',
    retention: LOG_12M,
  },
  {
    collection: 'activities',
    dataClass: 'log',
    // free-text payload may contain names and login e-mails (inventory §5)
    find: (c: SubjectCtx) => db().collection('activities').where('author.key', '==', c.personKey),
    onExport: 'full',
    onErasure: 'delete',
    retention: LOG_24M,
  },
  {
    collection: 'docGenerations',
    dataClass: 'log',
    find: (c: SubjectCtx) => db().collection('docGenerations').where('userId', '==', c.uid),
    onExport: 'none',             // metadata only; the generated file itself is in Storage
    onErasure: 'delete',
    retention: LOG_12M,
  },
  {
    collection: 'payment-orders',
    // Classified as `log`, not `financial`: the only subject link is createdBy /
    // approvedBy, i.e. "this user issued/approved a payment run". The personal data
    // INSIDE pain001Xml belongs to third-party recipients, which is exactly why this
    // row must never be exported to the requesting member.
    dataClass: 'log',
    find: (c: SubjectCtx) => db().collection('payment-orders').where(Filter.or(
      Filter.where('createdBy', '==', c.uid),
      Filter.where('approvedBy', '==', c.uid),
    )),
    onExport: 'none',
    onErasure: 'retain',          // four-eyes evidence for a booked payment run
    retention: RETAIN_10Y,
  },
  {
    collection: 'esignList',
    dataClass: 'content',
    find: (c: SubjectCtx) => db().collection('esignList').where('ownerUserId', '==', c.uid),
    onExport: 'index',
    indexFields: { title: 'documentName', date: 'createdAt', route: '/esign' },
    // A qualified electronic signature loses its evidentiary value if the record is
    // altered, so this is a genuine 'retain', not a convenience one.
    onErasure: 'retain',
    retention: RETAIN_10Y,
    blocksErasure: (docs) => {
      const pending = docs.filter((d) => !['completed', 'cancelled', 'declined', 'expired']
        .includes(String(d.get('documentStatus') ?? '')));
      return pending.length === 0 ? undefined : {
        code: 'pendingSignature', count: pending.length,
        detail: 'Ein Dokument wartet noch auf Ihre Unterschrift. Bitte unterschreiben Sie es oder brechen Sie den Vorgang ab, danach können wir Ihre Daten löschen.',
      };
    },
  },
  {
    collection: 'esignAudit',
    dataClass: 'log',
    // subcollection `esignAudit/{tenantId}/deletions/{esignId}`; holds the uid of the
    // admin who deleted a signature record — tamper evidence, never exported.
    find: (c: SubjectCtx) => db().collectionGroup('deletions').where('deletedBy', '==', c.uid),
    onExport: 'none',
    onErasure: 'retain',
    retention: RETAIN_10Y,
  },
] as const;

export function entriesFor(mode: 'full' | 'index'): readonly SubjectDataEntry[] {
  return SUBJECT_DATA_MAP.filter((e) => e.onExport === mode);
}

// ──────────────────────────────────────────────────────────────────────────────────
// Collections deliberately WITHOUT a row. Keep this list in sync with
// `libs/shared/models/src/lib/**` — the privacy audit grades this file against the
// live collection list and an unexplained omission becomes a permanent finding.
// ──────────────────────────────────────────────────────────────────────────────────
// not personal data: accounts — chart of accounts (account numbers, names, hierarchy)
// not personal data: accounting-configs — per-tenant accounting settings
// not personal data: app-config — tenant configuration; opEmail/dpoEmail are operator
//   role addresses published on purpose, never a data subject's contact details
// not personal data: asset-categories — depreciation categories
// not personal data: asset-movements — asset postings, reference assets and accounts only
// not personal data: booking-lines — debit/credit lines, reference accounts and amounts
// not personal data: calendars — calendar definitions (name, colour, visibility)
// not personal data: categories — enum/value lists used by dropdowns
// not personal data: exchange-rates — currency rates
// not personal data: formDefinitions — form templates (field definitions, no submissions)
// not personal data: i18nDefault — translation keys and default texts
// not personal data: i18nTenantOverride — per-tenant translation overrides
// not personal data: icons — icon catalogue
// not personal data: locations — geographic places (name, coordinates, address of a venue)
// not personal data: menuItems — navigation configuration
// not personal data: ocr-rules — vendor→account mapping rules
// not personal data: orgs — legal entities, not natural persons. A sole proprietorship
//   can blur that line; the operator handles such a request manually (see report).
// not personal data: pages — CMS page structure (ordered section keys)
// not personal data: periods — fiscal periods
// not personal data: resources — boats, rooms and other club resources
// not personal data: swissCities — public postal-code reference data
// not personal data: tags — tag catalogue
// not personal data: templates — PDF/document templates
// not personal data: vat-codes — VAT rate definitions
// not personal data: websiteContent — public marketing content
//
// ── KNOWN GAPS: these DO hold personal data but carry no usable subject link. They
//    are not rows because a `find` would be a guess; each needs a schema change first.
//    Do not silently drop them from a later audit.
// gap: payments — recipientName / recipientIban / recipientAddress are free text copied
//   from the bill; PaymentModel has no person or org foreign key. Needs a recipientKey.
// gap: sections — a `people` section embeds PeopleConfig.persons: AvatarInfo[] deep
//   inside the polymorphic `properties` map; the field path differs per section type,
//   so a reliable scan predicate does not exist yet.
// gap: ocr-results — vendor/amount extracted from a receipt, linked only via
//   correlationKey → expenses. Reachable transitively once the expense row is erased.
// gap: expense-documents — OCR metadata for an expense receipt, linked only by
//   expenseKey. Same transitive path as ocr-results.
