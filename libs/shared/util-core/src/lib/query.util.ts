import { DbQuery } from "@okr/shared-models";

/**
 * The shared-data sentinel. A document carrying `'system'` in its `tenants[]` is READABLE by
 * every tenant — the inversion of the normal default, where a shared document has to name each
 * tenant explicitly and a newly provisioned tenant therefore starts out seeing nothing.
 *
 * This is not new: `firestore.rules` has granted it since the rules were written
 * (`belongsToTenant()` → `data.tenants.hasAny(['system'])`, and the header comment at the top
 * of that file documents it), and `QueryValueType` in `db-query.model.ts` was typed
 * `string[]` specifically to allow `tenants array-contains-any ['scs', 'system']`. Only the
 * client-side QUERY half was ever missing, which is why no document in the database used the
 * sentinel until 2026-08-25: rules would have allowed the read, but `getSystemQuery` never
 * asked for it, so such a document was invisible to every list view.
 *
 * WRITES ARE DELIBERATELY NOT SHARED. `'system'` grants read only; a tenant client may never
 * create, update, archive or detach a `'system'` document (see `getDeletePatch` below and the
 * `canWriteTenant()` split in `firestore.rules`). Shared reference data is curated centrally
 * through the Admin SDK, because the alternative — letting any signed-in user of any tenant
 * rewrite a document every other tenant reads — is a cross-tenant write hole.
 *
 * ONLY for genuinely universal, non-personal reference data. NEVER for `persons`, `addresses`,
 * `users`, or anything else carrying content or PII: the sentinel makes a document readable
 * fleet-wide, which for those collections is precisely the thing tenant isolation exists to
 * prevent.
 */
export const SYSTEM_TENANT = 'system';

export function getRangeQuery(key: string, lowValue: number | string, highValue: number | string, isArchived = false): DbQuery[] {
  return [
    { key: 'isArchived', operator: '==', value: isArchived },
    { key: key, operator: '>=', value: lowValue },
    { key: key, operator: '<=', value: highValue }
  ]
}

/**
 * The standard tenant scope for a list query: not archived, and belonging to this tenant OR
 * shared fleet-wide via {@link SYSTEM_TENANT}.
 *
 * `array-contains-any` (not `array-contains`) is what makes the sentinel visible. Three notes:
 *  - No new Firestore indexes are needed. An `arrayConfig: CONTAINS` composite index serves
 *    `array-contains` and `array-contains-any` alike, so every index already in
 *    `firestore.indexes.json` keeps working unchanged.
 *  - Firestore still allows only ONE array clause per query, exactly as before. Call sites that
 *    wanted a second `array-contains` (folder `parents`, meeting `relatedKey`, rag sections)
 *    already work around that and are unaffected.
 *  - `getQuery` passes `operator` straight through to `where()`, so no query-builder change.
 */
export function getSystemQuery(tenant: string): DbQuery[] {
  return [
    { key: 'isArchived', operator: '==', value: false },
    { key: 'tenants', operator: 'array-contains-any', value: [tenant, SYSTEM_TENANT] }
  ]
}

/**
 * The same tenant scope as {@link getSystemQuery}, but WITHOUT the `isArchived == false` clause —
 * archived documents are included.
 *
 * Only for an admin-facing 'show archived' view. Archiving is this app's delete, so archived
 * documents are debris by definition: a series somebody gave up on, a group that was replaced.
 * That debris is invisible everywhere else, which is exactly how three parallel '4X-Dienstag'
 * series survived unnoticed for three months. Never use this for an ordinary list.
 */
export function getArchiveInclusiveQuery(tenant: string): DbQuery[] {
  return [
    { key: 'tenants', operator: 'array-contains-any', value: [tenant, SYSTEM_TENANT] }
  ]
}

/**
 * Adds system queries to the existing query array for a specific tenant.
 * @param dbQuery The existing database query array. Beware: it will be modified.
 * @param tenant The tenant identifier.
 * @returns The updated database query array with system queries added.
 */
export function addSystemQueries(dbQuery: DbQuery[], tenant: string): DbQuery[] {
  for (const query of getSystemQuery(tenant)) {
    dbQuery.push(query);
  }
  return dbQuery;
}

/**
 * Whether a document read **by document id** belongs to the given tenant.
 *
 * Queries are tenant-scoped by `getSystemQuery` (`tenants array-contains`), but a read by
 * id bypasses that filter entirely — and `pages`/`sections` are world-readable in
 * `firestore.rules` (the anonymous PWA landing needs them), so nothing else stops a
 * cross-tenant read. Any code path that resolves a document from a key must call this.
 *
 * Deliberately checks ONLY `tenants`: whether archived documents are wanted is a separate,
 * per-call-site decision (the AOC editors show them, the rendered page does not).
 *
 * @param doc the document (or undefined, e.g. a missing doc)
 * @param tenantId the tenant the reader belongs to
 */
export function belongsToTenant(
  doc: { tenants?: string[] } | undefined | null,
  tenantId: string
): boolean {
  return !!doc && Array.isArray(doc.tenants)
    && (doc.tenants.includes(tenantId) || doc.tenants.includes(SYSTEM_TENANT));
}

/**
 * Whether this tenant may WRITE the document — deliberately narrower than
 * {@link belongsToTenant}, which also accepts {@link SYSTEM_TENANT}.
 *
 * Read-sharing and write-sharing must not use one predicate. A `'system'` document is read by
 * every tenant, so allowing a tenant client to write it would let any signed-in user of any
 * tenant rewrite data the whole fleet reads. Shared reference data is curated centrally
 * (Admin SDK / scripts), never from a tenant app. Mirrors `canWriteTenant()` in
 * `firestore.rules`, which is the authoritative check — this one exists so the UI can hide or
 * disable the action rather than let the user hit a raw PERMISSION_DENIED.
 */
export function canWriteTenant(
  doc: { tenants?: string[] } | undefined | null,
  tenantId: string
): boolean {
  return !!doc && Array.isArray(doc.tenants) && doc.tenants.includes(tenantId);
}
