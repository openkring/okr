import { DbQuery } from '@bk2/shared-models';
import { Firestore, OrderByDirection, WhereFilterOp } from 'firebase-admin/firestore';

/**
 * Search data based on the given query.
 * This function should not be used directly but via dataService.searchData().
 * @param firestore   a handle to the Firestore database
 * @param collectionName the name of the Firestore collection to search in
 * @param dbQuery the query to search for (an array of DbQuery objects: key, operator, value)
 * @param orderByParam the name of the field to order by
 * @param sortOrderParam the sort order (asc or desc)
 * @returns an Observable of the search result (array of T)
 */
export async function searchData<T>(firestore: Firestore, collectionName: string, dbQuery: DbQuery[], orderByParam: string, sortOrderParam: OrderByDirection = 'asc'): Promise<T[]> {
  let query: FirebaseFirestore.Query = firestore.collection(collectionName);

  for (const _dbQuery of dbQuery) {
    query = query.where(_dbQuery.key, _dbQuery.operator as WhereFilterOp, _dbQuery.value);
  }

  if (orderByParam) {
    query = query.orderBy(orderByParam, sortOrderParam);
  }
  const snapshot = await query.get();
  if (snapshot.empty) {
    return [];
  }
  return snapshot.docs.map(doc => {
    return { ...doc.data(), bkey: doc.id } as T;
  });
}

/**
 * Resolve a possibly dotted field path (e.g. `reserver.name2`) against an object.
 * A key without a dot resolves to a plain property access.
 */
function getByPath(obj: any, path: string): unknown {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/**
 * Helper function to check whether data has changed.
 * Keys in `newData` may be dotted field paths (e.g. `reserver.name2`) to compare against
 * nested fields — this mirrors the dot-notation used in Firestore `update()` calls, so that
 * a nested-field sync is only written when the nested value actually changed.
 * @param currentData  the current data (typically a BkModel from the database)
 * @param newData the new data to compare with (typically a partial BkModel; keys may be dotted paths)
 * @returns true if any one of the data fields has changed, false otherwise
 */
export function hasChanged(currentData: any, newData: Record<string, any>): boolean {
  for (const key of Object.keys(newData)) {
    if (getByPath(currentData, key) !== newData[key]) {
      return true;
    }
  }
  return false;
}
