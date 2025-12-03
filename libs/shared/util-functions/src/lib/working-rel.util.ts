import { Firestore } from 'firebase-admin/firestore';
import { searchData } from './search.util';
import { WorkrelCollection, WorkrelModel } from '@bk2/shared-models';

/**
 * Retrieves all workingRels for a given person (subject).
 * @param firestore
 * @param subjectId the id of the person to retrieve its workingRels for
 * @returns an array of personalrels for the given person (as subject).
 */
export async function getAllWorkrelsOfSubject(firestore: Firestore, subjectId: string): Promise<WorkrelModel[]> {
  const query = [{ key: 'subjectKey', operator: '==', value: subjectId }];
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
