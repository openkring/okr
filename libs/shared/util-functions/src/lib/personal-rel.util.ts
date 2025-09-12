import { PersonalRelCollection, PersonalRelModel } from '@bk2/shared-models';
import { Firestore } from 'firebase-admin/firestore';
import { searchData } from './search.util';

/**
 * Retrieves all personalRels where a given person is subject.
 * @param firestore
 * @param subjectId the id of the person to retrieve its personalRels for
 * @returns an array of personalrels for the given person (as subject).
 */
export async function getAllPersonalRelsOfSubject(firestore: Firestore, subjectId: string): Promise<PersonalRelModel[]> {
  const _query = [{ key: 'subjectKey', operator: '==', value: subjectId }];
  return await searchData<PersonalRelModel>(firestore, PersonalRelCollection, _query, 'objectLastName', 'asc');
}

/**
 * Retrieves all personalRels where a given person is object.
 * @param firestore
 * @param objectId the id of the organization to retrieve its members for
 * @returns an array of personalRels for the given person (as object).
 */
export async function getAllPersonalRelsOfObject(firestore: Firestore, objectId: string): Promise<PersonalRelModel[]> {
  const _query = [{ key: 'objectKey', operator: '==', value: objectId }];
  return await searchData<PersonalRelModel>(firestore, PersonalRelCollection, _query, 'subjectLastName', 'asc');
}
