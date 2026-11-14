import { describe, expect, it } from 'vitest';
import { JournalChange } from '@okr/shared-models';
import { formatHlc } from './journal-hlc.util';
import { entityStateKey, materialize } from './journal-merge.util';
import { acceptRecord, conflictCopyDocOf, footprintPageOf, imageDocOf, journalDocOf, MAX_FUTURE_MS, sectionDocOf, storagePath } from './journal-server.util';
import { sectionModelOf } from './journal-section.util';
import { footprintsOf, SectionView, sectionViewOf } from './journal-view.util';

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

  it('journalDocOf writes cover and labels', () => {
    const full = materialize([
      rec({ entity: 'journal', entityKey: 'j1', op: 'create', fields: { title: 'A', coverImageKey: 'img1', coverLabel: 'Antarktis', lastPageLabel: '© 2027 B. Kaiser' } }),
    ]);
    expect(journalDocOf(full, 'j1', ['bkg'])).toMatchObject({ coverImageKey: 'img1', coverLabel: 'Antarktis', lastPageLabel: '© 2027 B. Kaiser' });
    const bare = materialize([rec({ entity: 'journal', entityKey: 'j1', op: 'create', fields: { title: 'A' } })]);
    const doc = journalDocOf(bare, 'j1', ['bkg']);
    expect(doc && 'coverImageKey' in doc).toBe(false);
    expect(doc && 'coverLabel' in doc).toBe(false);
    expect(doc && 'lastPageLabel' in doc).toBe(false);
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

  it("server view matches device view for another author's section edit", () => {
    const state = materialize([
      rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'Neko' } }),
      rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', type: 'article', htmlContent: '<p>mine</p>', order: 'V' } }),
      rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { htmlContent: '<p>hijack</p>' } }, 'dev-b', 'barbara'),
    ]);
    const device = footprintsOf(state, 'j1')[0].sections[0];
    const server = sectionDocOf(state, 's1', 'j1', ['bkg']);
    expect(server?.content.htmlContent).toBe(device.htmlContent);
    expect(server?.content.htmlContent).toBe('<p>hijack</p>');
    expect(server?.authorKey).toBe('bruno');
    expect(server?.footprintKey).toBe('f1');
    expect(server?.order).toBe('V');
  });

  it('sectionDocOf of an article is its sectionModelOf plus the journal fields', () => {
    const state = materialize([
      rec({ entity: 'section', entityKey: 's1', op: 'create', fields: {
        footprintKey: 'f1', type: 'article', title: 'Neko', htmlContent: '<p>Eis</p>', p_images: [{ label: 'i1' }], p_imageStyle: { width: '50%' }, order: 'G',
      } }),
    ]);
    const view = sectionViewOf(state[entityStateKey('section', 's1')]);
    expect(view).toBeDefined();
    const doc = sectionDocOf(state, 's1', 'j1', ['bkg', 'scs']);
    expect(doc).toEqual({
      ...sectionModelOf(view as SectionView, 'bkg'), tenants: ['bkg', 'scs'], isArchived: false,
      journalKey: 'j1', footprintKey: 'f1', authorKey: 'bruno', order: 'G',
    });
    expect(doc?.type).toBe('article');
    expect((doc?.properties as { images: { label: string; url: string }[] }).images).toEqual([expect.objectContaining({ label: 'i1', url: '' })]);
    expect(doc).not.toHaveProperty('conflictOf');
    expect(doc).not.toHaveProperty('conflict');
  });

  it('an album and a video keep their CMS type and lists', () => {
    const state = materialize([
      rec({ entity: 'section', entityKey: 's2', op: 'create', fields: { footprintKey: 'f1', type: 'album', p_images: [{ label: 'i1' }, { label: 'i2' }], order: 'G' } }),
      rec({ entity: 'section', entityKey: 's3', op: 'create', fields: { footprintKey: 'f1', type: 'video', htmlContent: '<p>Pinguine</p>', p_clips: [{ label: 'v1' }], order: 'H' } }),
    ]);
    const album = sectionDocOf(state, 's2', 'j1', ['bkg']);
    expect(album?.type).toBe('album');
    expect((album?.properties as { images: { label: string }[] }).images.map((i) => i.label)).toEqual(['i1', 'i2']);
    const video = sectionDocOf(state, 's3', 'j1', ['bkg']);
    expect(video?.type).toBe('video');
    expect(video?.content.htmlContent).toBe('<p>Pinguine</p>');
    expect((video?.properties as { clips: { label: string }[] }).clips.map((i) => i.label)).toEqual(['v1']);
    expect(video).not.toHaveProperty('blockKind');
  });

  it('an archived section gives no doc', () => {
    const state = materialize([
      rec({ entity: 'section', entityKey: 's2', op: 'create', fields: { footprintKey: 'f1', type: 'album', order: 'G' } }),
      rec({ entity: 'section', entityKey: 's2', op: 'archive' }),
    ]);
    expect(sectionDocOf(state, 's2', 'j1', ['bkg'])).toBeUndefined();
  });

  it('conflictCopyDocOf names the original and the open conflict', () => {
    const state = materialize([
      rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', type: 'article', htmlContent: '<p>a</p>', order: 'G' } }),
    ]);
    const original = sectionViewOf(state[entityStateKey('section', 's1')]) as SectionView;
    const copy: SectionView = { ...original, key: 's1_c_x', htmlContent: '<p>b</p>', authorKey: 'barbara', conflictOf: 's1', conflict: true };
    const doc = conflictCopyDocOf(copy, 'f1', 'j1', ['bkg']);
    expect(doc).toMatchObject({ okey: 's1_c_x', type: 'article', authorKey: 'barbara', conflictOf: 's1', conflict: true, footprintKey: 'f1', journalKey: 'j1' });
    expect(doc.content.htmlContent).toBe('<p>b</p>');
  });

  it('an old block record without a type gives no doc', () => {
    const state = materialize([
      rec({ entity: 'section', entityKey: 'b1', op: 'create', fields: { footprintKey: 'f1', kind: 'text', html: '<p>alt</p>', order: 'G' } }),
    ]);
    expect(sectionDocOf(state, 'b1', 'j1', ['bkg'])).toBeUndefined();
  });

  it('imageDocOf stores bucket paths', () => {
    const state = materialize([
      rec({ entity: 'image', entityKey: 'i1', op: 'create', fields: { journalKey: 'j1', width: 2048, height: 1536, path2048: 'journals/j1/a-2048.jpg', path400: 'journals/j1/a-400.jpg', localIdentifier: 'L1' } }),
    ]);
    expect(imageDocOf(state, 'i1', 'j1', ['bkg'])).toEqual({
      okey: 'i1', tenants: ['bkg'], isArchived: false, journalKey: 'j1', authorKey: 'bruno', width: 2048, height: 1536,
      path2048: 'tenant/bkg/journal/j1/a-2048.jpg', path400: 'tenant/bkg/journal/j1/a-400.jpg',
    });
  });

  it('imageDocOf carries a clip\'s videoPath and durationSec, a photo has none', () => {
    const clip = materialize([
      rec({ entity: 'image', entityKey: 'v1', op: 'create', fields: { journalKey: 'j1', path2048: 'journals/j1/n-2048.jpg', path400: 'journals/j1/n-400.jpg', videoPath: 'journals/j1/n-video.mp4', durationSec: 12.3 } }),
      rec({ entity: 'image', entityKey: 'p1', op: 'create', fields: { journalKey: 'j1', path2048: 'journals/j1/a-2048.jpg', path400: 'journals/j1/a-400.jpg' } }),
    ]);
    const doc = imageDocOf(clip, 'v1', 'j1', ['bkg']);
    expect(doc?.videoPath).toBe('tenant/bkg/journal/j1/n-video.mp4');
    expect(doc?.durationSec).toBe(12.3);
    expect(imageDocOf(clip, 'p1', 'j1', ['bkg'])).not.toHaveProperty('videoPath');
    expect(imageDocOf(clip, 'p1', 'j1', ['bkg'])).not.toHaveProperty('durationSec');
  });

  it('imageDocOf builds paths from the trusted journal key, not the record field', () => {
    const state = materialize([
      rec({ entity: 'image', entityKey: 'v1', op: 'create', fields: { journalKey: 'other', path2048: 'journals/other/n-2048.jpg', path400: 'journals/other/n-400.jpg', videoPath: 'journals/other/n-video.mp4' } }),
    ]);
    const doc = imageDocOf(state, 'v1', 'j1', ['bkg']);
    expect(doc?.journalKey).toBe('j1');
    expect(doc?.path2048).toBe('tenant/bkg/journal/j1/n-2048.jpg');
    expect(doc?.videoPath).toBe('tenant/bkg/journal/j1/n-video.mp4');
  });

  it('imageDocOf omits a videoPath that is not an mp4 clip file name', () => {
    const state = materialize([
      rec({ entity: 'image', entityKey: 'e1', op: 'create', fields: { journalKey: 'j1', videoPath: 'journals/j1/evil.pdf' } }),
      rec({ entity: 'image', entityKey: 'e2', op: 'create', fields: { journalKey: 'j1', videoPath: 'journals/j1/../x-video.mp4' } }),
    ]);
    expect(imageDocOf(state, 'e1', 'j1', ['bkg'])).not.toHaveProperty('videoPath');
    // only the file name is kept, so a traversal prefix cannot leave the journal's folder
    expect(imageDocOf(state, 'e2', 'j1', ['bkg'])?.videoPath).toBe('tenant/bkg/journal/j1/x-video.mp4');
  });

  it("storagePath strips the device's journals/<jk>/ prefix", () => {
    expect(storagePath('bkg', 'j1', 'journals/j1/x-400.jpg')).toBe('tenant/bkg/journal/j1/x-400.jpg');
    expect(storagePath('bkg', 'j1', '')).toBe('');
  });
});
