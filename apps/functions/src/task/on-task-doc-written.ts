import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import { runHandlers, type NamedHandler } from '../_fanout';
import { handleExpenseTaskWritten } from '../expense';
import { handleTaskCompleted } from '../workflow/emit';
import { handleTaskWritten } from './index';
import type { TaskWrittenEvent } from './task-written-event';

/**
 * The three former `tasks/{taskId}` triggers, one handler each. Every handler gets the same event
 * and keeps its own early returns; handleTaskCompleted ignores create and delete itself (it was an
 * onDocumentUpdated trigger). runHandlers isolates a throwing one.
 */
export const TASK_HANDLERS: NamedHandler<TaskWrittenEvent>[] = [
  { name: 'notify', run: handleTaskWritten },
  { name: 'expense', run: handleExpenseTaskWritten },
  { name: 'workflowCompleted', run: handleTaskCompleted },
];

export const onTaskDocWritten = onDocumentWritten(
  { document: 'tasks/{taskId}', region: 'europe-west6' },
  async (event) => {
    await runHandlers('onTaskDocWritten', event, TASK_HANDLERS);
  },
);
