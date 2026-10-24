import { describe, expect, it } from 'vitest';
import { JournalChange } from '@okr/shared-models';
import { formatHlc } from './journal-hlc.util';
import { materialize } from './journal-merge.util';
import { footprintsOf, imagesOf, journalsOf, lastBlockOrder, transportOf, weatherLine, weatherOf } from './journal-view.util';

let n = 0;
function rec(p: Pick<JournalChange, 'entity' | 'entityKey' | 'op'> & Partial<JournalChange>): JournalChange {
  n += 1;
  return {
    id: `r${n}`, journalKey: 'j1', deviceId: 'dev-a', seq: n,
    hlc: formatHlc({ wall: 1000 + n, counter: 0, deviceId: 'dev-a' }), authorKey: 'bruno', fields: {}, ...p,
  };
}

describe('journal view', () => {
  it('journalsOf lists journals by start date', () => {
    const state = materialize([
      rec({ entity: 'journal', entityKey: 'j2', op: 'create', fields: { title: 'Später', startDate: '20270301' } }),
      rec({ entity: 'journal', entityKey: 'j1', op: 'create', fields: { title: 'Antarktis 2027', startDate: '20270108' } }),
    ]);
    expect(journalsOf(state).map((j) => j.key)).toEqual(['j1', 'j2']);
    expect(journalsOf(state)[0]).toEqual({ key: 'j1', title: 'Antarktis 2027', subTitle: '', startDate: '20270108', endDate: '' });
  });

  it('footprintsOf returns only the journal\'s footprints, sorted by date and time', () => {
    const state = materialize([
      rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'Neko', date: '20270114', time: '1500' } }),
      rec({ entity: 'footprint', entityKey: 'f2', op: 'create', fields: { journalKey: 'j1', title: 'Deception', date: '20270113', time: '0900' } }),
      rec({ entity: 'footprint', entityKey: 'f3', op: 'create', fields: { journalKey: 'j2', title: 'Other', date: '20270101' } }),
      rec({ entity: 'footprint', entityKey: 'f4', op: 'create', fields: { journalKey: 'j1', title: 'Gone', date: '20270110' } }),
      rec({ entity: 'footprint', entityKey: 'f4', op: 'archive' }),
    ]);
    expect(footprintsOf(state, 'j1').map((f) => f.key)).toEqual(['f2', 'f1']);
    expect(footprintsOf(state, 'j1')[0].publishState).toBe('draft');
  });

  it('blocks are ordered by order and skip archived ones', () => {
    const state = materialize([
      rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'Neko' } }),
      rec({ entity: 'section', entityKey: 'sV', op: 'create', fields: { footprintKey: 'f1', kind: 'text', html: '<p>v</p>', order: 'V' } }),
      rec({ entity: 'section', entityKey: 'sG', op: 'create', fields: { footprintKey: 'f1', kind: 'photos', imageKeys: ['i1'], order: 'G' } }),
      rec({ entity: 'section', entityKey: 'sX', op: 'create', fields: { footprintKey: 'f1', kind: 'text', html: '<p>x</p>', order: 'X' } }),
      rec({ entity: 'section', entityKey: 'sX', op: 'archive' }),
    ]);
    const [footprint] = footprintsOf(state, 'j1');
    expect(footprint.blocks.map((b) => b.key)).toEqual(['sG', 'sV']);
    expect(footprint.blocks[0]).toEqual({ key: 'sG', kind: 'photos', authorKey: 'bruno', order: 'G', imageKeys: ['i1'] });
    expect(footprint.blocks[1]).toEqual({ key: 'sV', kind: 'text', authorKey: 'bruno', order: 'V', html: '<p>v</p>' });
    expect(lastBlockOrder(footprint)).toBe('V');
  });

  it('photo block lists only imported images', () => {
    const state = materialize([
      rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'Neko' } }),
      rec({ entity: 'image', entityKey: 'i1', op: 'create', fields: { journalKey: 'j1', takenAt: '2027-01-14T09:00:00', latitude: -64.83, longitude: -62.53, width: 2048, height: 1536, path2048: 'journals/j1/a-2048.jpg', path400: 'journals/j1/a-400.jpg', localIdentifier: 'L1' } }),
      rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', kind: 'photos', imageKeys: ['i1', 'i2'], order: 'V' } }),
    ]);
    expect(footprintsOf(state, 'j1')[0].blocks[0].imageKeys).toEqual(['i1', 'i2']);
    const images = imagesOf(state, 'j1');
    expect([...images.keys()]).toEqual(['i1']);
    expect(images.get('i1')?.path400).toBe('journals/j1/a-400.jpg');
    expect(images.get('i1')?.authorKey).toBe('bruno');
  });

  it('footprint without position takes none', () => {
    const state = materialize([
      rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'Neko' } }),
    ]);
    const [footprint] = footprintsOf(state, 'j1');
    expect(footprint.latitude).toBeUndefined();
    expect(footprint.longitude).toBeUndefined();
    expect(lastBlockOrder(footprint)).toBeUndefined();
  });
});

describe('hasOthersBlocks', () => {
  const fp = (blocks: { authorKey: string }[]) =>
    ({ key: 'f', journalKey: 'j1', title: '', placeName: '', date: '', time: '', publishState: 'draft' as const,
      blocks: blocks.map((b, i) => ({ key: `b${i}`, kind: 'text' as const, order: 'V', ...b })) });

  it('a footprint with only own blocks may be deleted', async () => {
    const { hasOthersBlocks } = await import('./journal-view.util');
    expect(hasOthersBlocks([fp([{ authorKey: 'bruno' }, { authorKey: 'bruno' }])], 'bruno')).toBe(false);
    expect(hasOthersBlocks([fp([])], 'bruno')).toBe(false);
  });

  it('a block of the other author blocks the deletion', async () => {
    const { hasOthersBlocks } = await import('./journal-view.util');
    expect(hasOthersBlocks([fp([{ authorKey: 'bruno' }]), fp([{ authorKey: 'barbara' }])], 'bruno')).toBe(true);
  });
});

describe('footprint weather', () => {
  it('a stored weather value is read and shown in the diary format', () => {
    const w = weatherOf({ code: 3, min: -2.6, max: 4.4, precip: 1.6, sunrise: '04:10', sunset: '23:40' });
    expect(w).toEqual({ code: 3, min: -2.6, max: 4.4, precip: 1.6, sunrise: '04:10', sunset: '23:40' });
    expect(weatherLine(w)).toBe('-3–4 °C, 2 mm');
    expect(weatherOf({ code: -1 })).toBeUndefined(); // no measurement
    expect(weatherOf('sunny')).toBeUndefined();
    expect(weatherLine(undefined)).toBe('');
  });
});

describe('footprint transport', () => {
  it('footprintsOf reads a valid transport and ignores others', () => {
    const state = materialize([
      rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'A', date: '20270101', transport: 'ship' } }),
      rec({ entity: 'footprint', entityKey: 'f2', op: 'create', fields: { journalKey: 'j1', title: 'B', date: '20270102', transport: 'rocket' } }),
    ]);
    expect(footprintsOf(state, 'j1').map((f) => f.transport)).toEqual(['ship', undefined]);
    expect(transportOf('')).toBeUndefined();
  });
});
