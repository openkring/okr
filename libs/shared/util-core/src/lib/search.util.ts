import { orderBy, OrderByDirection, QueryConstraint, where, WhereFilterOp } from 'firebase/firestore';
import { map, Observable, of } from 'rxjs';

import { BkModel, DbQuery, UserModel } from '@bk2/shared-models';
import { warn } from './log.util';

/*----------------------- SEARCH ----------------------------------------------*/
/**
 * Convert a database query array into Firestore QueryConstraints.
 * @param dbQuery the database query array to convert
 * @param orderByParam the field to order by
 * @param sortOrderParam the sort order (asc or desc)
 * @returns an array of Firestore QueryConstraints
 */
export function getQuery(dbQuery: DbQuery[], orderByParam = 'name', sortOrderParam = 'asc'): QueryConstraint[] {
  const queries: QueryConstraint[] = [];
  for (const queryItem of dbQuery) {
    queries.push(where(queryItem.key, queryItem.operator as WhereFilterOp, queryItem.value));
  }
  queries.push(orderBy(orderByParam, sortOrderParam as OrderByDirection));
  return queries;
}

/** 
 * Retrieve the first item in a list of items that has the given key.
 * This is typically used in services read() function to find a model object by its key. 
 * The items$ parameter is then taken from the list() function of the service to use the cached data.
 * The key is the Firestore Document ID.
 * @param items$ the list of items to search in
 * @param key the key to search for
 * @returns the first item that has the given key or undefined if no such item exists
 */
export function findByKey<T extends BkModel>(items$: Observable<T[]>, key: string | undefined | null): Observable<T | undefined> {
  if (!key || key.length === 0) {
    warn(`search.util.findByKey: invalid key <${key}>`);
    return of(undefined);
  }
  return items$.pipe(
    map((items: T[]) => {
      return items.find((item: T) => item.bkey === key);
    }));
}

/**
 * Find a user by their personKey.
 * @param users the list of users to search in
 * @param personKey the personKey to search for
 * @returns the user with the matching personKey or undefined if not found
 */
export function findUserByPersonKey(users: UserModel[], personKey: string | undefined): UserModel | undefined {
  if (!personKey || personKey.length === 0) {
    warn('search.util.findUserByPersonKey: personKey is mandatory.');
    return undefined;
  }
  return users.find((user: UserModel) => user.personKey === personKey);
}

/**
 * Retrieve the first item in a list of items that has the given key.
 * This is typically used in services read() function to find a model object by its key. 
 * The items$ parameter is then taken from the list() function of the service to use the cached data.
 * The key is the Firestore Document ID.
 * @param items$ the list of items to search in
 * @param key the key to search for
 * @returns the first item that has the given key or undefined if no such item exists
 */
export function findByField<T>(items$: Observable<T[]>, fieldName: string | undefined | null, value: string | undefined | null): Observable<T | undefined> {
  if (!fieldName || fieldName.length === 0) {
    warn('search.util.findByField: invalid fieldName>');
    return of(undefined);
  }
  return items$.pipe(
    map((items: T[]) => {
      return items.find((item: T) => item[fieldName as keyof T] === value);
    }));
}

/**
 * Retrieve all items in a list of items that have the given key.
 * The items$ parameter is typically taken from the list() function of the service to use the cached data.
 * The key is the Firestore Document ID.
 * @param items$ the list of items to search in
 * @param key the key to search for
 * @returns the first item that has the given key or undefined if no such item exists
 */
export function findAllByField<T>(items$: Observable<T[]>, fieldName: string | undefined | null, value: string | undefined | null): Observable<T[]> {
  if (!fieldName || fieldName.length === 0) {
    warn('search.util.findAllByField: invalid fieldName>');
    return of([]);
  }
  return items$.pipe(
    map((items: T[]) => {
      // Filtert die Elemente basierend auf dem Feld und dem Wert
      return items.filter((item) => item[fieldName as keyof T] === value);
    })
  );
}