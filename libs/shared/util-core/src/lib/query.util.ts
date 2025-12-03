import { DbQuery } from "@bk2/shared-models";

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