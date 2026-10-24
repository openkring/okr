import type { Change } from 'firebase-functions/v2';
import type { DocumentSnapshot, FirestoreEvent } from 'firebase-functions/v2/firestore';

/** Event of the single `groups/{groupId}` onDocumentWritten trigger, handed unchanged to every handler. */
export type GroupWrittenEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, { groupId: string }>;
