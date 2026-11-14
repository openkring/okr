import { describe, expect, it } from 'vitest';
import { JournalChange } from '@okr/shared-models';
import { formatHlc } from './journal-hlc.util';
import { FieldRecord, materialize } from './journal-merge.util';
import { footprintsOf, publishedFootprintsOf } from './journal-view.util';
import { conflictCopyKey, isConflictCopyKey, lostValues, originalOfCopy } from './journal-conflict.util';

const DEVICE: Record<string, string> = { bruno: 'dev-b', anna: 'dev-a' };
const hlc = (wall: number, author = 'bruno'): string => formatHlc({ wall, counter: 0, deviceId: DEVICE[author] });

let n = 0;
function rec(p: Pick<JournalChange, 'entity' | 'entityKey' | 'op'> & Partial<JournalChange>, wall: number, authorKey = 'bruno'): JournalChange {
  n += 1;
  return { id: `r${n}`, journalKey: 'j1', deviceId: DEVICE[authorKey], seq: n, hlc: hlc(wall, authorKey), authorKey, fields: {}, ...p };
}

const FP = rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'Neko', date: '20270114' }, bases: {} }, 10);
const C = rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', type: 'article', htmlContent: '<p>C</p>', order: 'V' }, bases: {} }, 100);
const ANNA = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { htmlContent: '<p>Anna</p>' }, bases: { htmlContent: C.hlc } }, 200, 'anna');
const BRUNO = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { htmlContent: '<p>Bruno</p>' }, bases: { htmlContent: C.hlc } }, 300);
const CONCURRENT = [FP, C, ANNA, BRUNO];

function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('journal conflict helpers', () => {
  it('copy keys round-trip to their original', () => {
    const key = conflictCopyKey('s1', '0000000200:0000:dev-a');
    expect(key).toBe('s1_c_0000000200_0000_dev-a');
    expect(key).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    expect(isConflictCopyKey(key)).toBe(true);
    expect(isConflictCopyKey('s1')).toBe(false);
    expect(originalOfCopy(key)).toBe('s1');
    expect(originalOfCopy('s1')).toBe('s1');
  });

  it('lostValues follows the lost-value rule', () => {
    const r = (h: string, base?: string): FieldRecord => ({ value: h, hlc: h, authorKey: 'x', ...(base === undefined ? {} : { base }) });
    expect(lostValues(undefined)).toEqual([]);
    expect(lostValues([r('1'), r('2', '1'), r('3', '1')]).map((x) => x.hlc)).toEqual(['2']);
    expect(lostValues([r('1'), r('2', '1'), r('3', '2')])).toEqual([]);
    expect(lostValues([r('1'), r('2', '1'), r('3')])).toEqual([]); // no base: based on every earlier entry
    expect(lostValues([r('3', '1'), r('1'), r('2', '1')]).map((x) => x.hlc)).toEqual(['2']); // unsorted input
  });

  it('two first writes (base empty) of one field: the lower hlc is lost', () => {
    const r = (h: string, base?: string): FieldRecord => ({ value: h, hlc: h, authorKey: 'x', ...(base === undefined ? {} : { base }) });
    expect(lostValues([r('1', ''), r('2', '')]).map((x) => x.hlc)).toEqual(['1']);
  });

  it('a base-less legacy write after a lost value hides it (legacy rule)', () => {
    const r = (h: string, base?: string): FieldRecord => ({ value: h, hlc: h, authorKey: 'x', ...(base === undefined ? {} : { base }) });
    expect(lostValues([r('1', ''), r('2', ''), r('3')])).toEqual([]);
  });
});

