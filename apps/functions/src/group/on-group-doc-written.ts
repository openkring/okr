import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import { runHandlers, type NamedHandler } from '../_fanout';
import { handleGroupChatCleanup } from '../matrix-simple/group-chat-cleanup';
import { handleGroupChatMode } from '../matrix-simple/chat-mode-sync';
import { handleGroupName } from '../matrix-simple/group-name-sync';
import { handlePinboard } from '../matrix-simple/pinboard';
import { handleGroupPostPolicy } from '../matrix-simple/post-policy-sync';
import { matrixAdminToken } from '../matrix-simple/shared';
import { handleGroupChange } from '../replication';
import { handleGroupAdminKeys } from './on-group-written';
import type { GroupWrittenEvent } from './group-written-event';

/**
 * The seven former `groups/{groupId}` triggers, one handler each. Every handler gets the same event
 * and keeps its own early returns and error handling; runHandlers isolates a throwing one.
 */
export const GROUP_HANDLERS: NamedHandler<GroupWrittenEvent>[] = [
  { name: 'replication', run: handleGroupChange },
  { name: 'adminKeys', run: handleGroupAdminKeys },
  { name: 'name', run: handleGroupName },
  { name: 'postPolicy', run: handleGroupPostPolicy },
  { name: 'chatMode', run: handleGroupChatMode },
  { name: 'chatCleanup', run: handleGroupChatCleanup },
  { name: 'pinboard', run: handlePinboard },
];

export const onGroupDocWritten = onDocumentWritten(
  { document: 'groups/{groupId}', region: 'europe-west6', secrets: [matrixAdminToken] },
  async (event) => {
    await runHandlers('onGroupDocWritten', event, GROUP_HANDLERS);
  },
);
