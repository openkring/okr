import type { DocumentSnapshot, Query } from 'firebase-admin/firestore';
import type { Blocker, DataClass, DataTier } from '@okr/shared-models';

/**
 * The wire-contract types (`DataClass`, `DataTier`, `Blocker`, `PreviewRow`,
 * `ErasurePreview`, …) live in `@okr/shared-models/privacy-rights.model` because the
 * profile card renders exactly what these callables return; a second declaration on the
 * client would drift the first time a section is added. They are re-exported here so the
 * privacy module keeps importing its vocabulary from one place.
 */
export type { Blocker, DataClass, DataTier } from '@okr/shared-models';

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
  /** `find` already pins the tenant; no post-filter needed. */
  | 'inQuery'
  /** tenant is a document-path segment; read it off `doc.ref` (see the row comment). */
  | 'docPath'
  /** no tenant dimension: the document path is already unique to the subject. */
  | 'none';

/**
 * What the tenant-exit pipeline (membership-lifecycle spec §6 step 3) does with a row
 * when the subject leaves *this* tenant. Server-side only — no client consumer, so it
 * stays out of the wire contract.
 *
 * - `delete`    the documents are tenant-scoped and go away with the tenancy.
 * - `anonymize` the record stays with the association and the identity is overwritten
 *               (D-P5-6 / D-L4) — same `anonymizeFields` contract as `onErasure`.
 * - `detach`    the document is SHARED across tenancies (`persons`, `users`, `addresses`,
 *               `avatars`): remove `tenantId` from its own `tenants[]` and delete it only
 *               if that array empties (D-L2). Never a global delete — that damages another
 *               tenancy and discloses that it exists (D-P5-2).
 * - `retain`    nothing happens at exit; the row's own `retention` rule governs.
 */
export type TenantExitAction = 'delete' | 'anonymize' | 'detach' | 'retain';

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
 * **Call `resolveDocs(entry, ctx)`. Do not call `find` yourself.** `find` is exported
 * only so tests can assert its query shape; on its own it is not safe — 8 rows return
 * documents belonging to other members and rely on `matches` to filter them out.
 * `resolveDocs` runs the pipeline below in the normative order:
 *
 * ```
 *   docs = find(ctx).get()          // 1. query
 *          .filter(tenantScope)     // 2. tenant post-filter, per `tenantScope`
 *          .filter(matches ?? all)  // 3. subject post-filter, per `matches`
 *   blocker = blocksErasure?.(docs) // 4. sees ONLY the subject's own docs
 * ```
 *
 * 1. **Query.** `find` mostly mirrors the existing query helpers in
 *    `@okr/shared-util-functions`, so the map needs few new composite indexes.
 * 2. **Tenant.** `resolveDocs` applies the row's `tenantScope`. It is required on every
 *    row precisely so that no consumer has to guess which mechanism a collection uses.
 * 3. **`matches`.** When present, the subject link cannot be expressed as a Firestore
 *    predicate (the subject sits inside an array of embedded maps, or is identified by
 *    e-mail inside free text). `find` is then a scan and the doc set MUST be narrowed
 *    by `matches`. Skipping it leaks other members' records into an export and
 *    anonymises strangers' documents on erasure.
 * 4. **`blocksErasure` runs LAST**, on the output of `resolveDocs` — it never sees a
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
  /** Legal basis — see `DataTier`. Consumed by the erasure preview's `canDeleteNow`. */
  readonly tier: DataTier;
  /**
   * What the tenant-exit pipeline does with this row — see `TenantExitAction`. Declared
   * with no consumer in this slice on purpose: the pipeline is a later slice, but
   * classifying the rows is the actual work and it is the same work whenever it happens.
   */
  readonly onTenantExit: TenantExitAction;
  /**
   * The raw query. **Not a supported access path** — call `resolveDocs(entry, ctx)`
   * instead. On 8 rows this deliberately over-fetches and relies on `tenantScope` and
   * `matches` to narrow the result; using it directly leaks other members' documents.
   */
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
