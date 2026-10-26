import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  fns: {} as Record<string, ReturnType<typeof vi.fn>>,
  runWorkflow: vi.fn(),
}));
const names = ['handleTaskWritten', 'handleExpenseTaskWritten'];

vi.mock('firebase-functions/v2/firestore', () => ({
  // the wrapped function is returned as-is so the spec can call it directly
  onDocumentWritten: (_opts: unknown, fn: unknown) => fn,
  onDocumentCreated: (_opts: unknown, fn: unknown) => fn,
  onDocumentUpdated: (_opts: unknown, fn: unknown) => fn,
}));
vi.mock('firebase-functions/v2', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('./index', () => ({ handleTaskWritten: (e: unknown) => calls.fns['handleTaskWritten'](e) }));
vi.mock('../expense', () => ({ handleExpenseTaskWritten: (e: unknown) => calls.fns['handleExpenseTaskWritten'](e) }));
// the real handleTaskCompleted runs; only its dependency (the workflow engine) is mocked
vi.mock('../workflow/index', () => ({ runWorkflow: (a: unknown) => calls.runWorkflow(a) }));
vi.mock('../workflow', () => ({ runWorkflow: (a: unknown) => calls.runWorkflow(a) }));

import { handleTaskCompleted } from '../workflow/emit';
import type { TaskWrittenEvent } from './task-written-event';
import { TASK_HANDLERS, onTaskDocWritten } from './on-task-doc-written';

const snap = (data: Record<string, unknown> | undefined) => ({ data: () => data, exists: data !== undefined });
const ev = (before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined) =>
  ({ params: { taskId: 't1' }, data: { before: snap(before), after: snap(after) } }) as unknown as TaskWrittenEvent;

describe('tasks trigger', () => {
  beforeEach(() => {
    for (const n of names) calls.fns[n] = vi.fn().mockResolvedValue(undefined);
    calls.runWorkflow.mockReset().mockResolvedValue(undefined);
  });

  it('lists exactly the three handlers in order', () => {
    expect(TASK_HANDLERS.map((h) => h.name)).toEqual(['notify', 'expense', 'workflowCompleted']);
  });

  it('passes the same event object to every handler', async () => {
    const event = ev({ state: 'open' }, { state: 'open', tenants: [] });
    await (onTaskDocWritten as unknown as (e: unknown) => Promise<void>)(event);
    for (const n of names) {
      expect(calls.fns[n]).toHaveBeenCalledTimes(1);
      expect(calls.fns[n].mock.calls[0][0]).toBe(event);
    }
  });

  it('lets the other handlers run when one throws, and does not reject', async () => {
    calls.fns['handleTaskWritten'].mockRejectedValue(new Error('boom'));
    await expect((onTaskDocWritten as unknown as (e: unknown) => Promise<void>)(ev({}, {}))).resolves.toBeUndefined();
    for (const n of names) expect(calls.fns[n]).toHaveBeenCalledTimes(1);
  });

  it('onTaskCompleted ignores create and delete', async () => {
    const done = { state: 'done', name: 'x', tenants: ['scs'], completionDate: '20260101' };
    await handleTaskCompleted(ev(undefined, done)); // create: no before
    await handleTaskCompleted(ev({ ...done, state: 'open' }, undefined)); // delete: no after
    await handleTaskCompleted({ params: { taskId: 't1' }, data: undefined } as unknown as TaskWrittenEvent);
    expect(calls.runWorkflow).not.toHaveBeenCalled();

    await handleTaskCompleted(ev({ ...done, state: 'open' }, done)); // not-done -> done
    expect(calls.runWorkflow).toHaveBeenCalledTimes(1);
    expect(calls.runWorkflow.mock.calls[0][0]).toMatchObject({ event: 'task.completed', tenantId: 'scs', relatedKey: 'task.t1' });

    calls.runWorkflow.mockClear();
    await handleTaskCompleted(ev(done, done)); // already done
    expect(calls.runWorkflow).not.toHaveBeenCalled();
  });
});
