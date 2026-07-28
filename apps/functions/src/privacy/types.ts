import type { DocumentSnapshot, Query } from 'firebase-admin/firestore';

/**
 * Coarse category a collection's personal data falls into. Used to group the export
 * document into sections a member can actually read ("Kontaktdaten", "Finanzen", …)
 * and to reason about erasure defaults.
 */
export type DataClass =
  | 'identity' | 'contact' | 'membership' | 'financial'
  | 'communication' | 'content' | 'consent' | 'log';

/**
 * Everything a `find` needs to locate one data subject's records.
 *
 * NOTE on key shapes — this is a real trap in this codebase and the two forms are NOT
 * interchangeable:
 * - `personKey`  the RAW `persons` document id. Used by `memberKey`, `ownerKey`,
 *                `subjectKey`, `objectKey`, `authorKey`, `personKey`, and by every
 *                nested `AvatarInfo.key`.
 * - `parentKey`  the PREFIXED `person.<okey>` form. Used by `addresses.parentKey`,
 *                `address-directory.parentKey` and by the `avatars` document id.
 * - `uid`        the Firebase Auth uid = the `users` document id. Used by
 *                `sessions.userKey`, `expenses.userId`, `docGenerations.userId`,
 *                `payment-orders.createdBy/approvedBy`, `esignList.ownerUserId`.
 */
export interface SubjectCtx {
  readonly uid: string;
  readonly personKey: string;
  readonly parentKey: string;   // `person.${personKey}`
  readonly tenantId: string;
}

/** A reason why an erasure request cannot be executed yet. */
export interface Blocker {
  readonly code: 'activeMembership' | 'openInvoice' | 'pendingSignature' | 'soleAdmin';
  readonly count: number;
  readonly detail: string;      // German, shown verbatim to the user
}

export interface RetentionRule {
  readonly months: number | 'indefinite';
  readonly legalBasis: string;  // German, e.g. 'GebüV / OR Art. 958f — 10 Jahre'
}

/**
 * One collection that holds personal data. Exactly one row per collection — export,
 * erasure preview, erasure execution and the retention audit all read THIS table and
 * never enumerate collections themselves.
 *
 * ## Contract every consumer MUST honour
 *
 * 1. **Tenant filter.** `find` mirrors the existing query helpers in
 *    `@okr/shared-util-functions` (which do not filter by tenant either), so that the
 *    map needs no new composite indexes. The consumer MUST drop every returned doc
 *    whose `tenants` array does not contain `ctx.tenantId`. Rows whose `find` is a
 *    whole-collection scan already carry the tenant filter in the query.
 * 2. **`matches`.** When present, the link cannot be expressed as a Firestore
 *    predicate (the subject sits inside an array of embedded `AvatarInfo` maps).
 *    `find` then returns a tenant-scoped scan and the consumer MUST discard every doc
 *    for which `matches` returns false. Ignoring it leaks other members' records.
 * 3. **Nested anonymisation.** `anonymizeFields` lists every field that could carry
 *    the subject's identity, including fields belonging to a *second* party on the
 *    same document (e.g. `tasks.author` vs `tasks.assignee`). The consumer MUST only
 *    overwrite a nested `AvatarInfo` group whose `.key` equals `ctx.personKey`, and
 *    for array fields MUST remove only the matching element.
 */
export interface SubjectDataEntry {
  readonly collection: string;
  readonly dataClass: DataClass;
  readonly find: (ctx: SubjectCtx) => Query;
  readonly onExport: 'full' | 'index' | 'none';
  readonly onErasure: 'delete' | 'anonymize' | 'retain';
  /** Fields overwritten with the pseudonym when onErasure === 'anonymize'. */
  readonly anonymizeFields?: readonly string[];
  /** Fields used to build an `index` export row. */
  readonly indexFields?: { title: string; date: string; route: string };
  readonly retention: RetentionRule;
  readonly blocksErasure?: (docs: DocumentSnapshot[]) => Blocker | undefined;
  /**
   * Post-filter for rows whose subject link is not queryable. See contract rule 2.
   * Absent means `find` is already exact.
   */
  readonly matches?: (doc: DocumentSnapshot, ctx: SubjectCtx) => boolean;
}
