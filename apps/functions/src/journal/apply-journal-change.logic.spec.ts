import { describe, expect, it } from 'vitest';
import { JournalChange } from '@okr/shared-models';
import { conflictCopyKey, formatHlc } from '@okr/travel-journal-util';

import { isBookMapFileName, isJournalFileName, journalObjectPath, mayOverwrite, planEntityWrite, planFootprintSections, planSectionWrites, StoredRecord } from './apply-journal-change.logic';

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

  it('a second create of a block by another author keeps the first owner and the later html', () => {
    const records = [
      rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', kind: 'text', html: '<p>Bruno</p>', order: 'V' } }),
      rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', kind: 'text', html: '<p>Barbara</p>', order: 'V' } }, 'dev-b', 'barbara'),
    ];
    const write = planEntityWrite(records, 'j1', 'section', 's1', ['bkg']);
    expect(write?.path).toBe('journals/j1/sections/s1');
    expect(write?.data).toMatchObject({ authorKey: 'bruno', content: { htmlContent: '<p>Barbara</p>' } });
  });

  describe('conflict copies', () => {
    const create = () => rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', kind: 'text', html: '<p>C</p>', order: 'V' }, bases: {} });
    const edit = (html: string, base: string, deviceId: string, authorKey: string, entityKey = 's1') =>
      rec({ entity: 'section', entityKey, op: 'set', fields: { html }, bases: { html: base } }, deviceId, authorKey);

    it('concurrent block edits produce a copy doc', () => {
      const c = create();
      const anna = edit('<p>Anna</p>', c.change.hlc, 'dev-b', 'anna');
      const bruno = edit('<p>Bruno</p>', c.change.hlc, 'dev-a', 'bruno');
      const copyKey = conflictCopyKey('s1', anna.change.hlc);
      const writes = planSectionWrites([c, anna, bruno], 'j1', 's1', ['bkg'], []).writes;
      expect(writes.map((w) => w.path)).toEqual(['journals/j1/sections/s1', `journals/j1/sections/${copyKey}`]);
      expect(writes[0].data).toMatchObject({ content: { htmlContent: '<p>Bruno</p>' } });
      expect(writes[0].data['conflictOf']).toBeUndefined();
      expect(writes[1].data).toMatchObject({
        okey: copyKey, conflictOf: 's1', order: 'V', footprintKey: 'f1', authorKey: 'anna', content: { htmlContent: '<p>Anna</p>' },
      });
    });

    it('a set on a copy key alone is written once the original\'s records are loaded', () => {
      const c = create();
      const anna = edit('<p>Anna</p>', c.change.hlc, 'dev-b', 'anna');
      const bruno = edit('<p>Bruno</p>', c.change.hlc, 'dev-a', 'bruno');
      const copyKey = conflictCopyKey('s1', anna.change.hlc);
      const fix = edit('<p>Anna 2</p>', anna.change.hlc, 'dev-b', 'anna', copyKey);
      const writes = planSectionWrites([fix, c, anna, bruno], 'j1', 's1', ['bkg'], []).writes;
      expect(writes.find((w) => w.path.endsWith(copyKey))?.data).toMatchObject({ conflictOf: 's1', content: { htmlContent: '<p>Anna 2</p>' } });
    });

    it('an archived copy becomes isArchived', () => {
      const c = create();
      const anna = edit('<p>Anna</p>', c.change.hlc, 'dev-b', 'anna');
      const bruno = edit('<p>Bruno</p>', c.change.hlc, 'dev-a', 'bruno');
      const copyKey = conflictCopyKey('s1', anna.change.hlc);
      const gone = rec({ entity: 'section', entityKey: copyKey, op: 'archive', bases: {} });
      const writes = planSectionWrites([c, anna, bruno, gone], 'j1', 's1', ['bkg'], []).writes;
      expect(writes.find((w) => w.path.endsWith(copyKey))?.data).toEqual({ isArchived: true });
    });

    it('a copy that stops being lost is archived (A1, B, then A2 based on A1)', () => {
      const c = create();
      const a1 = edit('<p>A1</p>', c.change.hlc, 'dev-b', 'anna');
      const b = edit('<p>B</p>', c.change.hlc, 'dev-a', 'bruno');
      const a2 = edit('<p>A2</p>', a1.change.hlc, 'dev-b', 'anna');
      const copyA1 = conflictCopyKey('s1', a1.change.hlc);
      const copyB = conflictCopyKey('s1', b.change.hlc);
      const step1 = planSectionWrites([c, a1, b], 'j1', 's1', ['bkg'], []).writes;
      expect(step1.find((w) => w.path.endsWith(copyA1))?.data).toMatchObject({ conflictOf: 's1' });
      const step2 = planSectionWrites([c, a1, b, a2], 'j1', 's1', ['bkg'], [copyA1]).writes;
      expect(step2.find((w) => w.path.endsWith(copyA1))?.data).toEqual({ isArchived: true });
      expect(step2.find((w) => w.path.endsWith(copyB))?.data).toMatchObject({ conflictOf: 's1', content: { htmlContent: '<p>B</p>' } });
    });

    it('an existing copy that is not live is archived', () => {
      const c = create();
      const writes = planSectionWrites([c], 'j1', 's1', ['bkg'], ['s1_c_gone']).writes;
      expect(writes.find((w) => w.path.endsWith('s1_c_gone'))?.data).toEqual({ isArchived: true });
    });

    it('the same records in reverse order give the same writes', () => {
      const c = create();
      const a1 = edit('<p>A1</p>', c.change.hlc, 'dev-b', 'anna');
      const b = edit('<p>B</p>', c.change.hlc, 'dev-a', 'bruno');
      const forward = [c, a1, b];
      expect(planSectionWrites([...forward].reverse(), 'j1', 's1', ['bkg'], [])).toEqual(planSectionWrites(forward, 'j1', 's1', ['bkg'], []));
    });

    it('the footprint key is returned even when the original is archived', () => {
      const c = create();
      const gone = rec({ entity: 'section', entityKey: 's1', op: 'archive', bases: {} });
      const plan = planSectionWrites([c, gone], 'j1', 's1', ['bkg'], []);
      expect(plan.writes[0].data).toEqual({ isArchived: true });
      expect(plan.footprintKey).toBe('f1');
    });

    it('nothing is written before the original was created', () => {
      const anna = edit('<p>Anna</p>', 'x', 'dev-b', 'anna');
      expect(planSectionWrites([anna], 'j1', 's1', ['bkg'], []).writes).toEqual([]);
    });

    it('a block without concurrent edits writes only itself', () => {
      expect(planSectionWrites([create()], 'j1', 's1', ['bkg'], []).writes.map((w) => w.path)).toEqual(['journals/j1/sections/s1']);
    });
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

  it('a guest comment and an unliked like are materialised', () => {
    const comment = rec({ entity: 'comment', entityKey: 'c1', op: 'create', fields: { footprintKey: 'f1', text: 'Schön!', authorName: 'Anna', createdAt: '2027-01-14T10:00:00Z' } }, 'guest-anna', 'anna');
    expect(planEntityWrite([comment], 'j1', 'comment', 'c1', ['bkg'])).toMatchObject({
      path: 'journals/j1/comments/c1', data: { authorKey: 'anna', authorName: 'Anna', description: 'Schön!', parentKey: 'page.f1', isArchived: false },
    });
    const like = rec({ entity: 'reaction', entityKey: 'f1_anna', op: 'create', fields: { footprintKey: 'f1', type: 'like' } }, 'guest-anna', 'anna');
    const unlike = rec({ entity: 'reaction', entityKey: 'f1_anna', op: 'archive' }, 'guest-anna', 'anna');
    expect(planEntityWrite([like], 'j1', 'reaction', 'f1_anna', ['bkg'])?.data).toMatchObject({ personKey: 'anna', parentKey: 'page.f1', type: 'like' });
    expect(planEntityWrite([like, unlike], 'j1', 'reaction', 'f1_anna', ['bkg'])?.data).toEqual({ isArchived: true });
  });

  it('sign rejects a path outside the journal', () => {
    expect(isJournalFileName('a1b2-2048.jpg')).toBe(true);
    expect(isJournalFileName('../other/a.jpg')).toBe(false);
    expect(isJournalFileName('journals/j1/a.jpg')).toBe(false);
    expect(isJournalFileName('a.png')).toBe(false);
    expect(journalObjectPath('bkg', 'j1', 'a-400.jpg')).toBe('tenant/bkg/journal/j1/a-400.jpg');
  });
});

describe('book map overwrite (ruling R9)', () => {
  it('only book-map-*.jpg may be overwritten, and only on request', () => {
    expect(isBookMapFileName('book-map-overview.jpg')).toBe(true);
    expect(isBookMapFileName('book-map-0f3a_b-c.jpg')).toBe(true);
    expect(isBookMapFileName('a1b2-2048.jpg')).toBe(false);
    expect(isBookMapFileName('a1b2-print.jpg')).toBe(false);
    expect(isBookMapFileName('book-map-.jpg')).toBe(false);
    expect(isBookMapFileName('book-map-../x.jpg')).toBe(false);
    expect(isBookMapFileName('book-map-x.png')).toBe(false);
    expect(mayOverwrite('book-map-overview.jpg', true)).toBe(true);
    expect(mayOverwrite('book-map-overview.jpg', undefined)).toBe(false);
    expect(mayOverwrite('book-map-overview.jpg', 'true')).toBe(false);
    expect(mayOverwrite('a1b2-2048.jpg', true)).toBe(false);
  });
});
