import { FieldPath, Filter, getFirestore } from 'firebase-admin/firestore';
import type { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { PROSPECT_PARENT_PREFIX } from '@okr/shared-models';
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
 * - `tier`        the row's legal basis (T1 contract · T2 consent · T3 accounting ·
 *                 T4 legitimate interest). It is the STRICTEST tier any document in the
 *                 row can carry, because the erasure preview offers a whole T2 row for
 *                 immediate deletion. See `DataTier` for why `addresses` is T1.
 * - `onTenantExit` what the lifecycle pipeline does when the subject leaves this tenant.
 *                 No consumer in this slice — declared so the classification is done
 *                 once, next to the row it describes.
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

/**
 * The same question for an array of WRAPPERS around an `AvatarInfo` — `attendees[].person`,
 * `agenda[].owner`. `avatarArrayHolds` cannot answer it: the element is not the avatar, it
 * is a record that carries one alongside its own fields (an attendance state, an agenda item).
 */
function nestedAvatarArrayHolds(doc: DocumentSnapshot, field: string, prop: string, personKey: string): boolean {
  if (!personKey) return false;
  const list = doc.get(field) as Record<string, AvatarInfo | undefined>[] | undefined;
  return Array.isArray(list) && list.some((el) => {
    const avatar = el?.[prop];
    return avatar?.key === personKey && (avatar?.modelType ?? 'person') === 'person';
  });
}

/**
 * `blocksTiers: ['T1', 'T3']` — an unpaid record needs the debtor reachable (contract
 * tier) and the accounting record intact (retention tier). It says nothing about the
 * member's avatar or their voluntarily shared birthday, which stay erasable on demand.
 */
function blockOpenInvoice(count: number, detail: string): Blocker | undefined {
  return count === 0 ? undefined : { code: 'openInvoice', count, detail, blocksTiers: ['T1', 'T3'] };
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
  // Lowercased here rather than trusting ctx.email: SubjectCtx documents the invariant
  // but nothing enforces it, and a mixed-case ctx would silently match nothing.
  const wanted = email.toLowerCase();
  const tokens = payload.toLowerCase().match(EMAIL_TOKEN) ?? [];
  return tokens.some((t) => t.replace(/[.,;]+$/, '') === wanted);
}

/**
 * Whether an expense still has an open accounting entry.
 *
 * Settled == booked. `bookingKey` and `status: 'validated'` are written in the same
 * transaction (ocr/index.ts:416), so either signal counts — accepting both means an
 * expense written before `bookingKey` existed clears instead of blocking forever, which
 * is the same never-satisfiable-predicate shape C1 was about. `'error'` clears too: it
 * is a dead end the member cannot influence.
 */
function expenseIsOpen(bookingKey: string, status: string): boolean {
  return !bookingKey && status !== 'validated' && status !== 'error';
}

// ─────────────────────────── prospects: the two-hop resolver (C5 §4) ────────────────────────────
// A prospect is a natural person who signed up on kring.ch. They have no uid and no personKey, so
// like `applications` they are reachable by e-mail alone — except that a prospect's e-mail is
// deliberately NOT a field on the prospect: it is an `addresses` document with
// `parentKey = 'prospect.<okey>'`, in the same PII vault, under the same rules, as every other
// contact datum (C5 §5). One `where('email','==',ctx.email)` therefore cannot reach the prospect,
// and no `matches` post-filter can rescue it — the hop addresses → parentKey → prospects has to
// happen before the prospects query exists at all. That is what `SubjectDataEntry.resolve` is for.

/** Firestore caps a disjunctive `in` at 30 values. Prospect key sets are tiny; chunk rather than truncate. */
const IN_CHUNK = 30;

function chunk<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Hop 1 — every `addresses.parentKey` of the form `prospect.<okey>` that carries this e-mail.
 *
 * An equality query is correct here, unlike on `applications`: `submitProspect` lowercases the
 * address before writing it (`business/index.ts`) and `SubjectCtx.email` is lowercased by contract,
 * so the two forms cannot disagree. If a second writer of prospect addresses ever appears, it must
 * normalize too — or this becomes a scan, as `applications` already is.
 */
