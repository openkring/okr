import { Firestore } from 'firebase-admin/firestore';
import { searchData } from './search.util';
import { WorkingRelCollection, WorkingRelModel } from '@bk2/shared/models';

/**
 * Retrieves all workingRels for a given person (subject).
 * @param firestore 
 * @param subjectId the id of the person to retrieve its workingRels for
 * @returns an array of personalrels for the given person (as subject).
 */
export async function getAllWorkingRelsOfSubject(firestore: Firestore, subjectId: string): Promise<WorkingRelModel[]> {
  const _query = [{ key: 'subjectKey', operator: '==', value: subjectId }];
  return await searchData<WorkingRelModel>(firestore, WorkingRelCollection, _query);
}

/**
 * Retrieves all workingRels for a given org (object).
 * @param firestore 
 * @param objectId the id of the organization to retrieve its workingRels for
 * @returns an array of workingRels for the given org (as object).
 */
export async function getAllWorkingRelsOfObject(firestore: Firestore, objectId: string): Promise<WorkingRelModel[]> {
  const _query = [{ key: 'objectKey', operator: '==', value: objectId }];
  return await searchData<WorkingRelModel>(firestore, WorkingRelCollection, _query);
}