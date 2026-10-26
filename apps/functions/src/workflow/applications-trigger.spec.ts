import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ runWorkflow: vi.fn() }));

vi.mock('firebase-functions/v2/firestore', () => ({
  // the wrapped function is returned as-is so the spec can call it directly
  onDocumentWritten: (_opts: unknown, fn: unknown) => fn,
  onDocumentCreated: (_opts: unknown, fn: unknown) => fn,
  onDocumentUpdated: (_opts: unknown, fn: unknown) => fn,
}));
vi.mock('firebase-functions/v2', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
// the real handlers run; only their dependency (the workflow engine) is mocked
vi.mock('./index', () => ({ runWorkflow: (a: unknown) => calls.runWorkflow(a) }));

import type { ApplicationWrittenEvent } from './application-written-event';
import { handleApplicationCreated, handleApplicationStateChanged, onReservationCreated } from './emit';
import { APPLICATION_HANDLERS, onApplicationDocWritten } from './on-application-doc-written';

const snap = (data: Record<string, unknown> | undefined) => ({ data: () => data, exists: data !== undefined });
const ev = (before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined) =>
  ({ params: { id: 'a1' }, data: { before: snap(before), after: snap(after) } }) as unknown as ApplicationWrittenEvent;

const app = { state: 'new', firstName: 'Ada', lastName: 'Lovelace', applicationAs: 'member', tenants: ['scs', 'kring'] };

describe('applications trigger', () => {
  beforeEach(() => {
    calls.runWorkflow.mockReset().mockResolvedValue(undefined);
  });

  it('lists the two handlers in order', () => {
    expect(APPLICATION_HANDLERS.map((h) => h.name)).toEqual(['created', 'stateChanged']);
  });

  it('created handler ignores update and delete', async () => {
    await handleApplicationCreated(ev(app, { ...app, state: 'accepted' })); // update
    await handleApplicationCreated(ev(app, undefined)); // delete
    await handleApplicationCreated({ params: { id: 'a1' }, data: undefined } as unknown as ApplicationWrittenEvent);
    expect(calls.runWorkflow).not.toHaveBeenCalled();
  });

  it('created emits once per tenant on a create', async () => {
    await handleApplicationCreated(ev(undefined, app));
    expect(calls.runWorkflow).toHaveBeenCalledTimes(2);
    expect(calls.runWorkflow.mock.calls.map((c) => c[0].tenantId)).toEqual(['scs', 'kring']);
    expect(calls.runWorkflow.mock.calls[0][0]).toMatchObject({ event: 'application.created', relatedKey: 'application.a1' });
  });

  it('stateChanged emits on a state change and not on another update', async () => {
    await handleApplicationStateChanged(ev(app, { ...app, lastName: 'King' }));
    await handleApplicationStateChanged(ev(undefined, app));
    await handleApplicationStateChanged(ev(app, undefined));
    expect(calls.runWorkflow).not.toHaveBeenCalled();

    await handleApplicationStateChanged(ev(app, { ...app, state: 'accepted' }));
    expect(calls.runWorkflow).toHaveBeenCalledTimes(2);
    expect(calls.runWorkflow.mock.calls[0][0]).toMatchObject({ event: 'application.stateChanged', relatedKey: 'application.a1' });
  });

  it('passes the same event to both handlers (create emits only created, state change only stateChanged)', async () => {
    const trigger = onApplicationDocWritten as unknown as (e: unknown) => Promise<void>;
    await trigger(ev(undefined, app));
    expect(calls.runWorkflow.mock.calls.map((c) => c[0].event)).toEqual(['application.created', 'application.created']);
    calls.runWorkflow.mockClear();
    await trigger(ev(app, { ...app, state: 'accepted' }));
    expect(calls.runWorkflow.mock.calls.map((c) => c[0].event)).toEqual(['application.stateChanged', 'application.stateChanged']);
  });

  it('keeps onReservationCreated exported', () => {
    expect(typeof onReservationCreated).toBe('function');
  });
});
