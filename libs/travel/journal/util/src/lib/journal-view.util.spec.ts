import { describe, expect, it } from 'vitest';
import { JournalChange } from '@okr/shared-models';
import { formatHlc } from './journal-hlc.util';
import { materialize } from './journal-merge.util';
import { footprintsOf, imagesOf, journalsOf, lastSectionOrder, sectionsOf, transportOf, weatherLine, weatherOf } from './journal-view.util';

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
    expect(journalsOf(state)[0]).toEqual({ key: 'j1', title: 'Antarktis 2027', subTitle: '', startDate: '20270108', endDate: '', coverImageKey: '', coverLabel: '', lastPageLabel: '' });
  });

  it('journalsOf maps cover and labels', () => {
    const state = materialize([
      rec({ entity: 'journal', entityKey: 'j1', op: 'create', fields: { title: 'A', coverImageKey: 'img1', coverLabel: 'Antarktis', lastPageLabel: '© 2027 B. Kaiser' } }),
    ]);
    expect(journalsOf(state)[0]).toMatchObject({ coverImageKey: 'img1', coverLabel: 'Antarktis', lastPageLabel: '© 2027 B. Kaiser' });
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

  it('sections are ordered by order and skip archived ones', () => {
    const sV = rec({ entity: 'section', entityKey: 'sV', op: 'create', fields: { footprintKey: 'f1', type: 'article', htmlContent: '<p>v</p>', order: 'V' } });
    const sG = rec({ entity: 'section', entityKey: 'sG', op: 'create', fields: { footprintKey: 'f1', type: 'album', p_images: [{ label: 'i1' }], order: 'G' } });
    const state = materialize([
      rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'Neko' } }),
      sV,
      sG,
      rec({ entity: 'section', entityKey: 'sX', op: 'create', fields: { footprintKey: 'f1', type: 'article', htmlContent: '<p>x</p>', order: 'X' } }),
      rec({ entity: 'section', entityKey: 'sX', op: 'archive' }),
    ]);
    const [footprint] = footprintsOf(state, 'j1');
    expect(footprint.sections.map((b) => b.key)).toEqual(['sG', 'sV']);
    expect(footprint.sections[0]).toEqual({ key: 'sG', type: 'album', title: '', htmlContent: '', properties: { images: [{ label: 'i1' }] }, authorKey: 'bruno', order: 'G', hlcs: { p_images: sG.hlc }, conflict: false });
    expect(footprint.sections[1]).toEqual({ key: 'sV', type: 'article', title: '', htmlContent: '<p>v</p>', properties: {}, authorKey: 'bruno', order: 'V', hlcs: { htmlContent: sV.hlc }, conflict: false });
    expect(lastSectionOrder(footprint)).toBe('V');
  });

  it('a photo section may name images not imported yet; imagesOf lists only imported ones', () => {
    const state = materialize([
      rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'Neko' } }),
      rec({ entity: 'image', entityKey: 'i1', op: 'create', fields: { journalKey: 'j1', takenAt: '2027-01-14T09:00:00', latitude: -64.83, longitude: -62.53, width: 2048, height: 1536, path2048: 'journals/j1/a-2048.jpg', path400: 'journals/j1/a-400.jpg', localIdentifier: 'L1' } }),
      rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', type: 'album', p_images: [{ label: 'i1' }, { label: 'i2' }], order: 'V' } }),
    ]);
    expect(footprintsOf(state, 'j1')[0].sections[0].properties['images']).toEqual([{ label: 'i1' }, { label: 'i2' }]);
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
    expect(lastSectionOrder(footprint)).toBeUndefined();
  });
});

describe('hasOthersSections', () => {
  const fp = (sections: { authorKey: string; type?: 'hero' | 'article'; htmlContent?: string }[]) =>
    ({ key: 'f', journalKey: 'j1', title: '', placeName: '', date: '', time: '', publishState: 'draft' as const, hlcs: {}, lostValues: [],
      sections: sections.map((b, i) => ({ key: `b${i}`, type: 'article' as const, title: '', htmlContent: '', properties: {}, order: 'V', hlcs: {}, conflict: false, ...b })) });

  it('a footprint with only own sections may be deleted', async () => {
    const { hasOthersSections } = await import('./journal-view.util');
    expect(hasOthersSections([fp([{ authorKey: 'bruno' }, { authorKey: 'bruno' }])], 'bruno')).toBe(false);
    expect(hasOthersSections([fp([])], 'bruno')).toBe(false);
  });

  it('a section of the other author with content blocks the deletion', async () => {
    const { hasOthersSections } = await import('./journal-view.util');
    expect(hasOthersSections([fp([{ authorKey: 'bruno' }]), fp([{ authorKey: 'barbara', htmlContent: '<p>Pinguine</p>' }])], 'bruno')).toBe(true);
  });

  it('the empty hero and article a co-author\'s new footprint starts with do not block the deletion', async () => {
    const { hasOthersSections } = await import('./journal-view.util');
    expect(hasOthersSections([fp([{ authorKey: 'barbara', type: 'hero' }, { authorKey: 'barbara' }])], 'bruno')).toBe(false);
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
  it('accepts the new modes', () => {
    for (const m of ['row', 'ski', 'motorbike']) expect(transportOf(m)).toBe(m);
  });
  it('footprintsOf reads a valid transport and ignores others', () => {
    const state = materialize([
      rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'A', date: '20270101', transport: 'ship' } }),
      rec({ entity: 'footprint', entityKey: 'f2', op: 'create', fields: { journalKey: 'j1', title: 'B', date: '20270102', transport: 'rocket' } }),
    ]);
    expect(footprintsOf(state, 'j1').map((f) => f.transport)).toEqual(['ship', undefined]);
    expect(transportOf('')).toBeUndefined();
  });

  it('reads a video section with caption and clips', () => {
    const state = materialize([
      rec({ entity: 'section', entityKey: 'b1', op: 'create', fields: { footprintKey: 'f1', type: 'video', htmlContent: '<p>Pinguine</p>', p_clips: [{ label: 'i1' }], order: 'a' } }),
    ]);
    expect(sectionsOf(state, 'f1')[0]).toMatchObject({ type: 'video', htmlContent: '<p>Pinguine</p>', properties: { clips: [{ label: 'i1' }] } });
  });

  it('imagesOf carries videoPath and durationSec', () => {
    const state = materialize([
      rec({ entity: 'image', entityKey: 'i1', op: 'create', fields: { journalKey: 'j1', width: 1, height: 1, path2048: 'journals/j1/n-2048.jpg', path400: 'journals/j1/n-400.jpg', videoPath: 'journals/j1/n-video.mp4', durationSec: 12.3 } }),
      rec({ entity: 'image', entityKey: 'i2', op: 'create', fields: { journalKey: 'j1', width: 1, height: 1, path2048: 'a', path400: 'b' } }),
    ]);
    const images = imagesOf(state, 'j1');
    expect(images.get('i1')).toMatchObject({ videoPath: 'journals/j1/n-video.mp4', durationSec: 12.3 });
    expect(images.get('i2')?.videoPath).toBeUndefined();
    expect(images.get('i2')?.durationSec).toBeUndefined();
  });
});
