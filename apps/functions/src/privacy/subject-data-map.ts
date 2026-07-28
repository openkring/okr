import { FieldPath, Filter, getFirestore } from 'firebase-admin/firestore';
import type { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
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
 * **Call `resolveDocs(entry, ctx)`** — it is the only supported access path and runs
 * `find` → `tenantScope` → `matches` in the pinned order. `find` alone over-fetches on
 * every row that carries a `matches`.
 *
 * - `find`        mostly mirrors the query helpers in `@okr/shared-util-functions` so
 *                 that few new composite indexes are needed.
 * - `tenantScope` how the consumer keeps the result inside `ctx.tenantId`. Required on
 *                 every row because the mechanism differs per collection (`tenants[]`
 *                 array, singular `tenantId`, path segment, or already pinned by
 *                 `find`).
 * - `matches`     present where the subject link is not queryable — the subject sits
 *                 inside an array of embedded `AvatarInfo` maps, or is identified only
 *                 by e-mail inside free text. `find` is then a scan and the consumer
 *                 MUST apply `matches`.
 * - `onErasure`   `'anonymize'` is reserved for records under a legal retention duty
 *                 (GebüV / OR Art. 958f) and for club records whose substance belongs
 *                 to the association: amounts, dates and document references stay,
 *                 only the name fields and the person key are overwritten. Everything
 *                 freely deletable is `'delete'`.
 *
 * The pipeline order (query → tenant filter → `matches` → `blocksErasure`) is
 * normative and is specified on `SubjectDataEntry`.
 *
 * ## Key shapes (see `SubjectCtx`)
 * `ctx.personKey` is the raw `persons` doc id and is what `memberKey`, `ownerKey`,
 * `subjectKey`, `authorKey`, `personKey` and every `AvatarInfo.key` store.
 * `ctx.parentKey` is the prefixed `person.<okey>` form and is used ONLY by
 * `addresses.parentKey`, `address-directory.parentKey` and the `avatars` doc id.
 * `ctx.uid` is the Firebase Auth uid = the `users` doc id.
 * `ctx.email` is the login e-mail and is the ONLY handle on `applications`,
 * `esignList.signees[]` and the `logAuth` activities.
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

/**
 * Reads a (possibly dotted) `AvatarInfo[]` field and tells whether the subject is in it.
 *
 * A missing `modelType` is read as `'person'`. This is defensive, not required by any
 * current writer: `AVATAR_INFO_SHAPE.modelType` defaults to `'person'`, the section
 * people-list writer sets it explicitly on both branches
 * (`model-select.service.ts:67,78`), and `group.util.ts:51` ignores `modelType`
 * altogether. Treating an absent value as a non-person would silently drop such a
 * document from both export and erasure, which is the wrong way to be wrong.
 */
function avatarArrayHolds(doc: DocumentSnapshot, field: string, personKey: string): boolean {
  if (!personKey) return false;
  const list = doc.get(field) as AvatarInfo[] | undefined;
  return Array.isArray(list) && list.some((a) => a?.key === personKey && (a?.modelType ?? 'person') === 'person');
}

function blockOpenInvoice(count: number, detail: string): Blocker | undefined {
  return count === 0 ? undefined : { code: 'openInvoice', count, detail };
}

/** e-mail-shaped runs of text; `:` and whitespace terminate a token. */
const EMAIL_TOKEN = /[^\s:,;<>()"']+@[^\s:,;<>()"']+/g;

/**
 * Whether a free-text activity payload names exactly this e-mail.
 *
 * Must not be a substring test: the payload formats are
 * `${loginEmail}: SUCCESS` / `${loginEmail}: ERROR: …` (auth.service.ts:68,72) and
 * `'on url: ' + email` / `'on menu: ' + email` (logout.page.ts:32, menu.store.ts:278),
 * so the e-mail is sometimes a prefix and sometimes a suffix. A plain `includes` would
 * make `johans@scs.ch` match a request for `hans@scs.ch`.
 */
function payloadNamesEmail(payload: string, email: string): boolean {
  if (!email) return false;
  const tokens = payload.toLowerCase().match(EMAIL_TOKEN) ?? [];
  return tokens.some((t) => t.replace(/[.,;]+$/, '') === email);
}

export const SUBJECT_DATA_MAP: readonly SubjectDataEntry[] = [
  // ─────────────────────────────── identity & consent ───────────────────────────────
  {
    collection: 'persons',
    dataClass: 'identity',
    // `okey` is the document id and is stripped before every write — it is NOT a field,
    // so this must be a documentId() query, not `where('okey', '==', …)`.
    find: (c: SubjectCtx) => db().collection('persons').where(FieldPath.documentId(), '==', c.personKey),
    tenantScope: 'tenantsArray',
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
    tenantScope: 'tenantsArray',
    onExport: 'full',
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },
  {
    collection: 'users/fcmTokens',
    dataClass: 'log',
    // Deleting `users/{uid}` does NOT cascade to its subcollections, so the device push
    // tokens would outlive the account without this row (firestore.rules:201).
    find: (c: SubjectCtx) => db().collection('users').doc(c.uid).collection('fcmTokens'),
    tenantScope: 'none',          // path is already pinned to the subject's uid
    onExport: 'none',             // a push token is a device credential, not useful to the member
    onErasure: 'delete',
    retention: LOG_12M,
  },
  {
    collection: 'avatars',
    dataClass: 'identity',
    // the avatar doc id is the PREFIXED key: `person.<okey>` (newAvatarModel)
    find: (c: SubjectCtx) => db().collection('avatars').where(FieldPath.documentId(), '==', c.parentKey),
    tenantScope: 'tenantsArray',
    onExport: 'full',
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },

  // ────────────────────────────────── the PII vault ─────────────────────────────────
  {
    collection: 'addresses',
    dataClass: 'contact',
    find: (c: SubjectCtx) => db().collection('addresses').where('parentKey', '==', c.parentKey),
    tenantScope: 'tenantsArray',
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
    tenantScope: 'tenantsArray',
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
    tenantScope: 'tenantsArray',
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
    tenantScope: 'tenantsArray',
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
    tenantScope: 'tenantsArray',
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
    tenantScope: 'tenantsArray',
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
    tenantScope: 'tenantsArray',
    onExport: 'full',
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },
  {
    collection: 'responsibilities',
    dataClass: 'membership',
    // responsibleAvatar / delegateAvatar are documented as "Person or Group", so the
    // polymorphic key needs the modelType predicate — without it a group whose key
    // collides with the person key gets its name anonymized.
    find: (c: SubjectCtx) => db().collection('responsibilities').where(Filter.or(
      Filter.and(
        Filter.where('responsibleAvatar.key', '==', c.personKey),
        Filter.where('responsibleAvatar.modelType', '==', 'person'),
      ),
      Filter.and(
        Filter.where('delegateAvatar.key', '==', c.personKey),
        Filter.where('delegateAvatar.modelType', '==', 'person'),
      ),
    )),
    tenantScope: 'tenantsArray',
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
    tenantScope: 'inQuery',
    matches: (doc, c) => avatarArrayHolds(doc, 'admins', c.personKey),
    onExport: 'none',             // group membership is already covered by `memberships`
    onErasure: 'anonymize',
    anonymizeFields: ['admins'],  // remove the matching array element, keep the group
    retention: CLUB_RECORD,
    // Correct ONLY because blocksErasure runs after `matches` (contract step 4): every
    // doc reaching it is a group the subject actually administers, so <= 1 admin means
    // they are the last one. On the raw scan this would fire on every admin-less group
    // in the tenant and block erasure for everybody, forever.
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
    tenantScope: 'tenantsArray',
    onExport: 'full',
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },
  {
    collection: 'applications',
    dataClass: 'identity',
    // Self-submitted membership application: ssnId + dateOfBirth + parent contact — the
    // most sensitive record in the inventory. `personKey` is only filled once the
    // application is converted into a person, so a pending or rejected application is
    // reachable by e-mail ALONE, and those are exactly the people whose data is most
    // sensitive and who never became members.
    //
    // It is a tenant scan rather than `where('email','==',ctx.email)` because
    // ApplicationModel.email is stored AS TYPED — nothing normalizes it on write, and
    // getApplicationIndex does not include it either. An equality query with the
    // contractually lowercased ctx.email silently misses `Hans.Muster@example.ch`, and
    // no post-filter can rescue a document the query never fetched. Applications are
    // low-cardinality (membership applications for one club), so the scan is cheap; the
    // real fix is to normalize on write and add an `emailLower` field, after which this
    // collapses to an equality.
    find: (c: SubjectCtx) => db().collection('applications').where('tenants', 'array-contains', c.tenantId),
    tenantScope: 'inQuery',
    // Guards the empty-string case: DEFAULT_KEY is '' and an empty ctx.personKey would
    // otherwise match every unconverted application in the tenant.
    matches: (doc, c) => (!!c.personKey && doc.get('personKey') === c.personKey)
      || (!!c.email && String(doc.get('email') ?? '').toLowerCase() === c.email),
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
    tenantScope: 'tenantsArray',
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
    tenantScope: 'tenantsArray',
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
    tenantScope: 'tenantsArray',
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
    tenantScope: 'tenantsArray',
    onExport: 'full',
    onErasure: 'anonymize',
    // memberBexioId / invoiceBexioId are stable join keys into bexio, where the name
    // still lives; memberBirthYear + category is a quasi-identifier in a club this size.
    // Clearing the name alone would leave the record trivially re-identifiable.
    anonymizeFields: [
      'member.key', 'member.name1', 'member.name2',
      'memberBexioId', 'invoiceBexioId', 'memberBirthYear',
    ],
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
    tenantScope: 'tenantsArray',
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
    tenantScope: 'tenantsArray',
    onExport: 'full',
    onErasure: 'anonymize',
    anonymizeFields: ['userId', 'iban'],   // the IBAN is the payout account, not a booking fact
    retention: RETAIN_10Y,
    // Settled == the expense carries a bookingKey. That is what the CODE writes, not
    // what ExpenseStatus declares. Expenses are CF-write-only (expense.service.ts:60)
    // and the only status writes anywhere are 'processing' on create
    // (expense/index.ts:57) and on redo (ocr/index.ts:586), and 'validated', set in the
    // same transaction as the bookingKey (ocr/index.ts:416). 'posted' and
    // 'pending-export' exist in the union but are NEVER written to an expense — the one
    // `status: 'posted'` write in the repo is on a booking (bexio/journal.ts:110) — so
    // treating them as terminal blocked every filer forever. bookingKey is also the
    // field redoOcr itself guards on ("already booked", ocr/index.ts:577), which makes
    // it the honest terminal signal. 'error' clears as well: it is a dead end the member
    // cannot influence, so blocking their erasure on it would never resolve by itself.
    blocksErasure: (docs) => blockOpenInvoice(
      docs.filter((d) => !d.get('bookingKey') && String(d.get('status') ?? '') !== 'error').length,
      'Sie haben noch eine Spesenabrechnung offen. Sobald sie verbucht ist, können wir Ihre Daten löschen.',
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
    tenantScope: 'tenantsArray',
    onExport: 'index',
    indexFields: { title: 'name', date: 'dueDate', route: '/task' },
    onErasure: 'anonymize',       // the task stays, the name does not
    anonymizeFields: ['author.key', 'author.name1', 'author.name2', 'assignee.key', 'assignee.name1', 'assignee.name2'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'comments',
    dataClass: 'communication',
    // `authorKey` holds TWO different key shapes and both must be found:
    //  - user-written comments store the personKey (CommentService.create)
    //  - the auto-generated audit comments written on every create/update store
    //    currentUser.okey = the users doc id = the uid (FirestoreService.createModel /
    //    updateModel). Those are the bulk of the collection and carry `authorName` in
    //    plaintext, so querying the personKey alone misses most of the subject's data.
    find: (c: SubjectCtx) => db().collection('comments').where(Filter.or(
      Filter.where('authorKey', '==', c.personKey),
      Filter.where('authorKey', '==', c.uid),
    )),
    tenantScope: 'tenantsArray',
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
    tenantScope: 'tenantsArray',
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
    tenantScope: 'inQuery',
    matches: (doc, c) => avatarArrayHolds(doc, 'responsiblePersons', c.personKey)
      || (!!c.personKey && ((doc.get('attendees') as { person?: AvatarInfo }[] | undefined) ?? [])
        .some((a) => a?.person?.key === c.personKey)),
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
    tenantScope: 'inQuery',
    matches: (doc, c) => avatarArrayHolds(doc, 'participants', c.personKey),
    onExport: 'index',
    indexFields: { title: 'name', date: 'startDate', route: '/trip' },
    onErasure: 'anonymize',       // the logbook entry (boat, distance, date) stays
    anonymizeFields: ['participants'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'stats_members',
    dataClass: 'content',
    // stats_members/{personKey}/years/{year} — per-year km + trip count, derived from
    // `trips` by the onTripWrite CF and readable by any signed-in user
    // (firestore.rules:409-411). The whole subcollection is keyed by the subject's
    // personKey, so it is deleted outright; the aggregate is rebuilt from the
    // (anonymized) trips if it is ever needed again.
    find: (c: SubjectCtx) => db().collection('stats_members').doc(c.personKey).collection('years'),
    tenantScope: 'none',          // path is already pinned to the subject's personKey
    onExport: 'full',
    onErasure: 'delete',
    retention: CLUB_RECORD,
  },
  {
    collection: 'reservations',
    dataClass: 'content',
    find: (c: SubjectCtx) => db().collection('reservations')
      .where('reserver.key', '==', c.personKey)
      .where('reserver.modelType', '==', 'person'),
    tenantScope: 'tenantsArray',
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
    tenantScope: 'inQuery',
    matches: (doc, c) => avatarArrayHolds(doc, 'subjects', c.personKey) || avatarArrayHolds(doc, 'objects', c.personKey),
    onExport: 'full',
    onErasure: 'anonymize',       // the resource handover history stays with the club
    anonymizeFields: ['subjects', 'objects'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'sections',
    dataClass: 'content',
    // A `people` section pins an explicit list of members onto a CMS page. For that
    // section type the field path is fixed — `properties.persons: AvatarInfo[]`
    // (PeopleConfig) — which is structurally the same problem as groups.admins and
    // trips.participants, so the same scan + matches applies. No other section type
    // carries a person list.
    //
    // Bounded by section type rather than by tenant: `type == 'people'` is low
    // cardinality and needs only the default single-field index, and `tenantScope`
    // trims the cross-tenant remainder in resolveDocs.
    find: () => db().collection('sections').where('type', '==', 'people'),
    tenantScope: 'tenantsArray',
    matches: (doc, c) => avatarArrayHolds(doc, 'properties.persons', c.personKey),
    onExport: 'none',             // published page content, not the member's own record
    onErasure: 'anonymize',       // remove the matching entry, keep the section
    anonymizeFields: ['properties.persons'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'whiteboards',
    dataClass: 'content',
    find: (c: SubjectCtx) => db().collection('whiteboards').where('author.key', '==', c.personKey),
    tenantScope: 'tenantsArray',
    onExport: 'full',             // authored content falls squarely under the right of access
    onErasure: 'anonymize',
    anonymizeFields: ['author.key', 'author.name1', 'author.name2'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'instruments',
    dataClass: 'content',
    find: (c: SubjectCtx) => db().collection('instruments').where('author.key', '==', c.personKey),
    tenantScope: 'tenantsArray',
    onExport: 'full',             // authored content falls squarely under the right of access
    onErasure: 'anonymize',
    anonymizeFields: ['author.key', 'author.name1', 'author.name2'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'folders',
    dataClass: 'content',
    // ownerKey is the personKey of the creator (enforced in firestore.rules)
    find: (c: SubjectCtx) => db().collection('folders').where('ownerKey', '==', c.personKey),
    tenantScope: 'tenantsArray',
    onExport: 'none',
    onErasure: 'anonymize',
    anonymizeFields: ['ownerKey'],
    retention: CLUB_RECORD,
  },
  {
    collection: 'assets',
    dataClass: 'membership',
    find: (c: SubjectCtx) => db().collection('assets').where('responsiblePersonKey', '==', c.personKey),
    tenantScope: 'tenantsArray',
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
    tenantScope: 'tenantsArray',
    onExport: 'full',
    onErasure: 'delete',
    retention: LOG_12M,
  },
  {
    collection: 'activities',
    dataClass: 'log',
    // Two shapes again. ActivityService.log sets author.key = personKey, but logAuth
    // (login/logout) writes author = { key: '', modelType: 'user' } and puts the login
    // e-mail into the free-text `payload` — inventory §5 flags exactly this field.
    // There is no queryable handle for the latter, so the row also pulls `scope ==
    // 'auth'` and matches on the payload.
    //
    // The `tenants` leg is REQUIRED, not decorative: tenantScope is a post-filter, so
    // without it this query reads every auth activity of every tenant off the server.
    // It sits outside the Filter.or so the query still has a single array-contains;
    // both disjuncts need a composite index (tenants + author.key, tenants + scope),
    // which is why firestore.indexes.json gained two entries alongside this change.
    find: (c: SubjectCtx) => db().collection('activities')
      .where('tenants', 'array-contains', c.tenantId)
      .where(Filter.or(
        Filter.where('author.key', '==', c.personKey),
        Filter.where('scope', '==', 'auth'),
      )),
    tenantScope: 'inQuery',
    // payloadNamesEmail, not `includes`: the payload is free text and a substring test
    // makes 'johans@scs.ch' match 'hans@scs.ch' — on a row that exports in full and
    // then deletes, that is one member's login history handed to another and erased.
    matches: (doc, c) => (!!c.personKey && doc.get('author.key') === c.personKey)
      || (doc.get('scope') === 'auth' && payloadNamesEmail(String(doc.get('payload') ?? ''), c.email)),
    onExport: 'full',
    onErasure: 'delete',
    retention: LOG_24M,
  },
  {
    collection: 'docGenerations',
    dataClass: 'log',
    find: (c: SubjectCtx) => db().collection('docGenerations').where('userId', '==', c.uid),
    tenantScope: 'tenantsArray',
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
    tenantScope: 'tenantsArray',
    onExport: 'none',
    onErasure: 'retain',          // four-eyes evidence for a booked payment run
    retention: RETAIN_10Y,
  },
  {
    collection: 'esignList',
    dataClass: 'content',
    // esign records carry a SINGULAR `tenantId`, not a `tenants[]` array
    // (esign.model.ts:32, firestore.rules:414-415) — hence the tenant-scoped scan and
    // tenantScope 'inQuery'. The scan is also what reaches documents the subject only
    // SIGNED: signees[] carries their e-mail and name but no uid, so
    // `ownerUserId == uid` alone would miss every document owned by someone else.
    find: (c: SubjectCtx) => db().collection('esignList').where('tenantId', '==', c.tenantId),
    tenantScope: 'inQuery',
    matches: (doc, c) => doc.get('ownerUserId') === c.uid
      || (!!c.email && ((doc.get('signees') as { email?: string }[] | undefined) ?? [])
        .some((s) => String(s?.email ?? '').toLowerCase() === c.email)),
    onExport: 'index',
    indexFields: { title: 'documentName', date: 'createdAt', route: '/esign' },
    // A qualified electronic signature loses its evidentiary value if the record is
    // altered, so this is a genuine 'retain', not a convenience one.
    onErasure: 'retain',
    retention: RETAIN_10Y,
    // EsignDocumentStatus = uploading | draft | in-progress | signed | withdrawn |
    // rejected | error. Only 'in-progress' means the document is actually out for
    // signature and waiting on a human. 'signed' / 'withdrawn' / 'rejected' are
    // terminal, and 'uploading' / 'draft' / 'error' are the owner's or an admin's to
    // clean up (esignDelete). Blocking on anything wider — in particular on 'signed' —
    // would block a completed document forever.
    blocksErasure: (docs) => {
      const pending = docs.filter((d) => String(d.get('documentStatus') ?? '') === 'in-progress');
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
    // admin who deleted a signature record — tamper evidence, never exported. The
    // collection-group query crosses tenants and the document has NO tenant field: the
    // tenant is the grandparent path segment, i.e. `doc.ref.parent.parent.id`.
    find: (c: SubjectCtx) => db().collectionGroup('deletions').where('deletedBy', '==', c.uid),
    tenantScope: 'docPath',
    onExport: 'none',
    onErasure: 'retain',
    retention: RETAIN_10Y,
  },
];

export function entriesFor(mode: 'full' | 'index'): readonly SubjectDataEntry[] {
  return SUBJECT_DATA_MAP.filter((e) => e.onExport === mode);
}

/** Applies a row's `tenantScope`. Exported for tests; call `resolveDocs` instead. */
export function inTenant(entry: SubjectDataEntry, doc: QueryDocumentSnapshot, ctx: SubjectCtx): boolean {
  switch (entry.tenantScope) {
    case 'tenantsArray':
      return ((doc.get('tenants') as string[] | undefined) ?? []).includes(ctx.tenantId);
    case 'docPath':
      // e.g. esignAudit/{tenantId}/deletions/{esignId} — the tenant is the grandparent
      return doc.ref.parent.parent?.id === ctx.tenantId;
    case 'inQuery':
    case 'none':
      return true;
  }
}

/**
 * **The only supported way to read a row.** Runs the contract pipeline in the
 * normative order: `find` → `tenantScope` → `matches`.
 *
 * Do not call `entry.find(ctx).get()` yourself. It compiles, it looks right, and on
 * the 8 rows that carry a `matches` it returns other members' documents — which the
 * export would then hand to the requester and the erasure executor would anonymise or
 * delete. `find` is exported only so the tests can assert its query shape.
 *
 * The result is also what `blocksErasure` must be fed (contract step 4).
 */
export async function resolveDocs(entry: SubjectDataEntry, ctx: SubjectCtx): Promise<QueryDocumentSnapshot[]> {
  const snapshot = await entry.find(ctx).get();
  return snapshot.docs.filter((doc) => inTenant(entry, doc, ctx) && (entry.matches?.(doc, ctx) ?? true));
}

// ──────────────────────────────────────────────────────────────────────────────────
// Collections deliberately WITHOUT a row. Keep this list in sync with
// `libs/shared/models/src/lib/**` — the privacy audit grades this file against the
// live collection list and an unexplained omission becomes a permanent finding.
// The completeness test derives the constant list from `@okr/shared-models` and parses
// the comments below, so a newly added collection fails the test until it is a row,
// a `not personal data:` line, or a `gap:` line.
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
//   from the bill; PaymentModel has no person or org FK. A transitive route does exist
//   (payments.billKey → the bills row), so a payment made against a bill the subject
//   issued IS reachable; what stays unreachable is a payment whose recipient never had
//   a bill in okr. A recipientKey + recipientModelType pair would turn this into a row.
// gap: ocr-results — vendor/amount extracted from a receipt, linked only via
//   correlationKey → expenses. Reachable transitively once the expense row is erased.
// gap: expense-documents — OCR metadata for an expense receipt, linked only by
//   expenseKey. Same transitive path as ocr-results.
