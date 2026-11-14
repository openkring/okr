import { describe, expect, it } from 'vitest';
import { JournalChange } from '@okr/shared-models';
import { conflictCopyKey, formatHlc, reactionKey } from '@okr/travel-journal-util';

import { isBookMapFileName, isJournalFileName, journalObjectPath, uploadHeadersFor, mayOverwrite, planEntityWrite, planFootprintSections, peerSecretTenants, planPeerSecret, planSectionWrites, StoredRecord } from './apply-journal-change.logic';

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

  it('a second create of a section by another author keeps the first owner and the later html', () => {
    const records = [
      rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', type: 'article', htmlContent: '<p>Bruno</p>', order: 'V' } }),
      rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', type: 'article', htmlContent: '<p>Barbara</p>', order: 'V' } }, 'dev-b', 'barbara'),
    ];
    const write = planEntityWrite(records, 'j1', 'section', 's1', ['bkg']);
    expect(write?.path).toBe('journals/j1/sections/s1');
    expect(write?.data).toMatchObject({ authorKey: 'bruno', content: { htmlContent: '<p>Barbara</p>' } });
  });

  describe('track entity (1.154 phase 5)', () => {
    const key = 'trk__trip1';
    const fields = {
      journalKey: 'j1', tripKey: 'trip1', name: 'Uetliberg', startedAt: '2026-11-01T08:00:00Z', endedAt: '2026-11-01T14:00:00Z', distanceM: 14123,
      durationS: 21600, modes: ['foot'], sections: [{ mode: 'foot', distanceM: 14123, encoded: '_p~iF~ps|U', heartRateAvg: 120 }],
      photos: [{ imageKey: 'img-a1', lat: 47.4, lng: 8.5, takenAt: '2026-11-01T09:00:00Z' }], steps: 12000, strokes: 900, crew: ['p_anna'],
    };

    it('a track materialises to journals/{jk}/tracks/{key}, allow-listed', () => {
      const write = planEntityWrite([rec({ entity: 'track', entityKey: key, op: 'create', fields })], 'j1', 'track', key, ['bka']);
      expect(write?.path).toBe('journals/j1/tracks/trk__trip1');
      expect(write?.data).toMatchObject({ okey: key, tenants: ['bka'], isArchived: false, journalKey: 'j1', authorKey: 'bruno', name: 'Uetliberg', distanceM: 14123 });
      expect(write?.data['sections']).toEqual([{ mode: 'foot', distanceM: 14123, encoded: '_p~iF~ps|U' }]);
      expect(JSON.stringify(write?.data)).not.toMatch(/heart|steps|stroke|crew/);
    });

    it('a set waits for its create; an archive writes isArchived', () => {
      const set = rec({ entity: 'track', entityKey: key, op: 'set', fields: { name: 'neu' } });
      expect(planEntityWrite([set], 'j1', 'track', key, ['bka'])).toBeUndefined();
      const create = rec({ entity: 'track', entityKey: key, op: 'create', fields });
      const archive = rec({ entity: 'track', entityKey: key, op: 'archive' });
      expect(planEntityWrite([create, archive], 'j1', 'track', key, ['bka'])).toEqual({ path: 'journals/j1/tracks/trk__trip1', data: { isArchived: true } });
    });

    it('a key with a slash writes nothing', () => {
      expect(planEntityWrite([rec({ entity: 'track', entityKey: 'trk__a/b', op: 'create', fields })], 'j1', 'track', 'trk__a/b', ['bka'])).toBeUndefined();
    });
  });

  describe('conflict copies', () => {
    const create = () => rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', type: 'article', htmlContent: '<p>C</p>', order: 'V' }, bases: {} });
    const edit = (html: string, base: string, deviceId: string, authorKey: string, entityKey = 's1') =>
      rec({ entity: 'section', entityKey, op: 'set', fields: { htmlContent: html }, bases: { htmlContent: base } }, deviceId, authorKey);

    it('concurrent section edits produce a copy doc', () => {
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

    it('a losing record that changed several content keys writes one copy doc with all its lost values', () => {
      const c = create();
      const multi = (html: string, image: string, deviceId: string, authorKey: string) =>
        rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { htmlContent: html, p_images: [{ label: image }] }, bases: { htmlContent: c.change.hlc, p_images: '' } }, deviceId, authorKey);
      const anna = multi('<p>Anna</p>', 'a1', 'dev-b', 'anna');
      const bruno = multi('<p>Bruno</p>', 'b1', 'dev-a', 'bruno');
      const copyKey = conflictCopyKey('s1', anna.change.hlc);
      const writes = planSectionWrites([c, anna, bruno], 'j1', 's1', ['bkg'], []).writes;
      expect(writes.map((w) => w.path)).toEqual(['journals/j1/sections/s1', `journals/j1/sections/${copyKey}`]);
      const copy = writes[1].data as { content: { htmlContent: string }; properties: { images: { label: string }[] } };
      expect(copy.content.htmlContent).toBe('<p>Anna</p>');
      expect(copy.properties.images.map((i) => i.label)).toEqual(['a1']);
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

    it('a copy is written conflict: true while its original lives and conflict: false after the original\'s archive', () => {
      const c = create();
      const anna = edit('<p>Anna</p>', c.change.hlc, 'dev-b', 'anna');
      const bruno = edit('<p>Bruno</p>', c.change.hlc, 'dev-a', 'bruno');
      const copyKey = conflictCopyKey('s1', anna.change.hlc);
      const open = planSectionWrites([c, anna, bruno], 'j1', 's1', ['bkg'], []).writes;
      expect(open.find((w) => w.path.endsWith(copyKey))?.data).toMatchObject({ conflictOf: 's1', conflict: true });
      const gone = rec({ entity: 'section', entityKey: 's1', op: 'archive', bases: {} });
      const after = planSectionWrites([c, anna, bruno, gone], 'j1', 's1', ['bkg'], [copyKey]).writes;
      expect(after[0].data).toEqual({ isArchived: true });
      expect(after.find((w) => w.path.endsWith(copyKey))?.data).toMatchObject({
        conflictOf: 's1', conflict: false, isArchived: false, content: { htmlContent: '<p>Anna</p>' },
      });
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

    it('a section without concurrent edits writes only itself', () => {
      expect(planSectionWrites([create()], 'j1', 's1', ['bkg'], []).writes.map((w) => w.path)).toEqual(['journals/j1/sections/s1']);
    });

    it('an old block record without a type writes nothing (spec 1.154 decision 4)', () => {
      const block = rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', kind: 'text', html: '<p>alt</p>', order: 'V' }, bases: {} });
      const later = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { html: '<p>neu</p>' }, bases: { html: block.change.hlc } });
      expect(planSectionWrites([block, later], 'j1', 's1', ['bkg'], [])).toEqual({ writes: [] });
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

  it('the footprint lists its hero first, whatever its order', () => {
    expect(planFootprintSections('j1', 'f1', [
      { okey: 'sA', order: 'G', type: 'article' }, { okey: 'sH', order: 'V', type: 'hero' },
    ])).toEqual({ path: 'journals/j1/footprints/f1', data: { sections: ['sH', 'sA'] } });
  });

  it('a hero record writes a CMS hero section doc', () => {
    const hero = rec({ entity: 'section', entityKey: 'h1', op: 'create', fields: { footprintKey: 'f1', type: 'hero', title: '', htmlContent: '', p_hero: { label: 'i1' }, p_overlay: { title: true }, order: 'A' } });
    const { writes, footprintKey } = planSectionWrites([hero], 'j1', 'h1', ['bkg'], []);
    expect(footprintKey).toBe('f1');
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe('journals/j1/sections/h1');
    expect(writes[0].data).toMatchObject({
      okey: 'h1', type: 'hero', journalKey: 'j1', footprintKey: 'f1', authorKey: 'bruno', order: 'A', isArchived: false,
      properties: { hero: { label: 'i1', url: '' }, overlay: { title: true } },
    });
    expect(writes[0].data).not.toHaveProperty('blockKind');
  });

  it('a key with a path separator is never written', () => {
    const create = rec({ entity: 'section', entityKey: 'x/../y', op: 'create', fields: { footprintKey: 'f1', type: 'article' } });
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

  it('a comment on a section and an emoji reaction toggled off are materialised (1.154 phase 4)', () => {
    const comment = rec({ entity: 'comment', entityKey: 'c2', op: 'create', fields: { parentKey: 'section.s1', footprintKey: 'f1', text: 'Toll', authorName: 'Anna', createdAt: '2027-01-14T10:00:00Z' } }, 'guest-anna', 'anna');
    expect(planEntityWrite([comment], 'j1', 'comment', 'c2', ['bkg'])).toMatchObject({ path: 'journals/j1/comments/c2', data: { parentKey: 'section.s1', authorKey: 'anna' } });
    const key = reactionKey({ kind: 'section', id: 's1' }, 'anna', '👍') as string;
    const fields = { parentKey: 'section.s1', footprintKey: 'f1', emoji: '👍', createdAt: '2027-01-14T10:00:00Z' };
    const on = rec({ entity: 'reaction', entityKey: key, op: 'create', fields: { ...fields, active: true } }, 'guest-anna', 'anna');
    const off = rec({ entity: 'reaction', entityKey: key, op: 'set', fields: { ...fields, active: false } }, 'guest-anna', 'anna');
    expect(planEntityWrite([on], 'j1', 'reaction', key, ['bkg'])).toMatchObject({ path: `journals/j1/reactions/${key}`, data: { emoji: '👍', personKey: 'anna', isArchived: false } });
    expect(planEntityWrite([on, off], 'j1', 'reaction', key, ['bkg'])?.data).toMatchObject({ emoji: '👍', parentKey: 'section.s1', isArchived: true });
    // another person's record on Anna's key is not admitted: nothing is written
    const foreign = rec({ entity: 'reaction', entityKey: key, op: 'create', fields: { ...fields, active: true } }, 'guest-mallory', 'mallory');
    expect(planEntityWrite([foreign], 'j1', 'reaction', key, ['bkg'])).toBeUndefined();
  });

  it('sign rejects a path outside the journal', () => {
    expect(isJournalFileName('a1b2-2048.jpg')).toBe(true);
    expect(isJournalFileName('../other/a.jpg')).toBe(false);
    expect(isJournalFileName('journals/j1/a.jpg')).toBe(false);
    expect(isJournalFileName('a.png')).toBe(false);
    expect(isJournalFileName('ab-video.mp4')).toBe(true);
    expect(isJournalFileName('ab.mp4')).toBe(false);
    expect(isJournalFileName('../x-video.mp4')).toBe(false);
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

describe('uploadHeadersFor', () => {
  it('binds a photo to image/jpeg and a clip to video/mp4', () => {
    expect(uploadHeadersFor('a-2048.jpg')).toEqual({ 'Content-Type': 'image/jpeg', 'x-goog-content-length-range': '0,15728640' });
    expect(uploadHeadersFor('ab-video.mp4')).toEqual({ 'Content-Type': 'video/mp4', 'x-goog-content-length-range': '0,9000000' });
  });
});

describe('planPeerSecret (spec 1.154 §9, ruling R13)', () => {
  const peer = (issuedTo?: unknown) => (issuedTo === undefined ? { secret: 's' } : { secret: 's', issuedTo });

  it('rotates when the secret was issued to someone who is no longer an author', () => {
    expect(planPeerSecret(peer(['bruno', 'anna']), { authorKeys: ['bruno'] })).toEqual({ action: 'rotate', issuedTo: ['bruno'] });
  });

  it('keeps rotating on every run until the secret doc matches (a crash before the secret write is repaired)', () => {
    const stale = peer(['bruno', 'anna']);
    expect(planPeerSecret(stale, { authorKeys: ['bruno'] }).action).toBe('rotate');
    expect(planPeerSecret(stale, { authorKeys: ['bruno', 'tom'] })).toEqual({ action: 'rotate', issuedTo: ['bruno', 'tom'] });
  });

  it('records added authors without rotating', () => {
    expect(planPeerSecret(peer(['bruno']), { authorKeys: ['bruno', 'anna'] })).toEqual({ action: 'record', issuedTo: ['bruno', 'anna'] });
  });

  it('does nothing when the secret was issued to exactly the current authors', () => {
    expect(planPeerSecret(peer(['anna', 'bruno']), { authorKeys: ['bruno', 'anna'] })).toEqual({ action: 'none' });
  });

  it('treats a secret without issuedTo (before 1.154) as issued to the current authors: record, no rotation', () => {
    expect(planPeerSecret(peer(), { authorKeys: ['bruno', 'anna'] })).toEqual({ action: 'record', issuedTo: ['bruno', 'anna'] });
    expect(planPeerSecret(peer('bruno'), { authorKeys: ['bruno'] })).toEqual({ action: 'record', issuedTo: ['bruno'] });
  });

  it('does nothing for an archived journal (no authorKeys)', () => {
    expect(planPeerSecret(peer(['bruno', 'anna']), { isArchived: true })).toEqual({ action: 'none' });
    expect(planPeerSecret(peer(['bruno']), undefined)).toEqual({ action: 'none' });
  });

  it('creates a missing secret only when asked (ensureJournalPeerSecret), issued to the current authors', () => {
    expect(planPeerSecret(undefined, { authorKeys: ['bruno'] })).toEqual({ action: 'none' });
    expect(planPeerSecret({ secret: '' }, { authorKeys: ['bruno'] }, true)).toEqual({ action: 'create', issuedTo: ['bruno'] });
  });

  it('ignores malformed keys', () => {
    expect(planPeerSecret(peer(['bruno', 7, '']), { authorKeys: ['bruno', ''] })).toEqual({ action: 'none' });
  });

  it('denies a caller who is not an author in the journal doc read with the secret (removed after the auth check)', () => {
    // X passed requireJournalAuthor, then the apply function removed X and rotated: X must not get the new secret
    expect(planPeerSecret(peer(['bruno']), { authorKeys: ['bruno'] }, true, 'x')).toEqual({ action: 'denied' });
    expect(planPeerSecret(undefined, { isArchived: true }, true, 'bruno')).toEqual({ action: 'denied' });
  });

  it('decides as usual for a caller who is still an author', () => {
    expect(planPeerSecret(peer(['bruno']), { authorKeys: ['bruno'] }, true, 'bruno')).toEqual({ action: 'none' });
    expect(planPeerSecret(undefined, { authorKeys: ['bruno'] }, true, 'bruno')).toEqual({ action: 'create', issuedTo: ['bruno'] });
  });
});

describe('peerSecretTenants', () => {
  it("takes the journal's tenants, else the fallback", () => {
    expect(peerSecretTenants({ tenants: ['bkg'] }, ['scs'])).toEqual(['bkg']);
    expect(peerSecretTenants({ tenants: [] }, ['scs'])).toEqual(['scs']);
    expect(peerSecretTenants(undefined, ['scs'])).toEqual(['scs']);
  });
});
