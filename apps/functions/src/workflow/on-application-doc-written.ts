import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import { runHandlers, type NamedHandler } from '../_fanout';
import type { ApplicationWrittenEvent } from './application-written-event';
import { handleApplicationCreated, handleApplicationStateChanged } from './emit';

/**
 * The two former `applications/{id}` triggers, one handler each. Every handler gets the same event
 * and keeps its own early returns; handleApplicationCreated ignores update and delete itself (it was
 * an onDocumentCreated trigger). runHandlers isolates a throwing one.
 */
export const APPLICATION_HANDLERS: NamedHandler<ApplicationWrittenEvent>[] = [
  { name: 'created', run: handleApplicationCreated },
  { name: 'stateChanged', run: handleApplicationStateChanged },
];

export const onApplicationDocWritten = onDocumentWritten(
  { document: 'applications/{id}', region: 'europe-west6' },
  async (event) => {
    await runHandlers('onApplicationDocWritten', event, APPLICATION_HANDLERS);
  },
);
