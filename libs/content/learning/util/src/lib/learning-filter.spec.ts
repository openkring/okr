import { DocumentModel } from '@okr/shared-models';
import { filterLearningDocs, roomDocs, stripHtml } from './learning-filter';

function doc(okey: string, p: Partial<DocumentModel> = {}): DocumentModel {
  return Object.assign(new DocumentModel('t'), { okey, mimeType: 'application/pdf', folderKeys: ['f1'] }, p);
}
const all = { tab: 'files' as const, topic: '', query: '' };

describe('roomDocs', () => {
  it('keeps docs in the folder and drops archived ones', () => {
    const docs = [doc('a'), doc('b', { folderKeys: ['f2'] }), doc('c', { isArchived: true })];
    expect(roomDocs(docs, 'f1').map(d => d.okey)).toEqual(['a']);
  });
});

describe('filterLearningDocs', () => {
  it('filters by tab', () => {
    const docs = [doc('a'), doc('v', { mimeType: 'video/mp4' })];
    expect(filterLearningDocs(docs, { ...all, tab: 'videos' }).map(d => d.okey)).toEqual(['v']);
  });
  it('filters by topic', () => {
    const docs = [doc('a', { tags: 'x, y' }), doc('b', { tags: 'z' })];
    expect(filterLearningDocs(docs, { ...all, topic: 'y' }).map(d => d.okey)).toEqual(['a']);
  });
  it('query hits title, notes, tags and comment text', () => {
    const docs = [
      doc('t', { title: 'Knoten' }), doc('n', { notes: '<p>Bowline</p>' }),
      doc('g', { tags: 'segeln' }), doc('c'), doc('none'),
    ];
    const ct = { c: 'toller Hinweis' };
    const q = (query: string) => filterLearningDocs(docs, { ...all, query }, ct).map(d => d.okey);
    expect(q('zzz')).toEqual([]);
    expect(q('knoten')).toEqual(['t']);
    expect(q('BOWLINE')).toEqual(['n']);
    expect(q('segel')).toEqual(['g']);
    expect(q('hinweis')).toEqual(['c']);
  });
  it('is diacritic-insensitive', () => {
    const docs = [doc('u', { title: 'Übung' })];
    expect(filterLearningDocs(docs, { ...all, query: 'ubung' })).toHaveLength(1);
    expect(filterLearningDocs(docs, { ...all, query: 'ÜBUNG' })).toHaveLength(1);
  });
  it('does not match html tag names in notes', () => {
    expect(filterLearningDocs([doc('n', { notes: '<strong>x</strong>' })], { ...all, query: 'strong' })).toHaveLength(0);
  });
  it('excludes archived docs', () => {
    expect(filterLearningDocs([doc('a', { isArchived: true })], all)).toHaveLength(0);
  });
});

describe('robustness', () => {
  it('tolerates a non-string query', () => {
    expect(filterLearningDocs([doc('a')], { ...all, query: undefined as unknown as string })).toHaveLength(1);
  });
});

describe('stripHtml', () => {
  it('decodes numeric entities', () => {
    expect(stripHtml('&#228;&#x00fc; &#38; &#xZZ; &#99999999;')).toBe('äü & &#xZZ;');
  });
  it('strips tags and decodes entities', () => {
    expect(stripHtml('<p>A &amp; B &lt;c&gt; &quot;d&quot; it&#39;s&nbsp;ok</p>')).toBe('A & B <c> "d" it\'s ok');
  });
  it('separates blocks with a space', () => {
    expect(stripHtml('<p>a</p><p>b</p>')).toBe('a b');
  });
});
