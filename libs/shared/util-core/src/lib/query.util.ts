import { DbQuery } from "@okr/shared-models";

export function getRangeQuery(key: string, lowValue: number | string, highValue: number | string, isArchived = false): DbQuery[] {
  return [
    { key: 'isArchived', operator: '==', value: isArchived },
    { key: key, operator: '>=', value: lowValue },
    { key: key, operator: '<=', value: highValue }
  ]
}

export function getSystemQuery(tenant: string): DbQuery[] {
  return [
    { key: 'isArchived', operator: '==', value: false },
    { key: 'tenants', operator: 'array-contains', value: tenant }
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
  return !!doc && Array.isArray(doc.tenants) && doc.tenants.includes(tenantId);
}
