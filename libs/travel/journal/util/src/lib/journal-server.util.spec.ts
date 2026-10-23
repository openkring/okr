import { describe, expect, it } from 'vitest';
import { JournalChange } from '@okr/shared-models';
import { formatHlc } from './journal-hlc.util';
import { materialize } from './journal-merge.util';
import { acceptRecord, footprintPageOf, imageDocOf, journalDocOf, MAX_FUTURE_MS, sectionDocOf, storagePath } from './journal-server.util';
import { footprintsOf } from './journal-view.util';

let n = 0;
function rec(p: Pick<JournalChange, 'entity' | 'entityKey' | 'op'> & Partial<JournalChange>, deviceId = 'dev-a', authorKey = 'bruno'): JournalChange {
  n += 1;
  return {
    id: `r${n}`, journalKey: 'j1', deviceId, seq: n,
    hlc: formatHlc({ wall: 1000 + n, counter: 0, deviceId }), authorKey, fields: {}, ...p,
  };
}

describe('journal server util', () => {
  it('acceptRecord rejects a malformed hlc', () => {
    expect(acceptRecord(rec({ entity: 'journal', entityKey: 'j1', op: 'create', hlc: 'nonsense' }), 2000)).toBe(false);
    expect(acceptRecord(rec({ entity: 'journal', entityKey: 'j1', op: 'create' }), 2000)).toBe(true);
  });

  it('acceptRecord rejects a clock 25 h in the future', () => {
    const now = 1_800_000_000_000;
    const ahead = (ms: number) => rec({ entity: 'journal', entityKey: 'j1', op: 'set', hlc: formatHlc({ wall: now + ms, counter: 0, deviceId: 'dev-a' }) });
    expect(acceptRecord(ahead(25 * 60 * 60 * 1000), now)).toBe(false);
    expect(acceptRecord(ahead(MAX_FUTURE_MS), now)).toBe(true);
  });

  it('journalDocOf carries authorKeys from the journal fields', () => {
    const state = materialize([
      rec({ entity: 'journal', entityKey: 'j1', op: 'create', fields: { title: 'Antarktis 2027', startDate: '20270108' } }),
      rec({ entity: 'journal', entityKey: 'j1', op: 'set', fields: { authorKeys: ['bruno', 'barbara'] } }),
    ]);
    const doc = journalDocOf(state, 'j1', ['bkg']);
    expect(doc?.authorKeys).toEqual(['bruno', 'barbara']);
    expect(doc?.title).toBe('Antarktis 2027');
    expect(doc?.tenants).toEqual(['bkg']);
    expect(doc && 'authors' in doc).toBe(false); // undefined is dropped, Firestore rejects it
  });

  it('journalDocOf keeps the creator as an author', () => {
    const state = materialize([rec({ entity: 'journal', entityKey: 'j1', op: 'create', fields: { title: 'A' } })]);
    expect(journalDocOf(state, 'j1', ['bkg'])?.authorKeys).toEqual(['bruno']);
  });

  it('an archived or missing entity gives undefined', () => {
    const state = materialize([
      rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'Neko' } }),
      rec({ entity: 'footprint', entityKey: 'f1', op: 'archive' }),
    ]);
    expect(footprintPageOf(state, 'f1', ['bkg'])).toBeUndefined();
    expect(footprintPageOf(state, 'f2', ['bkg'])).toBeUndefined();
  });

  it('footprintPageOf is a private footprint page', () => {
    const state = materialize([
      rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'Neko', date: '20270114', latitude: -64.8, publishState: 'published' } }),
    ]);
    expect(footprintPageOf(state, 'f1', ['bkg'])).toMatchObject({
      okey: 'f1', type: 'footprint', isPrivate: true, journalKey: 'j1', title: 'Neko', date: '20270114', latitude: -64.8, publishState: 'published',
    });
  });

  it('server view matches device view for a non-owner record', () => {
    const state = materialize([
      rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'Neko' } }),
      rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', kind: 'text', html: '<p>mine</p>', order: 'V' } }),
      rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { html: '<p>hijack</p>' } }, 'dev-b', 'barbara'),
    ]);
    const device = footprintsOf(state, 'j1')[0].blocks[0];
    const server = sectionDocOf(state, 's1', 'j1', ['bkg']);
    expect(server?.content.htmlContent).toBe(device.html);
    expect(server?.content.htmlContent).toBe('<p>mine</p>');
    expect(server?.authorKey).toBe('bruno');
    expect(server?.footprintKey).toBe('f1');
    expect(server?.order).toBe('V');
  });

  it('a photo block lists its image keys', () => {
    const state = materialize([
      rec({ entity: 'section', entityKey: 's2', op: 'create', fields: { footprintKey: 'f1', kind: 'photos', imageKeys: ['i1', 'i2'], order: 'G' } }),
    ]);
    const section = sectionDocOf(state, 's2', 'j1', ['bkg']);
    expect(section?.type).toBe('article');
    expect(section?.content.htmlContent).toBe('');
    expect(section?.properties.images.map((i) => i.label)).toEqual(['i1', 'i2']);
  });

  it('imageDocOf stores bucket paths', () => {
    const state = materialize([
      rec({ entity: 'image', entityKey: 'i1', op: 'create', fields: { journalKey: 'j1', width: 2048, height: 1536, path2048: 'journals/j1/a-2048.jpg', path400: 'journals/j1/a-400.jpg', localIdentifier: 'L1' } }),
    ]);
    expect(imageDocOf(state, 'i1', ['bkg'])).toEqual({
      okey: 'i1', tenants: ['bkg'], isArchived: false, journalKey: 'j1', authorKey: 'bruno', width: 2048, height: 1536,
      path2048: 'tenant/bkg/journal/j1/a-2048.jpg', path400: 'tenant/bkg/journal/j1/a-400.jpg',
    });
  });

  it("storagePath strips the device's journals/<jk>/ prefix", () => {
    expect(storagePath('bkg', 'j1', 'journals/j1/x-400.jpg')).toBe('tenant/bkg/journal/j1/x-400.jpg');
    expect(storagePath('bkg', 'j1', '')).toBe('');
  });
});
