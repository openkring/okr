import { describe, expect, it } from 'vitest';
import { JournalBookModel } from '@okr/shared-models';

import { BookEditWriter, JournalBookEdits } from './journal-book-edits';

interface Call { op: string; args: unknown[]; resolve: () => void; reject: (e: unknown) => void }

/** A writer whose writes stay in flight until the test resolves them; `stored` is what reached "Firestore". */
function fakeWriter() {
  const calls: Call[] = [];
  const stored = { hidden: new Set<string>(), albums: {} as Record<string, unknown>, footprints: {} as Record<string, unknown> };
  const record = (op: string, args: unknown[], apply: () => void) => new Promise<void>((resolve, reject) => {
    calls.push({ op, args, resolve: () => { apply(); resolve(); }, reject });
  });
  const writer: BookEditWriter = {
    update: (_j, _t, patch) => record('update', [patch], () => {
      Object.assign(stored.albums, patch.albums ?? {});
      Object.assign(stored.footprints, patch.footprints ?? {});
    }),
    removeAlbum: (_j, _t, key) => record('removeAlbum', [key], () => { delete stored.albums[key]; }),
    setHidden: (_j, _t, key, hidden) => record('setHidden', [key, hidden], () => { if (hidden) stored.hidden.add(key); else stored.hidden.delete(key); }),
    setFitWhole: (_j, _t, key, fit) => record('setFitWhole', [key, fit], () => undefined),
  };
  return { writer, calls, stored };
}

const target = () => ({ journalKey: 'j1', tenantId: 'bkg', personKey: 'bruno' });
const book = (over: Partial<JournalBookModel> = {}): JournalBookModel => ({ ...new JournalBookModel(), ...over });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('JournalBookEdits', () => {
  it('hide → show → hide while writes are in flight: the last action wins, in the overlay and in the store', async () => {
    const { writer, calls, stored } = fakeWriter();
    const edits = new JournalBookEdits(writer, target, () => undefined, 60_000);

    edits.setHidden('i1', true);
    const a = edits.flush(); // A: hide in flight
    edits.setHidden('i1', false);
    const b = edits.flush(); // B: show in flight
    edits.setHidden('i1', true); // pending again, not yet sent

    calls[0].resolve(); // A acks
    await a;
    expect(edits.apply(book()).hiddenImageKeys).toEqual(['i1']); // the newer «hide» stays in the overlay
    calls[1].resolve(); // B lands «show»
    await b;
    expect(stored.hidden.has('i1')).toBe(false);
    expect(edits.apply(book({ hiddenImageKeys: [...stored.hidden] })).hiddenImageKeys).toEqual(['i1']);

    const c = edits.flush(); // the last «hide» is written
    expect(calls.map((x) => x.args)).toEqual([['i1', true], ['i1', false], ['i1', true]]);
    calls[2].resolve();
    await c;
    expect(stored.hidden.has('i1')).toBe(true);
    expect(edits.apply(book({ hiddenImageKeys: [...stored.hidden] })).hiddenImageKeys).toEqual(['i1']);
  });

  it('album pages and comments go through update as single entries, reset through removeAlbum', async () => {
    const { writer, calls, stored } = fakeWriter();
    const edits = new JournalBookEdits(writer, target, () => undefined, 60_000);
    const pages = [{ template: 'full' as const, imageKeys: ['i1'] }];

    edits.setAlbum('s1', pages);
    edits.setComments('f1', { showComments: true, commentKeys: ['c1'] });
    expect(edits.apply(book()).albums).toEqual({ s1: { pages } });
    const a = edits.flush();
    expect(calls[0]).toMatchObject({ op: 'update', args: [{ albums: { s1: { pages } }, footprints: { f1: { showComments: true, commentKeys: ['c1'] } } }] });

    edits.resetAlbum('s1'); // changed again while the update is in flight
    calls[0].resolve();
    await a;
    expect(edits.apply(book({ albums: stored.albums as JournalBookModel['albums'] })).albums).toEqual({}); // the reset stays on top
    const b = edits.flush();
    expect(calls[1]).toMatchObject({ op: 'removeAlbum', args: ['s1'] });
    calls[1].resolve();
    await b;
    expect(stored.albums).toEqual({});
    expect(stored.footprints).toEqual({ f1: { showComments: true, commentKeys: ['c1'] } });
  });

  it('a failed write is reported and leaves the overlay; the debounce writes on its own', async () => {
    const { writer, calls } = fakeWriter();
    const errors: unknown[] = [];
    const edits = new JournalBookEdits(writer, target, (e) => errors.push(e), 0);
    edits.setWhole('i2', true);
    await tick();
    expect(calls).toHaveLength(1);
    expect(edits.saving()).toBe(true);
    calls[0].reject(new Error('offline'));
    await tick();
    expect(errors).toHaveLength(1);
    expect(edits.apply(book()).fitWhole).toEqual([]);
    expect(edits.saving()).toBe(false);
  });
});
