import type { Change } from 'firebase-functions/v2';
import type { DocumentSnapshot, FirestoreEvent } from 'firebase-functions/v2/firestore';

/** Event of the single `tasks/{taskId}` onDocumentWritten trigger, handed unchanged to every handler. */
export type TaskWrittenEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, { taskId: string }>;
