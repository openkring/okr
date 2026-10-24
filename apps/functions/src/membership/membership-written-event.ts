import type { Change } from 'firebase-functions/v2';
import type { DocumentSnapshot, FirestoreAuthEvent } from 'firebase-functions/v2/firestore';

/**
 * Event of the single `memberships/{membershipId}` onDocumentWrittenWithAuthContext trigger, handed
 * unchanged to every handler. A superset of the plain Firestore event: only the exit handler reads authType/authId.
 */
export type MembershipWrittenEvent = FirestoreAuthEvent<Change<DocumentSnapshot> | undefined, { membershipId: string }>;
