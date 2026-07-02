import { Firestore } from 'firebase-admin/firestore';
import { searchData } from './search.util';
import { WorkrelCollection, WorkrelModel } from '@bk2/shared-models';

/**
 * Retrieves all workingRels for a given subject (person or org).
 *
 * `subjectModelType` MUST be passed to disambiguate the polymorphic subject key:
 * `subjectKey` can point to a person or an org, which live in separate collections and
 * may share a key. Without the type filter a person write could clobber an org's
 * workingRels and vice versa.
 * @param firestore
 * @param subjectId the id of the person/org to retrieve its workingRels for
 * @param subjectModelType filter to workingRels whose subject is a 'person' or an 'org'
 * @returns an array of workingRels for the given subject.
 */
export async function getAllWorkrelsOfSubject(firestore: Firestore, subjectId: string, subjectModelType: 'person' | 'org'): Promise<WorkrelModel[]> {
  const query = [
    { key: 'subjectKey', operator: '==', value: subjectId },
    { key: 'subjectModelType', operator: '==', value: subjectModelType },
  ];
  return await searchData<WorkrelModel>(firestore, WorkrelCollection, query, 'objectName', 'asc');
}

/**
 * Retrieves all workingRels for a given org (object).
 * @param firestore
 * @param objectId the id of the organization to retrieve its workingRels for
 * @returns an array of workingRels for the given org (as object).
 */
export async function getAllWorkrelsOfObject(firestore: Firestore, objectId: string): Promise<WorkrelModel[]> {
  const query = [{ key: 'objectKey', operator: '==', value: objectId }];
  return await searchData<WorkrelModel>(firestore, WorkrelCollection, query, 'subjectName2', 'asc');
}