async function prospectParentKeys(ctx: SubjectCtx): Promise<string[]> {
  if (!ctx.email) return [];
  const snap = await db().collection('addresses')
    .where('addressChannel', '==', 'email')
    .where('email', '==', ctx.email)
    .get();
  const prefix = `${PROSPECT_PARENT_PREFIX}.`;
  return [...new Set(snap.docs
    .map((d) => (d.get('parentKey') as string | undefined) ?? '')
    .filter((k) => k.startsWith(prefix)))];
}

async function docsByIds(collection: string, ids: string[]): Promise<QueryDocumentSnapshot[]> {
  const snaps = await Promise.all(chunk(ids).map((ids) =>
    db().collection(collection).where(FieldPath.documentId(), 'in', ids).get()));
  return snaps.flatMap((s) => s.docs);
}

async function docsByParentKeys(parentKeys: string[]): Promise<QueryDocumentSnapshot[]> {
  const snaps = await Promise.all(chunk(parentKeys).map((keys) =>
    db().collection('addresses').where('parentKey', 'in', keys).get()));
  return snaps.flatMap((s) => s.docs);
}

export const SUBJECT_DATA_MAP: readonly SubjectDataEntry[] = [
  // ─────────────────────────────── identity & consent ───────────────────────────────
  {
    collection: 'persons',
    dataClass: 'identity',
    tier: 'T1',
    onTenantExit: 'detach',   // D-L2: shared across tenancies — strip the tenant, hard-delete only when tenants[] empties
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
    tier: 'T1',
    onTenantExit: 'detach',   // D-L2: shared across tenancies — strip the tenant, hard-delete only when tenants[] empties
    find: (c: SubjectCtx) => db().collection('users').where(FieldPath.documentId(), '==', c.uid),
    tenantScope: 'tenantsArray',
    onExport: 'full',
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },
  {
    collection: 'users/fcmTokens',
    dataClass: 'log',
    tier: 'T1',
    onTenantExit: 'retain',   // no tenant dimension of its own; the tokens die with the users doc
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
    tier: 'T2',   // a picture is voluntary (spec §3) — erasable while the membership runs
    onTenantExit: 'detach',   // D-L2: shared across tenancies — strip the tenant, hard-delete only when tenants[] empties; D-L3 is satisfied by the detach
    // the avatar doc id is the PREFIXED key, either bare (`person.<okey>`, the shared
    // default) or tenant-scoped (`<tenant>.person.<okey>`, this tenant's own picture) —
    // see avatar.util.avatarDocId. Both belong to the subject.
    find: (c: SubjectCtx) => db().collection('avatars')
      .where(FieldPath.documentId(), 'in', [c.parentKey, `${c.tenantId}.${c.parentKey}`]),
    tenantScope: 'tenantsArray',
    onExport: 'full',
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },

  // ────────────────────────────────── the PII vault ─────────────────────────────────
  {
    collection: 'addresses',
    dataClass: 'contact',
    tier: 'T1',   // strictest tier wins: the favorite contact address is contract data, the dob address is not
    onTenantExit: 'detach',   // D-L2: shared across tenancies — strip the tenant, hard-delete only when tenants[] empties
    find: (c: SubjectCtx) => db().collection('addresses').where('parentKey', '==', c.parentKey),
    // The subject's own vault, PLUS the vault of any prospect record they created before they had
    // an account (C5 §5 — a lead's e-mail is an address, not a field). Without the second half a
    // prospect address outlives the prospect row that `onErasure: 'delete'` removes: contact data
    // surviving an erasure, orphaned, which is precisely what D-P5-3 exists to prevent.
    resolve: async (c: SubjectCtx) => {
      const own = await db().collection('addresses').where('parentKey', '==', c.parentKey).get();
      const prospectKeys = await prospectParentKeys(c);
      if (prospectKeys.length === 0) return own.docs;
      const fromProspects = await docsByParentKeys(prospectKeys);
      return [...own.docs, ...fromProspects];
    },
    tenantScope: 'tenantsArray',
    onExport: 'full',             // D-P5-1: the sanctioned vault egress
    onErasure: 'delete',
    retention: KEEP_WHILE_MEMBER,
  },
  {
    collection: 'address-directory',
    dataClass: 'contact',
    tier: 'T1',
    onTenantExit: 'delete',   // one projection doc per tenant — this tenant's copy goes
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
    tier: 'T1',
    onTenantExit: 'anonymize',   // spec §10: the membership record stays as club history, the member fields go
    // memberKey holds the RAW person okey; memberModelType disambiguates the
    // person/org/group key collision (see getAllMembershipsOfMember).
    find: (c: SubjectCtx) => db().collection('memberships')
      .where('memberKey', '==', c.personKey)
      .where('memberModelType', '==', 'person'),
    tenantScope: 'tenantsArray',
    onExport: 'full',
    onErasure: 'delete',
    // Declared for `onTenantExit: 'anonymize'`, NOT for `onErasure` (which deletes the
    // row outright when the member asks). The lifecycle pipeline keeps the membership as
    // club history and overwrites exactly these fields — every one of them is a copy of
    // person data (spec §10 lists them). `memberIsDeceased` is deliberately absent: it is
    // a boolean, overwriting it would corrupt the deceased-list filter, and a flag with
    // no name and no key beside it identifies nobody.
    anonymizeFields: [
      'memberKey', 'memberName1', 'memberName2', 'memberNickName', 'memberAbbreviation',
      'memberBirthYear', 'memberDeathYear', 'memberZipCode', 'memberBexioId', 'memberId',
    ],
    retention: KEEP_WHILE_MEMBER,
    blocksErasure: (docs) => {
      const active = docs.filter((d) => (d.get('dateOfExit') ?? '') === '');
      return active.length === 0 ? undefined : {
        code: 'activeMembership', count: active.length,
        detail: 'Du hast eine laufende Mitgliedschaft. Solange sie besteht, brauchen wir deine Daten, um sie zu führen. Bitte tritt zuerst aus, dann können wir deine Daten löschen.',
        // Art. 17 I/III GDPR makes erasure conditional, not all-or-nothing: the contract
        // tier is refusable, the consent tier is not. Without this the preview tells the
        // member "no" about their avatar too — data they are entitled to have erased
        // while the membership runs.
        blocksTiers: ['T1'],
      };
    },
  },
  {
    collection: 'ownerships',
    dataClass: 'membership',
    tier: 'T1',
    onTenantExit: 'delete',
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
    tier: 'T1',
    onTenantExit: 'delete',
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
    tier: 'T1',
    onTenantExit: 'delete',
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
    tier: 'T1',
    onTenantExit: 'delete',
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
    tier: 'T4',   // the function history is the association's record
    onTenantExit: 'anonymize',
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
    tier: 'T1',   // administering a group is an organizational role, never voluntary
    onTenantExit: 'anonymize',   // remove the subject from admins[]; the group stays
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
        detail: 'Du bist die einzige Person, die eine deiner Gruppen verwalten kann. Bitte gib diese Aufgabe zuerst an jemanden ab, sonst bleibt die Gruppe ohne Verwaltung zurück.',
        blocksTiers: ['T1'],   // the role has to be handed over; the avatar is unrelated
      };
    },
  },
  {
    collection: 'competition-levels',
    dataClass: 'identity',
    tier: 'T1',
    onTenantExit: 'delete',
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
    tier: 'T1',   // pre-contractual (Art. 6 I b covers the admission procedure)
    onTenantExit: 'delete',   // the admission record's purpose ends with the membership it led to
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
      || (!!c.email && String(doc.get('email') ?? '').toLowerCase() === c.email.toLowerCase()),
    onExport: 'full',
    onErasure: 'delete',
    retention: APPLICATION_RECORD,
  },
  {
    collection: 'prospects',
    dataClass: 'identity',
    // T2, not T1: consent is the legal basis (Vertragswerk Teil III.2) and consent is
    // withdrawable at any time, so nothing may block this row — which is the same statement
    // C5 §7 makes as "a revocation beats an active claim, immediately". A claim is a promise
    // bkaiser made to a partner; it is not a ground to keep processing.
    tier: 'T2',
    // `delete`, not `retain`: a T2 row may never survive an exit, because consent is
    // withdrawable at any time and leaving is not weaker than asking. The record lives in
    // `kring` for its whole life (C5 §2), so in practice this fires only for someone who both
    // signed up as a lead and held a `kring` account.
    onTenantExit: 'delete',
    // Not the access path: `find` cannot express the addresses → parentKey → prospects hop, so
    // this row carries a `resolve` (see the block above `prospectParentKeys`). Kept, and kept
    // narrow, because the shape tests read it and because a `find` that returned the whole
    // collection would be a live foot-gun for anyone who ignored the contract.
    find: (c: SubjectCtx) => db().collection('prospects').where('tenants', 'array-contains', c.tenantId),
    resolve: async (c: SubjectCtx) => {
      const parentKeys = await prospectParentKeys(c);
      if (parentKeys.length === 0) return [];
      const prefix = `${PROSPECT_PARENT_PREFIX}.`;
      return await docsByIds('prospects', parentKeys.map((k) => k.slice(prefix.length)));
    },
    tenantScope: 'tenantsArray',
    // The lead's own record — name of the Verein, segment, source, and who holds the claim. It
    // is exactly the disclosure-to-a-third-party the signup notice announced, so the person is
    // entitled to see it in full.
    onExport: 'full',
    onErasure: 'delete',
    retention: APPLICATION_RECORD,   // 24 months from last contact (C5 §7) — the existing tier, reused
  },

  // ─────────────────── financial records under the 10-year retention ────────────────
  {
    collection: 'bookings',
    dataClass: 'financial',
    tier: 'T3',
    onTenantExit: 'anonymize',
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
    tier: 'T3',
    onTenantExit: 'anonymize',
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
      'Auf deinen Namen sind noch Rechnungen offen. Sobald sie bezahlt oder storniert sind, können wir deine Daten löschen.',
    ),
  },
  {
    collection: 'invoice-positions',
    dataClass: 'financial',
    tier: 'T3',
    onTenantExit: 'anonymize',
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
    tier: 'T3',
    onTenantExit: 'anonymize',
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
    // No blocksErasure: a memberfee row is the *preparation* record for the yearly
    // invoice, not a debt. Its `state` only ever advances to 'uploaded' (the store
    // write in scs-member-fees.store.ts) — nothing writes 'paid' back from Bexio, so
    // gating on it blocked every member who was ever invoiced, forever. The debt is
    // the invoice it produced, and the `invoices` entry above already gates on that
    // (paymentDate, synced from Bexio).
  },
  {
    collection: 'bills',
    dataClass: 'financial',
    tier: 'T3',
    onTenantExit: 'anonymize',
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
    tier: 'T3',
    onTenantExit: 'anonymize',
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
    // it the honest terminal signal. See expenseIsOpen for the exact rule.
    blocksErasure: (docs) => blockOpenInvoice(
      docs.filter((d) => expenseIsOpen(String(d.get('bookingKey') ?? ''), String(d.get('status') ?? ''))).length,
      'Du hast noch eine Spesenabrechnung offen. Sobald sie verbucht ist, können wir deine Daten löschen.',
    ),
  },

  // ───────────────────────────── club content & activity ────────────────────────────
  {
    collection: 'tasks',
    dataClass: 'content',
    tier: 'T4',
    onTenantExit: 'anonymize',
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
    collection: 'meetings',
    dataClass: 'content',
    tier: 'T4',            // Vereinsdokumentation — the minutes are the association's record
    onTenantExit: 'retain',   // the protocol stays with the association, unchanged
    // Every subject link is an embedded avatar and none of them is queryable:
    // `attendees[].person` and `agenda[].owner` sit inside arrays, `chair`/`secretary`
    // inside maps. Hence the tenant scan plus `matches`, as on `groups`.
    find: (c: SubjectCtx) => db().collection('meetings').where('tenants', 'array-contains', c.tenantId),
    tenantScope: 'inQuery',
    matches: (doc, c) => nestedAvatarArrayHolds(doc, 'attendees', 'person', c.personKey)
      || nestedAvatarArrayHolds(doc, 'agenda', 'owner', c.personKey)
      || doc.get('chair.key') === c.personKey
      || doc.get('secretary.key') === c.personKey,
    onExport: 'index',
    indexFields: { title: 'name', date: 'meetingDate', route: '/meeting' },
    // A genuine 'retain', not a convenience one: minutes are the association's record of
    // what a body decided and who was in the room when it did. Editing a past protocol —
    // whether by dropping an attendee or by replacing their name with a pseudonym —
    // changes the account of a meeting that already happened, and the quorum, the
    // Ausstandsregeln and every decision rest on exactly that account. So the erasure
    // leaves meetings untouched and the export tells the member so.
    onErasure: 'retain',
    retention: CLUB_RECORD,
  },
  {
    collection: 'approvals',
    dataClass: 'content',
    tier: 'T4',            // the internal control trail of who decided what — legitimate interest
    onTenantExit: 'anonymize',
    // Both parties are flat embedded avatars, so the OR query is exact — same shape as `tasks`.
    find: (c: SubjectCtx) => db().collection('approvals').where(Filter.or(
      Filter.where('approver.key', '==', c.personKey),
      Filter.where('requestedBy.key', '==', c.personKey),
    )),
    tenantScope: 'tenantsArray',
    onExport: 'index',
    indexFields: { title: 'subjectName', date: 'decisionDate', route: '/approval' },
    onErasure: 'anonymize',   // the decision stays and stays attributable to *someone*
    anonymizeFields: [
      'approver.key', 'approver.name1', 'approver.name2',
      'requestedBy.key', 'requestedBy.name1', 'requestedBy.name2',
    ],
    // Deliberately no blocker for a pending approval assigned to the subject. It stalls the
    // workflow, but that is an operational problem with a documented remedy (withdraw and
    // re-request, approval.model.ts), not a legal reason to refuse an erasure.
    retention: CLUB_RECORD,
  },
  {
    collection: 'comments',
    dataClass: 'communication',
    tier: 'T4',
    onTenantExit: 'anonymize',
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
    tier: 'T4',
    onTenantExit: 'anonymize',
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
    tier: 'T4',
    onTenantExit: 'anonymize',
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
    tier: 'T4',   // the logbook is the club's record, not the rower's
    onTenantExit: 'anonymize',
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
    tier: 'T4',
    onTenantExit: 'delete',   // derived from trips and rebuildable — nothing to preserve
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
    tier: 'T4',
    onTenantExit: 'anonymize',
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
    tier: 'T4',
    onTenantExit: 'anonymize',
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
    tier: 'T4',   // a published people list can be a board roster the club must publish — not voluntary as a row
    onTenantExit: 'anonymize',   // remove the entry, keep the section
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
    tier: 'T4',
    onTenantExit: 'anonymize',
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
    tier: 'T4',
    onTenantExit: 'anonymize',
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
    tier: 'T4',
    onTenantExit: 'anonymize',
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
    tier: 'T3',   // part of the Anlagebuchhaltung
    onTenantExit: 'anonymize',
    find: (c: SubjectCtx) => db().collection('assets').where('responsiblePersonKey', '==', c.personKey),
    tenantScope: 'tenantsArray',
    onExport: 'none',             // the asset register is club property, not member data
    onErasure: 'anonymize',
    anonymizeFields: ['responsiblePersonKey'],
    retention: RETAIN_10Y,        // part of the accounting records (Anlagebuchhaltung)
  },
  {
    collection: 'aliases',
    dataClass: 'content',
    tier: 'T4',   // Vereinsdokumentation — the short link belongs to the club, not the subject
    // The tenancy ends, the printed poster does not. Strip the identity, keep the alias.
    onTenantExit: 'anonymize',
    // TWO subject links, and BOTH carry the PREFIXED `person.<okey>` form — so this row uses
    // ctx.parentKey, not ctx.personKey. Getting that wrong is the trap documented on SubjectCtx:
    //   createdBy  — who minted the alias
    //   targetKey  — an alias pointing AT the subject (the diary case, 'Barbara' → person.<okey>)
    find: (c: SubjectCtx) => db().collection('aliases').where(Filter.or(
      Filter.where('createdBy', '==', c.parentKey),
      Filter.where('targetKey', '==', c.parentKey),
    )),
    tenantScope: 'tenantsArray',
    onExport: 'index',
    indexFields: { title: 'alias', date: 'createdAt', route: '/alias' },
    // NEVER 'delete'. The alias may be printed on a poster, a boat marker or a membership
    // card; deleting the document turns a physical object into a dead link, and the club's
    // record of which code was issued disappears with it. Anonymizing empties the identity
    // instead: `createdBy` and `original` (which can hold the subject's name in a lookup
    // space) go, and `targetKey` goes too — an alias that resolved to this person must stop
    // resolving to them. buildTargetUrl then returns '' and the resolver answers 404, which
    // is the honest outcome for a target that no longer exists.
    onErasure: 'anonymize',
    anonymizeFields: ['createdBy', 'targetKey', 'original'],
    retention: CLUB_RECORD,
  },

  // ────────────────────────────────────── logs ──────────────────────────────────────
  {
    collection: 'sessions',
    dataClass: 'log',
    tier: 'T4',   // operational log (Betriebssicherheit) — legitimate interest, same basis as T4
    onTenantExit: 'delete',
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
    tier: 'T4',
    onTenantExit: 'delete',
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
    tier: 'T4',
    onTenantExit: 'delete',
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
    tier: 'T3',
    onTenantExit: 'retain',   // four-eyes evidence for a booked payment run
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
    tier: 'T3',
    onTenantExit: 'retain',   // a signature loses its evidentiary value if the record is altered
    // esign records carry a SINGULAR `tenantId`, not a `tenants[]` array
    // (esign.model.ts:32, firestore.rules:414-415) — hence the tenant-scoped scan and
    // tenantScope 'inQuery'. The scan is also what reaches documents the subject only
    // SIGNED: signees[] carries their e-mail and name but no uid, so
    // `ownerUserId == uid` alone would miss every document owned by someone else.
    find: (c: SubjectCtx) => db().collection('esignList').where('tenantId', '==', c.tenantId),
    tenantScope: 'inQuery',
    matches: (doc, c) => doc.get('ownerUserId') === c.uid
      || (!!c.email && ((doc.get('signees') as { email?: string }[] | undefined) ?? [])
        .some((s) => String(s?.email ?? '').toLowerCase() === c.email.toLowerCase())),
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
        detail: 'Ein Dokument wartet noch auf deine Unterschrift. Bitte unterschreibe es oder brich den Vorgang ab, danach können wir deine Daten löschen.',
        blocksTiers: ['T1'],   // the signature flow needs the signee reachable
      };
    },
  },
  {
    collection: 'esignAudit',
    dataClass: 'log',
    tier: 'T3',
    onTenantExit: 'retain',   // tamper evidence — altering it defeats its only purpose
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
  {
    // Tenant-scoped audit trail written by `applyFeatureSelection` (feature building
    // blocks, task 8): one doc per enable/disable transition, `by` holding the acting
    // admin's uid. It is the CLUB's usage/billing trail (FeatureEvent's own docstring in
    // @okr/shared-models calls it "the usage trail billing needs"), naming an actor —
    // structurally the same shape as `responsibilities`/`tasks`/`comments`/`calevents`/
    // `sections` above (a tenant record that names a person), not the "subject's own
    // activity log" shape of `sessions`/`activities`/`docGenerations` below. Anonymize,
    // don't delete: erasing the acting admin must not erase the tenant's own record of
    // which features were switched on and when.
    collection: 'featureEvents',
    dataClass: 'log',
    tier: 'T4',
    onTenantExit: 'anonymize',   // the transition record is the tenant's, only the actor goes
    // `by == c.uid` alone is NOT tenant-exact: a uid's CURRENT tenant (`UserModel.tenants`,
    // always exactly one — `setTenant` in user.model.ts:56 overwrites it wholesale on a
    // tenant move) is not the tenant an event was written in. An admin who moves from
    // tenant A to tenant B still has `by == uid` events under A; without the `tenantId`
    // post-filter, a `find` run with `ctx.tenantId == B` would return A's events too, and
    // `resolveDocs` would then export/anonymize/delete another tenant's audit trail for an
    // action performed in B. `tenantScope: 'inQuery'` + `matches` below closes that.
    find: (c: SubjectCtx) => db().collection('featureEvents').where('by', '==', c.uid),
    tenantScope: 'inQuery',
    matches: (doc, c) => doc.get('tenantId') === c.tenantId,
    onExport: 'full',
    onErasure: 'anonymize',       // the transition record stays as the tenant's usage trail
    anonymizeFields: ['by'],
    retention: LOG_24M,
  },
  {
    // `feature-rollout` is the operator/platform-staff kill-switch table (task 7) —
    // GLOBAL, one doc per catalogue block id, not owned by any tenant. `updatedBy` is
    // the uid of whichever operator last changed a block's rollout stage. No write path
    // exists yet (rules deny all client writes; Task 7 only reads it), so the field is
    // never populated today — declared now so the collection is classified before a
    // future operator console starts writing it.
    collection: 'feature-rollout',
    dataClass: 'log',
    tier: 'T4',
    // Not tenant data at all — a member leaving one tenant has no bearing on a global,
    // cross-tenant rollout record, so there is nothing for tenant-exit to do here.
    onTenantExit: 'retain',
    find: (c: SubjectCtx) => db().collection('feature-rollout').where('updatedBy', '==', c.uid),
    // No tenant dimension whatsoever (see onTenantExit above) — `find` already returns
    // exactly this subject's rows, nothing to post-filter.
    tenantScope: 'none',
    // Cross-tenant catalogue administration, not this member's own tenant data — out of
    // scope for a tenant-scoped "my data" export (same reasoning as `payment-orders`).
    onExport: 'none',
    // Kill-switch history is operational integrity data akin to `esignAudit`/
    // `payment-orders`: erasing it would let a past operator decision vanish from the
    // platform's own audit trail.
    onErasure: 'retain',
    retention: { months: 'indefinite', legalBasis: 'Plattform-Betriebssicherheit — Nachvollziehbarkeit von Feature-Rollout-Entscheidungen' },
  },
  {
    /**
     * C4 — one 3LS escalation from a partner, in tenant `kring`.
     *
     * **A row, not a `not personal data:` line.** The diagnostic format (§6.1) is genuinely
     * hostile to member data — `refs[]` carries okey ids never contents, there is no log-paste
     * field, `description` passes through `redactSensitive` server-side before it is written, and
     * an attachment path may only be added once the partner sets `redactionConfirmed`. That is
     * what keeps the *partner's customers* out of this collection, and it is why the WIP
     * classification looked right. It is not what decides this row.
     *
     * What decides it is `classifiedBy`: a Firebase Auth uid of a bkaiser staff member. This file
     * classifies a uid-bearing collection as a row every other time it appears — `featureEvents.by`,
     * `feature-rollout.updatedBy`, `esignAudit.deletedBy`, `payment-orders.createdBy` — and
     * `erasure-log` earns its `not personal data:` line by explicitly carrying no uid at all. So
     * "diagnostics, not member data" answers the wrong question: the subject here is the classifier,
     * not the reporter.
     *
     * There is no reporter to reach. A submission arrives on the partner's **service identity**
     * (`PartnerModel.serviceUid`), so `partnerKey` names a company, and the comment thread reuses
     * the `comments` collection, which is already a row of its own. A natural person at the
     * partner's END CUSTOMER can still surface inside `description` despite the redaction — that is
     * the same shape as the `meteringRecords` gap below and it is unreachable for the same reason:
     * bkaiser is that person's independent controller and their request arrives directly, never
     * through `eraseMyData`.
     */
    collection: 'tickets',
    dataClass: 'log',
    tier: 'T4',
    // Not the classifier's own tenant data at all — the ticket belongs to the escalation queue, and
    // a staff member moving out of `kring` must not take the queue's audit trail with them.
    onTenantExit: 'retain',
    find: (c: SubjectCtx) => db().collection('tickets').where('classifiedBy', '==', c.uid),
    tenantScope: 'tenantsArray',
    // Cross-tenant channel administration, not this member's own tenant data — same reasoning as
    // `payment-orders` and `feature-rollout`.
    onExport: 'none',
    // `retain`, not `anonymize`. The classification decides whether an escalation is free or
    // chargeable (C4 §4), and `TicketModel` states outright that *who set it and when are part of
    // the record*. Blanking `classifiedBy` would erase the only evidence behind an invoice —
    // structurally the same call `payment-orders` makes for four-eyes evidence.
    onErasure: 'retain',
    retention: LOG_24M,   // §6.1 fixes this tier explicitly; attachments inherit it (see `attachmentPaths`)
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
  const docs = entry.resolve ? await entry.resolve(ctx) : (await entry.find(ctx).get()).docs;
  return docs.filter((doc) => inTenant(entry, doc, ctx) && (entry.matches?.(doc, ctx) ?? true));
}

// ──────────────────────────────────────────────────────────────────────────────────
// Collections deliberately WITHOUT a row. Keep this list in sync with
// `libs/shared/models/src/lib/**` — the privacy audit grades this file against the
// live collection list and an unexplained omission becomes a permanent finding.
// The completeness test derives the constant list from `@okr/shared-models` and parses
// the comments below, so a newly added collection fails the test until it is a row,
// a `not personal data:` line, or a `gap:` line.
// ──────────────────────────────────────────────────────────────────────────────────
// not personal data: partners — the partner COMPANY's operational record (C3 §5): contract
//   dates, status, heartbeat, the reporting identity's uid. Its people live on the partner's
//   Org in `bkg` (orgKey), which the orgs row already covers.
// not personal data: commissionEntries — a ledger line (C3 §7): partnerKey, tenantId, band,
//   amounts. No natural person appears on it; the contact-of-record stays on the metering
//   record it was derived from.
// gap: meteringRecords — carries ONE business-role contact per reported tenant (C2 §7:
//   `contact.name/role/email`, never member data). It is personal data of a natural person and
//   bkaiser is its INDEPENDENT CONTROLLER, not a processor — so it is deliberately not reachable
//   from a tenant member's own erasure: the contact is a person at the partner's END CUSTOMER,
//   who is not a subject of any bkaiser-hosted tenant and whose erasure request reaches bkaiser
//   directly, never through `eraseMyData`. Turning it into a row would require SubjectCtx to
//   carry an identity that does not exist in this system. Retention and the direct-request path
//   are C3 §9's open item.
// not personal data: aliasSpaces — alias namespace CONFIGURATION (charset, length, tracking
//   default, roleNeeded). No person field, no createdBy; the aliases minted inside it are the
//   personal-data side and have their own row.
// not personal data: aliasStats — per-alias DAILY AGGREGATES (count, referrer host, device
//   class, country). Deliberately no IP and no uid: that is precisely why `counter` is the
//   recommended default tracking level. If a person were identifiable here, the default
//   would be the wrong one. Written by the resolver from Teilprojekt 4.
// NOTE (Teilprojekt 4): `aliasEvents` — one row per click WITH a hashed IP and the uid — is
//   personal data and will need a real row here, not a line in this block. It has no model
//   constant yet, so the completeness test does not demand it today. Do not let it ship
//   unregistered: `uid` is in SUBJECT_LINK_FIELDS, so audit check 11 fires on its first write.
// not personal data: accounts — chart of accounts (account numbers, names, hierarchy)
// not personal data: accounting-configs — per-tenant accounting settings
// not personal data: app-config — tenant configuration; opEmail/dpoEmail are operator
//   role addresses published on purpose, never a data subject's contact details
// not personal data: asset-categories — depreciation categories
// not personal data: asset-movements — asset postings, reference assets and accounts only
// not personal data: booking-lines — debit/credit lines, reference accounts and amounts
// not personal data: calendars — calendar definitions (name, colour, visibility)
// not personal data: categories — enum/value lists used by dropdowns
// not personal data: erasure-log — CF-written evidence that an erasure ran: counts per
//   collection and a salted, per-tenant pseudonym. Never a name, e-mail, personKey or
//   uid, and never a statement about whether the person record survived (D-P5-2).
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
// not personal data: workflow-rules — tenant policy ("on this event, notify whoever is
//   responsible"). References a responsibility role, never a person; the tasks it opens
//   are the personal-data side and are covered by the `tasks` row.
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
