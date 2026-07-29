import { describe, expect, it, vi } from 'vitest';
// vi.mock below is hoisted above this import by vitest, so `firestoreFetcher` sees the stub.
import { firestoreFetcher } from './gather';
import type { SubjectCtx, SubjectDataEntry } from './types';

/**
 * Fix round 1, finding 2 — the highest-consequence line in this file
 * (`resolveDocs(entry, ctx)` instead of `entry.find(ctx).get()`) had no test. A future
 * edit reverting it would compile cleanly and pass every other spec here, and would
 * silently pull other members' documents into a person's export — exactly the failure
 * the Task A2 contract update warned about (subject-data-map.ts's `resolveDocs` doc
 * comment: "Bypassing it compiles fine and silently exports other members' records").
 *
 * This stubs `./subject-data-map` so `firestoreFetcher` is proven to call `resolveDocs`
 * and never touch `entry.find` directly.
 */
// vi.hoisted so the mock factory below (itself hoisted above this file's imports) can
// reference it without a "Cannot access before initialization" TDZ error.
const resolveDocsMock = vi.hoisted(() =>
  vi.fn(async () => [{ id: 'd1', data: () => ({ name: 'from resolveDocs' }) }]),
);

vi.mock('./subject-data-map', () => ({
  resolveDocs: resolveDocsMock,
  SUBJECT_DATA_MAP: [],
}));

const ctx: SubjectCtx = { uid: 'u1', personKey: 'p1', parentKey: 'person.p1', tenantId: 'scs', email: 'ann@scs.ch' };

describe('firestoreFetcher', () => {
  it('fetches via resolveDocs and never calls entry.find directly', async () => {
    const find = vi.fn(() => {
      throw new Error('entry.find(ctx).get() was called directly — must go through resolveDocs');
    });
    const entry = {
      collection: 'x',
      dataClass: 'content',
      find: find as unknown as SubjectDataEntry['find'],
      tenantScope: 'tenantsArray',
      onExport: 'full',
      onErasure: 'retain',
      retention: { months: 12, legalBasis: 'test' },
    } as SubjectDataEntry;

    const docs = await firestoreFetcher(entry, ctx);

    expect(resolveDocsMock).toHaveBeenCalledWith(entry, ctx);
    expect(find).not.toHaveBeenCalled();
    expect(docs).toEqual([{ okey: 'd1', name: 'from resolveDocs' }]);
  });
});
