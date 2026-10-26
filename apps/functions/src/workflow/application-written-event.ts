import type { Change } from 'firebase-functions/v2';
import type { DocumentSnapshot, FirestoreEvent } from 'firebase-functions/v2/firestore';

/** Event of the single `applications/{id}` onDocumentWritten trigger, handed unchanged to every handler. */
export type ApplicationWrittenEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, { id: string }>;
