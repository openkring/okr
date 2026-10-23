import { describe, expect, it } from 'vitest';
import { JournalChange } from '@okr/shared-models';
import { formatHlc } from '@okr/travel-journal-util';

import { isJournalFileName, journalObjectPath, planEntityWrite, planFootprintSections, StoredRecord } from './apply-journal-change.logic';

let n = 0;
function rec(p: Pick<JournalChange, 'entity' | 'entityKey' | 'op'> & Partial<JournalChange>, deviceId = 'dev-a', authorKey = 'bruno'): StoredRecord {
  n += 1;
  const change: JournalChange = {
    id: `r${n}`, journalKey: 'j1', deviceId, seq: n, hlc: formatHlc({ wall: 1000 + n, counter: 0, deviceId }), authorKey, fields: {}, ...p,
  };
  return { change, uploadedAtMs: 10_000 };
}

describe('applyJournalChange logic', () => {
  it('a set before its create waits for the create', () => {
    const set = rec({ entity: 'footprint', entityKey: 'f1', op: 'set', fields: { title: 'Neko' } });
    expect(planEntityWrite([set], 'j1', 'footprint', 'f1', ['bkg'])).toBeUndefined();
    const create = rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: '' } });
    // the set has the later clock, so its title wins once the create is there
    expect(planEntityWrite([set, create], 'j1', 'footprint', 'f1', ['bkg'])).toMatchObject({
      path: 'journals/j1/footprints/f1', data: { title: '', type: 'footprint' },
    });
  });

  it('an archived footprint becomes isArchived', () => {
    const records = [
      rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'Neko' } }),
      rec({ entity: 'footprint', entityKey: 'f1', op: 'archive' }),
    ];
    expect(planEntityWrite(records, 'j1', 'footprint', 'f1', ['bkg'])).toEqual({ path: 'journals/j1/footprints/f1', data: { isArchived: true } });
  });

  it('a second create of a block by another author keeps the first owner', () => {
    const records = [
      rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', kind: 'text', html: '<p>Bruno</p>', order: 'V' } }),
      rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', kind: 'text', html: '<p>Barbara</p>', order: 'V' } }, 'dev-b', 'barbara'),
    ];
    const write = planEntityWrite(records, 'j1', 'section', 's1', ['bkg']);
    expect(write?.path).toBe('journals/j1/sections/s1');
    expect(write?.data).toMatchObject({ authorKey: 'bruno', content: { htmlContent: '<p>Bruno</p>' } });
  });

  it('a record with a far-future clock is ignored', () => {
    const records = [
      rec({ entity: 'journal', entityKey: 'j1', op: 'create', fields: { title: 'Antarktis' } }),
      { ...rec({ entity: 'journal', entityKey: 'j1', op: 'set', fields: { title: 'Zukunft' } }), uploadedAtMs: 0 },
    ];
    records[1].change.hlc = formatHlc({ wall: 200_000_000, counter: 0, deviceId: 'dev-a' });
    expect(planEntityWrite(records, 'j1', 'journal', 'j1', ['bkg'])?.data).toMatchObject({ title: 'Antarktis', authorKeys: ['bruno'] });
  });

  it('the footprint lists its live sections in order', () => {
    expect(planFootprintSections('j1', 'f1', [
      { okey: 'sV', order: 'V' }, { okey: 'sG', order: 'G' }, { okey: 'sX', order: 'X', isArchived: true },
    ])).toEqual({ path: 'journals/j1/footprints/f1', data: { sections: ['sG', 'sV'] } });
  });

  it('a key with a path separator is never written', () => {
    const create = rec({ entity: 'section', entityKey: 'x/../y', op: 'create', fields: { footprintKey: 'f1', kind: 'text' } });
    expect(planEntityWrite([create], 'j1', 'section', 'x/../y', ['bkg'])).toBeUndefined();
    expect(planEntityWrite([create], 'j1/other', 'section', 's1', ['bkg'])).toBeUndefined();
  });

  it('sign rejects a path outside the journal', () => {
    expect(isJournalFileName('a1b2-2048.jpg')).toBe(true);
    expect(isJournalFileName('../other/a.jpg')).toBe(false);
    expect(isJournalFileName('journals/j1/a.jpg')).toBe(false);
    expect(isJournalFileName('a.png')).toBe(false);
    expect(journalObjectPath('bkg', 'j1', 'a-400.jpg')).toBe('tenant/bkg/journal/j1/a-400.jpg');
  });
});