describe('journal conflict copies', () => {
  it('concurrent edits keep both', () => {
    const [fp] = footprintsOf(materialize(CONCURRENT), 'j1');
    const copyKey = conflictCopyKey('s1', ANNA.hlc);
    expect(fp.sections.map((b) => b.key)).toEqual(['s1', copyKey]);
    const [original, copy] = fp.sections;
    expect(original.htmlContent).toBe('<p>Bruno</p>');
    expect(original.conflict).toBe(true);
    expect(original.conflictOf).toBeUndefined();
    expect(original.hlcs['htmlContent']).toBe(BRUNO.hlc);
    expect(original.authorKey).toBe('bruno');
    expect(copy.htmlContent).toBe('<p>Anna</p>');
    expect(copy.conflictOf).toBe('s1');
    expect(copy.conflict).toBe(true);
    expect(copy.authorKey).toBe('anna');
    expect(copy.order).toBe('V');
    expect(copy.hlcs['htmlContent']).toBe(ANNA.hlc);
  });

  it('edit based on the latest value: no copy', () => {
    const bruno = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { htmlContent: '<p>Bruno</p>' }, bases: { htmlContent: ANNA.hlc } }, 300);
    const [fp] = footprintsOf(materialize([FP, C, ANNA, bruno]), 'j1');
    expect(fp.sections.map((b) => [b.key, b.htmlContent, b.conflict])).toEqual([['s1', '<p>Bruno</p>', false]]);
  });

  it('same author sequential edits: no copy', () => {
    const first = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { htmlContent: '<p>1</p>' }, bases: { htmlContent: C.hlc } }, 200);
    const second = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { htmlContent: '<p>2</p>' }, bases: { htmlContent: first.hlc } }, 300);
    const [fp] = footprintsOf(materialize([FP, C, first, second]), 'j1');
    expect(fp.sections.map((b) => [b.key, b.htmlContent])).toEqual([['s1', '<p>2</p>']]);
  });

  it('record without bases supersedes older values', () => {
    const legacy = [
      rec({ entity: 'section', entityKey: 's2', op: 'create', fields: { footprintKey: 'f1', type: 'article', htmlContent: '<p>0</p>', order: 'V' } }, 100),
      rec({ entity: 'section', entityKey: 's2', op: 'set', fields: { htmlContent: '<p>A</p>' } }, 200, 'anna'),
      rec({ entity: 'section', entityKey: 's2', op: 'set', fields: { htmlContent: '<p>B</p>' } }, 300),
      rec({ entity: 'footprint', entityKey: 'f1', op: 'set', fields: { title: 'Alt' } }, 50, 'anna'),
    ];
    for (const records of [legacy, [...legacy].reverse()]) {
      const [fp] = footprintsOf(materialize([FP, ...records]), 'j1');
      expect(fp.sections.map((b) => [b.key, b.htmlContent, b.conflict])).toEqual([['s2', '<p>B</p>', false]]);
      expect(fp.lostValues).toEqual([]);
    }
  });

  it('copy order follows the original', () => {
    const other = rec({ entity: 'section', entityKey: 's0', op: 'create', fields: { footprintKey: 'f1', type: 'article', htmlContent: '<p>W</p>', order: 'W' } }, 110);
    const before = rec({ entity: 'section', entityKey: 's9', op: 'create', fields: { footprintKey: 'f1', type: 'article', htmlContent: '<p>U</p>', order: 'U' } }, 120);
    const [fp] = footprintsOf(materialize([...CONCURRENT, other, before]), 'j1');
    expect(fp.sections.map((b) => b.key)).toEqual(['s9', 's1', conflictCopyKey('s1', ANNA.hlc), 's0']);
    expect(fp.sections[2].order).toBe('V');
  });

  it('editing a copy', () => {
    const copyKey = conflictCopyKey('s1', ANNA.hlc);
    const edit = rec({ entity: 'section', entityKey: copyKey, op: 'set', fields: { htmlContent: '<p>Anna 2</p>' }, bases: { htmlContent: ANNA.hlc } }, 400, 'anna');
    const edited = footprintsOf(materialize([...CONCURRENT, edit]), 'j1')[0].sections;
    expect(edited.map((b) => [b.key, b.htmlContent])).toEqual([['s1', '<p>Bruno</p>'], [copyKey, '<p>Anna 2</p>']]);
    expect(edited[1].hlcs['htmlContent']).toBe(edit.hlc);

    const archive = rec({ entity: 'section', entityKey: copyKey, op: 'archive' }, 500);
    const after = footprintsOf(materialize([...CONCURRENT, edit, archive]), 'j1')[0].sections;
    expect(after.map((b) => [b.key, b.htmlContent, b.conflict])).toEqual([['s1', '<p>Bruno</p>', false]]);
  });

  it('copy survives the original\'s archive without conflict flag', () => {
    const archive = rec({ entity: 'section', entityKey: 's1', op: 'archive' }, 400);
    const sections = footprintsOf(materialize([...CONCURRENT, archive]), 'j1')[0].sections;
    expect(sections.map((b) => [b.key, b.htmlContent, b.conflictOf, b.conflict])).toEqual([[conflictCopyKey('s1', ANNA.hlc), '<p>Anna</p>', 's1', false]]);
  });

  it('the published view hides an open copy but keeps one that outlived its original', () => {
    const published = rec({ entity: 'footprint', entityKey: 'f1', op: 'set', fields: { publishState: 'published' }, bases: { publishState: FP.hlc } }, 50);
    const open = publishedFootprintsOf(materialize([...CONCURRENT, published]), 'j1')[0];
    expect(open.sections.map((b) => [b.key, b.htmlContent])).toEqual([['s1', '<p>Bruno</p>']]);
    const archive = rec({ entity: 'section', entityKey: 's1', op: 'archive' }, 400);
    const orphaned = publishedFootprintsOf(materialize([...CONCURRENT, published, archive]), 'j1')[0];
    expect(orphaned.sections.map((b) => [b.key, b.htmlContent, b.conflict])).toEqual([[conflictCopyKey('s1', ANNA.hlc), '<p>Anna</p>', false]]);
  });

  it('footprint lost value is listed and can be dismissed', () => {
    const anna = rec({ entity: 'footprint', entityKey: 'f1', op: 'set', fields: { title: 'Neko Harbour' }, bases: { title: FP.hlc } }, 200, 'anna');
    const bruno = rec({ entity: 'footprint', entityKey: 'f1', op: 'set', fields: { title: 'Neko Bay' }, bases: { title: FP.hlc } }, 300);
    const [fp] = footprintsOf(materialize([FP, anna, bruno]), 'j1');
    expect(fp.title).toBe('Neko Bay');
    expect(fp.hlcs['title']).toBe(bruno.hlc);
    expect(fp.hlcs['date']).toBe(FP.hlc);
    expect(fp.lostValues).toEqual([{ field: 'title', value: 'Neko Harbour', authorKey: 'anna', hlc: anna.hlc }]);

    const dismiss = rec({ entity: 'footprint', entityKey: 'f1', op: 'set', fields: { [`dismissed_${anna.hlc.replace(/:/g, '_')}`]: true } }, 400, 'anna');
    expect(footprintsOf(materialize([FP, anna, bruno, dismiss]), 'j1')[0].lostValues).toEqual([]);
  });

  it('conflict derivation is order-independent', () => {
    const copyKey = conflictCopyKey('s1', ANNA.hlc);
    const records = [
      ...CONCURRENT,
      rec({ entity: 'section', entityKey: copyKey, op: 'set', fields: { htmlContent: '<p>Anna 2</p>' }, bases: { htmlContent: ANNA.hlc } }, 400, 'anna'),
      rec({ entity: 'footprint', entityKey: 'f1', op: 'set', fields: { title: 'Neko Harbour' }, bases: { title: FP.hlc } }, 200, 'anna'),
      rec({ entity: 'footprint', entityKey: 'f1', op: 'set', fields: { title: 'Neko Bay' }, bases: { title: FP.hlc } }, 300),
    ];
    const expected = footprintsOf(materialize(records), 'j1');
    expect(expected[0].sections).toHaveLength(2);
    expect(expected[0].lostValues).toHaveLength(1);
    for (let seed = 1; seed <= 20; seed++) {
      expect(footprintsOf(materialize(shuffled(records, seed)), 'j1')).toEqual(expected);
    }
  });

  it('keeps type video on a conflict copy of the clips', () => {
    const V = rec({ entity: 'section', entityKey: 'v1', op: 'create', fields: { footprintKey: 'f1', type: 'video', htmlContent: '<p>Cap</p>', p_clips: ['i0'], order: 'V' }, bases: {} }, 100);
    const A = rec({ entity: 'section', entityKey: 'v1', op: 'set', fields: { p_clips: ['i0', 'i1'] }, bases: { p_clips: V.hlc } }, 200, 'anna');
    const B = rec({ entity: 'section', entityKey: 'v1', op: 'set', fields: { p_clips: ['i0', 'i2'] }, bases: { p_clips: V.hlc } }, 300);
    const [fp] = footprintsOf(materialize([FP, V, A, B]), 'j1');
    expect(fp.sections).toHaveLength(2);
    const copy = fp.sections[1];
    expect(copy.conflictOf).toBe('v1');
    expect(copy.type).toBe('video');
    expect(copy.properties['clips']).toEqual(['i0', 'i1']);
    expect(copy.htmlContent).toBe('<p>Cap</p>');
  });

  it('concurrent caption edits on a video section keep the losing caption as a video copy', () => {
    const V = rec({ entity: 'section', entityKey: 'v1', op: 'create', fields: { footprintKey: 'f1', type: 'video', htmlContent: '<p>Cap</p>', p_clips: ['i0'], order: 'V' }, bases: {} }, 100);
    const A = rec({ entity: 'section', entityKey: 'v1', op: 'set', fields: { htmlContent: '<p>Anna</p>' }, bases: { htmlContent: V.hlc } }, 200, 'anna');
    const B = rec({ entity: 'section', entityKey: 'v1', op: 'set', fields: { htmlContent: '<p>Bruno</p>' }, bases: { htmlContent: V.hlc } }, 300);
    const [fp] = footprintsOf(materialize([FP, V, A, B]), 'j1');
    expect(fp.sections.map((b) => b.htmlContent)).toEqual(['<p>Bruno</p>', '<p>Anna</p>']);
    const copy = fp.sections[1];
    expect(copy.conflictOf).toBe('v1');
    expect(copy.type).toBe('video');
    expect(copy.properties['clips']).toEqual(['i0']);
  });

  it('a losing record that changed several content keys gives one copy carrying all its lost values', () => {
    const A = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { htmlContent: '<p>Anna</p>', p_images: [{ label: 'a1' }] }, bases: { htmlContent: C.hlc, p_images: '' } }, 200, 'anna');
    const B = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { htmlContent: '<p>Bruno</p>', p_images: [{ label: 'b1' }] }, bases: { htmlContent: C.hlc, p_images: '' } }, 300);
    const copyKey = conflictCopyKey('s1', A.hlc);
    for (const order of [[FP, C, A, B], [B, A, C, FP]]) {
      const [fp] = footprintsOf(materialize(order), 'j1');
      expect(fp.sections.map((s) => s.key)).toEqual(['s1', copyKey]);
      const [original, copy] = fp.sections;
      expect([original.htmlContent, original.properties['images']]).toEqual(['<p>Bruno</p>', [{ label: 'b1' }]]);
      expect([copy.htmlContent, copy.properties['images'], copy.authorKey]).toEqual(['<p>Anna</p>', [{ label: 'a1' }], 'anna']);
      expect(copy.hlcs).toMatchObject({ htmlContent: A.hlc, p_images: A.hlc });
    }
  });

  it('a concurrent title edit becomes a copy too; a settings key edited on a copy is laid over it', () => {
    const A = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { title: 'Anna' }, bases: { title: '' } }, 200, 'anna');
    const B = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { title: 'Bruno' }, bases: { title: '' } }, 300);
    const copyKey = conflictCopyKey('s1', A.hlc);
    const restyle = rec({ entity: 'section', entityKey: copyKey, op: 'set', fields: { p_imageStyle: { width: '50%' } } }, 400, 'anna');
    const [fp] = footprintsOf(materialize([FP, C, A, B, restyle]), 'j1');
    expect(fp.sections.map((s) => [s.key, s.title, s.htmlContent])).toEqual([['s1', 'Bruno', '<p>C</p>'], [copyKey, 'Anna', '<p>C</p>']]);
    expect(fp.sections[1].properties['imageStyle']).toEqual({ width: '50%' });
    expect(fp.sections[0].properties['imageStyle']).toBeUndefined();
  });
});
