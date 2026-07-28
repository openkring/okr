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
  /**
   * The subject's login e-mail (Firebase Auth / `users.loginEmail`), lowercased.
   *
   * Required, not optional: three collections identify the subject by e-mail and by
   * nothing else — `applications` (created anonymously, `personKey` still empty),
   * `esignList.signees[].email` (a member who signed someone else's document) and the
   * `logAuth` activities (`author.key` is empty, the e-mail sits in `payload`).
   * Without it those records are unreachable for both export and erasure.
   */
  readonly email: string;
}

/**
 * How a row's documents are scoped to a tenant. Declared per row because the mechanism
 * genuinely differs: a single global "filter on `tenants`" instruction silently
 * discards every `esignList` and `esignAudit` document, neither of which has a
 * `tenants` array at all.
 */
export type TenantScope =
  /** `tenants: string[]` — keep only docs whose array contains `ctx.tenantId`. */
  | 'tenantsArray'
  /** singular `tenantId` field — keep only docs where it equals `ctx.tenantId`. */
  | 'tenantIdField'
  /** `find` already pins the tenant; no post-filter needed. */
  | 'inQuery'
  /** tenant is a document-path segment; read it off `doc.ref` (see the row comment). */
  | 'docPath'
  /** no tenant dimension: the document path is already unique to the subject. */
  | 'none';

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
 * The three steps below are a **pipeline and the order is normative**:
 *
 * ```
 *   docs = find(ctx).get()          // 1. query
 *          .filter(tenantScope)     // 2. tenant post-filter, per `tenantScope`
 *          .filter(matches ?? all)  // 3. subject post-filter, per `matches`
 *   blocker = blocksErasure?.(docs) // 4. sees ONLY the subject's own docs
 * ```
 *
 * 1. **Query.** `find` mirrors the existing query helpers in
 *    `@okr/shared-util-functions` (which do not filter by tenant either), so the map
 *    needs no new composite indexes.
 * 2. **Tenant.** Apply the row's `tenantScope`. It is required on every row precisely
 *    so that no consumer has to guess which mechanism a collection uses.
 * 3. **`matches`.** When present, the subject link cannot be expressed as a Firestore
 *    predicate (the subject sits inside an array of embedded maps, or is identified by
 *    e-mail inside free text). `find` is then a scan and the consumer MUST discard
 *    every doc for which `matches` returns false. Skipping it leaks other members'
 *    records into an export and anonymises strangers' documents on erasure.
 * 4. **`blocksErasure` runs LAST**, on the fully filtered set — it never sees a
 *    document that failed `tenantScope` or `matches`. The `groups` row depends on
 *    this: it is handed only the groups the subject actually administers, so
 *    `admins.length <= 1` means "the subject is the last admin". Handing it the raw
 *    scan would block erasure on every group in the tenant that has no admins at all.
 * 5. **Nested anonymisation.** `anonymizeFields` lists every field that could carry
 *    the subject's identity, including fields belonging to a *second* party on the
 *    same document (e.g. `tasks.author` vs `tasks.assignee`). The consumer MUST only
 *    overwrite a nested `AvatarInfo` group whose `.key` equals `ctx.personKey`, and
 *    for array fields MUST remove only the matching element.
 */
export interface SubjectDataEntry {
  readonly collection: string;
  readonly dataClass: DataClass;
  readonly find: (ctx: SubjectCtx) => Query;
  /** How to keep this row's documents inside `ctx.tenantId`. See contract step 2. */
  readonly tenantScope: TenantScope;
  readonly onExport: 'full' | 'index' | 'none';
  readonly onErasure: 'delete' | 'anonymize' | 'retain';
  /** Fields overwritten with the pseudonym when onErasure === 'anonymize'. */
  readonly anonymizeFields?: readonly string[];
  /** Fields used to build an `index` export row. */
  readonly indexFields?: { title: string; date: string; route: string };
  readonly retention: RetentionRule;
  /**
   * Runs LAST, on the tenant- and `matches`-filtered set only. See contract step 4.
   * MUST return `undefined` for an empty input.
   */
  readonly blocksErasure?: (docs: DocumentSnapshot[]) => Blocker | undefined;
  /**
   * Post-filter for rows whose subject link is not queryable. See contract step 3.
   * Absent means `find` is already exact.
   */
  readonly matches?: (doc: DocumentSnapshot, ctx: SubjectCtx) => boolean;
}
