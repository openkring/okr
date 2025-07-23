import { inject, PLATFORM_ID } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { Firestore, OrderByDirection, QueryConstraint, WhereFilterOp, collection, orderBy, query, where } from 'firebase/firestore';
import { collectionData } from 'rxfire/firestore';
import { isPlatformBrowser } from '@angular/common';

import { AllCategories, BkModel, DbQuery, TagCollection, TagModel, UserModel } from '@bk2/shared/models';
import { getRangeQuery, getSystemQuery } from './query.util';
import { die, warn } from './log.util';

/*----------------------- SEARCH ----------------------------------------------*/
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
export function searchData<T>(firestore: Firestore, collectionName: string, dbQuery: DbQuery[], orderByParam = 'name', sortOrderParam = 'asc', platformId: Object = inject(PLATFORM_ID)): Observable<T[]> {
  if (isPlatformBrowser(platformId)) {
    const _queries = getQuery(dbQuery, orderByParam, sortOrderParam);
    const _collectionRef = collection(firestore, collectionName);
    const _queryRef = query(_collectionRef, ..._queries);

    return collectionData(_queryRef, { idField: 'bkey' }) as Observable<T[]>;
  }
  return of([]);
}

export function getTags(firestore: Firestore, tagModel: number): Observable<string> {
  const _collectionRef = collection(firestore, TagCollection);
  const _queryRef = query(_collectionRef, orderBy('tagModel', 'asc'));
  const _allTags$ = collectionData(_queryRef, { idField: 'bkey' }) as Observable<TagModel[]>;
  const _tagModel$ = _allTags$.pipe(
    map((tags: TagModel[]) => {
      return tags
      .filter((tag: TagModel) => tag.tagModel === tagModel + '')[0];
    })
  );
  return _tagModel$.pipe(
    map((tag: TagModel) => tag.tags)
  );
}

export function getQuery(dbQuery: DbQuery[], orderByParam = 'name', sortOrderParam = 'asc'): QueryConstraint[] {
  const _queries: QueryConstraint[] = [];
  for (const _dbQuery of dbQuery) {
    _queries.push(where(_dbQuery.key, _dbQuery.operator as WhereFilterOp, _dbQuery.value));
  }
  _queries.push(orderBy(orderByParam, sortOrderParam as OrderByDirection));
  return _queries;
}

/* export function sortByField<T>(models$: Observable<T[]>, fieldName: string, sortOrder: 'asc' | 'desc'): Observable<T[]> {
  return models$.pipe(map((models: T[]) => {
    return models.sort((a, b) => {
      if (sortOrder === 'asc') return a[fieldName].localeCompare(b[fieldName]);
      return b[fieldName].localeCompare(a[fieldName]);
    });
  }));
}
 */

/**
 * Search by date range. The match is exclusive the given border dates.
 * @param firestore a handle to the Firestore database
 * @param fieldName the name of the field to search for (e.g. dateOfBirth)
 * @param startDate the start of the range, e.g. 20100101
 * @param endDate the end of the range, e.g. 99991231
 */
export function searchDateRange<T>(firestore: Firestore, collectionName: string, key: string,
  startDate = '00000000', endDate = '99999999', isArchived = false, orderBy = 'name', sortOrder = 'asc'): Observable<T[]> {
  return searchData<T>(firestore, collectionName, getRangeQuery(key, startDate, endDate, isArchived), orderBy, sortOrder);
}

export function searchByYear<T>(firestore: Firestore, collectionName: string, key: string, year: string,
  isArchived = false, orderBy = 'name', sortOrder = 'asc'): Observable<T[]> {
  if (year.length !== 4 || typeof year !== 'number') die(`BaseModelUtil.searchByYear: invalid year format <${year}> (should be nnnn)`);

  const _startDate = year + '0000';
  const _endDate = year + '1232';
  return searchDateRange<T>(firestore, collectionName, key, _startDate, _endDate, isArchived, orderBy, sortOrder);
}


export function searchByTag<T>(firestore: Firestore, tenantId: string, collectionName: string, tagName: string, orderBy = 'name', sortOrder = 'asc'): Observable<T[]> {
  const _dbQuery = getSystemQuery(tenantId);
  _dbQuery.push({ key: 'tags', operator: 'array-contains', value: tagName });
  return searchData<T>(firestore, collectionName, _dbQuery, orderBy, sortOrder);
}

/**
 * Find all model objects that are part of the given category.
 * @param categoryId the category id to search for
 */
export function searchByCategory<T>(firestore: Firestore, collectionName: string, tenantId: string, categoryId: number, categoryKey = 'category', orderBy = 'name', sortOrder = 'asc' as OrderByDirection): Observable<T[]> {
  const _dbQuery = getSystemQuery(tenantId);
  if (categoryId !== AllCategories) 
    _dbQuery.push({ key: categoryKey, operator: '==', value: categoryId });
  return searchData<T>(firestore, collectionName, _dbQuery, orderBy, sortOrder);
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