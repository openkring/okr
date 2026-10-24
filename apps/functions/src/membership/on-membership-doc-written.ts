import { onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';

import { runHandlers, type NamedHandler } from '../_fanout';
import { handleMembershipAccountSync } from '../auth/account-sync';
import { handleMembershipExit } from '../member-fee/exit-settlement.trigger';
import { handleMembershipMatrixSync } from '../matrix-simple/membership-sync';
import { handlePinboardSourceMembership } from '../matrix-simple/pinboard';
import { matrixAdminToken } from '../matrix-simple/shared';
import type { MembershipWrittenEvent } from './membership-written-event';

/**
 * The four former `memberships/{membershipId}` triggers, one handler each. Every handler gets the same
 * event and keeps its own early returns and error handling; runHandlers isolates a throwing one.
 */
export const MEMBERSHIP_HANDLERS: NamedHandler<MembershipWrittenEvent>[] = [
  { name: 'matrixSync', run: handleMembershipMatrixSync },
  { name: 'pinboardSource', run: handlePinboardSourceMembership },
  { name: 'accountSync', run: handleMembershipAccountSync },
  { name: 'exitSettlement', run: handleMembershipExit },
];

export const onMembershipDocWritten = onDocumentWrittenWithAuthContext(
  { document: 'memberships/{membershipId}', region: 'europe-west6', secrets: [matrixAdminToken] },
  async (event) => {
    await runHandlers('onMembershipDocWritten', event, MEMBERSHIP_HANDLERS);
  },
);
