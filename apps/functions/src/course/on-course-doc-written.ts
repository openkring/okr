import { logger } from 'firebase-functions/v2';
import type { Change } from 'firebase-functions/v2';
import { onDocumentWritten, type DocumentSnapshot, type FirestoreEvent } from 'firebase-functions/v2/firestore';

import { adminKeysNeedUpdate } from '../group/group-admin-keys';
import { courseResponsibleKeys, courseTrainerKeys } from './course-keys';

export type CourseWrittenEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, { courseId: string }>;

/**
 * Keeps `courses/{id}.trainerKeys` and `.responsibleKeys` equal to the keys of `trainers[]` /
 * `responsiblePersons[]` so firestore.rules can test course rights with `in`. The rules read the STORED
 * mirrors and forbid every client write to them, so this is the only writer. Writes only when a mirror
 * differs, so its own update ends the loop after one extra invocation. A deleted course is a no-op.
 */
export async function handleCourseKeys(event: CourseWrittenEvent): Promise<void> {
  const after = event.data?.after;
  if (!after?.exists) return;
  const data = after.data() ?? {};
  const trainerKeys = courseTrainerKeys(data);
  const responsibleKeys = courseResponsibleKeys(data);
  if (!adminKeysNeedUpdate(data['trainerKeys'], trainerKeys) && !adminKeysNeedUpdate(data['responsibleKeys'], responsibleKeys)) return;
  await after.ref.update({ trainerKeys, responsibleKeys });
  logger.info('onCourseDocWritten: key mirrors synced', {
    courseId: event.params.courseId,
    trainers: trainerKeys.length,
    responsibles: responsibleKeys.length,
  });
}

export const onCourseDocWritten = onDocumentWritten({ document: 'courses/{courseId}', region: 'europe-west6' }, async (event) => {
  await handleCourseKeys(event);
});
