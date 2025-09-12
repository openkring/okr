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
