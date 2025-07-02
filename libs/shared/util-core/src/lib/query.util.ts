import { DbQuery } from "@bk2/shared/models";

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

export function addSystemQueries(dbQuery: DbQuery[], tenant: string): DbQuery[] {
  for (const _query of getSystemQuery(tenant)) {
    dbQuery.push(_query);
  }
  return dbQuery;
}