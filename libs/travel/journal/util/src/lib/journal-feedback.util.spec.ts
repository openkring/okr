import { describe, expect, it } from 'vitest';
import { IMAGE_CONFIG_SHAPE, JournalChange, SECTION_FEEDBACK_DEFAULT } from '@okr/shared-models';
import { formatHlc } from './journal-hlc.util';
import { materialize, reactionKeyPerson } from './journal-merge.util';
import {
  commentCountOf, commentsOfParent, emojiCodepoints, FeedbackParent, feedbackOf, footprintReactionCount, imageTitle, isReactionActive, parentKeyOf,
  parseParentKey, reactionKey, reactionsOf, reactionWrite, summarizeReactions,
} from './journal-feedback.util';

/** The server's key guard (apply-journal-change.logic `isJournalKey`). */
const JOURNAL_KEY = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const PERSON = 'Xy3k9PqRt2LmN8vB4cDe'; // a Firestore auto id: 20 characters

let n = 0;
function rec(p: Pick<JournalChange, 'entity' | 'entityKey' | 'op'> & Partial<JournalChange>, wall: number, authorKey = 'bruno', deviceId = 'dev-a'): JournalChange {
  n += 1;
  return { id: `r${n}`, journalKey: 'j1', deviceId, seq: n, hlc: formatHlc({ wall, counter: 0, deviceId }), authorKey, fields: {}, ...p };
}

const S1: FeedbackParent = { kind: 'section', id: 's1' };
const reaction = (person: string, emoji: string, active: boolean, wall: number, op: 'create' | 'set' = 'create', deviceId = `dev-${person}`, parent = S1) =>
  rec({
    entity: 'reaction', entityKey: reactionKey(parent, person, emoji) ?? '', op,
    fields: { parentKey: parentKeyOf(parent), footprintKey: 'f1', emoji, active, createdAt: new Date(wall).toISOString() },
  }, wall, person, deviceId);

describe('journal feedback: parents', () => {
  it('parentKeyOf and parseParentKey round-trip a section and an image', () => {
    expect(parentKeyOf({ kind: 'section', id: 's1' })).toBe('section.s1');
    expect(parentKeyOf({ kind: 'image', id: 'i1' })).toBe('image.i1');
    expect(parseParentKey('section.s1')).toEqual({ kind: 'section', id: 's1' });
    expect(parseParentKey('image.i1')).toEqual({ kind: 'image', id: 'i1' });
  });

  it('parseParentKey refuses anything else: old page parents, unknown kinds, unsafe ids', () => {
    for (const bad of ['page.f1', 'section.', 'section', 'block.s1', 'section.a/b', 'image.a.b', '', 42, undefined, `section.${'x'.repeat(129)}`]) {
      expect(parseParentKey(bad)).toBeUndefined();
    }
  });
});

describe('journal feedback: reaction keys (Review Focus 2)', () => {
  it('emojiCodepoints: lower-case hex code points joined by -', () => {
    expect(emojiCodepoints('👍')).toBe('1f44d');
    expect(emojiCodepoints('❤️')).toBe('2764-fe0f');
    expect(emojiCodepoints('🇨🇭')).toBe('1f1e8-1f1ed');
    expect(emojiCodepoints('👍🏽')).toBe('1f44d-1f3fd');
    expect(emojiCodepoints('👨‍👩‍👧‍👦')).toBe('1f468-200d-1f469-200d-1f467-200d-1f466');
  });

  it('a reaction key is one per parent, person and emoji, and passes the server key guard', () => {
    const key = reactionKey({ kind: 'section', id: UUID }, PERSON, '❤️');
    expect(key).toBe(`r__section__${UUID}__${PERSON}__2764-fe0f`);
    expect(key).toMatch(JOURNAL_KEY);
    expect(reactionKey({ kind: 'image', id: UUID }, PERSON, '❤️')).not.toBe(key);
    expect(reactionKey({ kind: 'section', id: UUID }, PERSON, '👍')).not.toBe(key);
  });

  it('multi-codepoint emoji (flag, skin tone, family) on a uuid parent with a 20-character person key stay valid', () => {
    for (const emoji of ['🇨🇭', '👍🏽', '👨‍👩‍👧‍👦', '🏳️‍🌈', '❤️']) {
      const key = reactionKey({ kind: 'section', id: UUID }, PERSON, emoji);
      expect(key, emoji).toMatch(JOURNAL_KEY);
    }
  });

  it('a key that would break the guard is refused, never a record the server drops silently', () => {
    expect(reactionKey({ kind: 'section', id: UUID }, 'p'.repeat(80), '❤️')).toBeUndefined(); // > 128 characters
    expect(reactionKey({ kind: 'section', id: UUID }, PERSON, '👍'.repeat(20))).toBeUndefined();
    expect(reactionKey({ kind: 'section', id: UUID }, 'a/b', '❤️')).toBeUndefined();
    expect(reactionKey({ kind: 'section', id: UUID }, '', '❤️')).toBeUndefined();
    expect(reactionKey({ kind: 'section', id: UUID }, 'an__na', '❤️')).toBeUndefined(); // `__` separates the parts
    expect(reactionKey({ kind: 'section', id: UUID }, 'anna_', '❤️')).toBeUndefined(); // would merge into the separator
    expect(reactionKey({ kind: 'section', id: 's__1' }, PERSON, '❤️')).toBeUndefined();
    expect(reactionKey({ kind: 'section', id: UUID }, 'p_schaller_darinka', '❤️')).toBe(`r__section__${UUID}__p_schaller_darinka__2764-fe0f`);
    expect(reactionKey({ kind: 'section', id: UUID }, PERSON, '')).toBeUndefined();
    expect(reactionKey({ kind: 'section', id: 'a.b' }, PERSON, '❤️')).toBeUndefined();
  });

  it('plain text is not an emoji; a keycap is', () => {
    expect(reactionKey(S1, PERSON, 'abc')).toBeUndefined();
    expect(reactionKey(S1, PERSON, ' ')).toBeUndefined();
    expect(reactionKey(S1, PERSON, '1')).toBeUndefined();
    expect(reactionKey(S1, PERSON, '👍<b>')).toBeUndefined();
    expect(reactionKey(S1, PERSON, '1️⃣')).toBe(`r__section__s1__${PERSON}__31-fe0f-20e3`);
  });
});

describe('journal feedback: reactions toggle (Review Focus 1)', () => {
  it('a set without its create is invisible: the first toggle must be a create', () => {
    expect(reactionsOf(materialize([reaction('anna', '❤️', true, 100, 'set')]), 'section.s1', 'anna')).toEqual([]);
  });

  it('reactionWrite: create while unknown on this device, set once the create is known', () => {
    const first = reactionWrite({}, S1, 'f1', 'anna', '❤️', true, '2027-01-01T00:00:00Z');
    expect(first).toEqual({
      entityKey: reactionKey(S1, 'anna', '❤️'), op: 'create',
      fields: { parentKey: 'section.s1', footprintKey: 'f1', emoji: '❤️', active: true, createdAt: '2027-01-01T00:00:00Z' },
    });
    const state = materialize([reaction('anna', '❤️', true, 100)]);
    expect(reactionWrite(state, S1, 'f1', 'anna', '❤️', false, '2027-01-01T00:00:01Z')?.op).toBe('set');
    expect(reactionWrite(state, S1, 'f1', 'a/b', '❤️', true, '2027-01-01T00:00:01Z')).toBeUndefined();
  });

  it('remove and re-add the same emoji on one device: it is on again', () => {
    const records = [reaction('anna', '❤️', true, 100), reaction('anna', '❤️', false, 200, 'set'), reaction('anna', '❤️', true, 300, 'set')];
    const state = materialize(records);
    expect(reactionsOf(state, 'section.s1', 'anna')).toEqual([{ emoji: '❤️', count: 1, mine: true }]);
    expect(isReactionActive(state, reactionKey(S1, 'anna', '❤️') ?? '')).toBe(true);
    expect(reactionsOf(materialize([...records].reverse()), 'section.s1', 'anna')).toEqual([{ emoji: '❤️', count: 1, mine: true }]);
  });

  it('two iPads of one author add offline, one removes later: the newest write decides', () => {
    const records = [
      reaction('bruno', '👍', true, 100, 'create', 'ipad-1'),
      reaction('bruno', '👍', true, 110, 'create', 'ipad-2'), // never saw ipad-1's create
      reaction('bruno', '👍', false, 120, 'set', 'ipad-1'),
    ];
    expect(reactionsOf(materialize(records), 'section.s1', 'bruno')).toEqual([]);
    expect(reactionsOf(materialize([...records].reverse()), 'section.s1', 'bruno')).toEqual([]);
  });

  it('one iPad removes while the other removes and re-adds later: never stuck off', () => {
    const synced = reaction('bruno', '👍', true, 100, 'create', 'ipad-1');
    const offline = [
      reaction('bruno', '👍', false, 200, 'set', 'ipad-1'),
      reaction('bruno', '👍', false, 150, 'set', 'ipad-2'),
      reaction('bruno', '👍', true, 250, 'set', 'ipad-2'),
    ];
    for (const order of [[synced, ...offline], [...offline, synced], [offline[2], synced, offline[0], offline[1]]]) {
      expect(reactionsOf(materialize(order), 'section.s1', 'bruno')).toEqual([{ emoji: '👍', count: 1, mine: true }]);
    }
    // and the other way round: the removal is newer
    const removedLast = [synced, reaction('bruno', '👍', true, 200, 'set', 'ipad-2'), reaction('bruno', '👍', false, 300, 'set', 'ipad-1')];
    expect(reactionsOf(materialize(removedLast), 'section.s1', 'bruno')).toEqual([]);
  });

  it('only the owner toggles: another person writing to someone else\'s reaction key changes nothing', () => {
    const key = reactionKey(S1, 'anna', '❤️') ?? '';
    const state = materialize([
      reaction('anna', '❤️', true, 100),
      rec({ entity: 'reaction', entityKey: key, op: 'set', fields: { active: false } }, 200, 'eva', 'dev-eva'),
      rec({ entity: 'reaction', entityKey: key, op: 'archive' }, 300, 'eva', 'dev-eva'),
    ]);
    expect(reactionsOf(state, 'section.s1', 'eva')).toEqual([{ emoji: '❤️', count: 1, mine: false }]);
  });
});

describe('journal feedback: the owner is the person in the key', () => {
  it('reactionKeyPerson reads the person back, also behind a parent id with _', () => {
    expect(reactionKeyPerson(reactionKey(S1, 'anna', '❤️') ?? '')).toBe('anna');
    expect(reactionKeyPerson(reactionKey({ kind: 'section', id: 's1_c_000_x' }, PERSON, '👨‍👩‍👧‍👦') ?? '')).toBe(PERSON);
    expect(reactionKeyPerson('f1_anna')).toBeUndefined();
    expect(reactionKeyPerson('r__page__f1__anna__2764')).toBeUndefined();
    expect(reactionKeyPerson('r_section_s1_anna_2764')).toBeUndefined(); // the single-underscore format of the first draft
    expect(reactionKeyPerson(reactionKey(S1, 'p_schaller_darinka', '👍') ?? '')).toBe('p_schaller_darinka');
  });

  it('a foreign create with an early clock on anna\'s key is ignored; anna\'s toggles keep working, in any order', () => {
    const key = reactionKey(S1, 'anna', '❤️') ?? '';
    const hijack = rec({
      entity: 'reaction', entityKey: key, op: 'create',
      fields: { parentKey: 'section.s1', footprintKey: 'f1', emoji: '❤️', active: true, createdAt: '1970-01-01T00:00:00.001Z' },
    }, 1, 'eva', 'dev-eva');
    const own = [reaction('anna', '❤️', true, 100), reaction('anna', '❤️', false, 200, 'set')];
    for (const order of [[hijack, ...own], [...own, hijack]]) {
      const state = materialize(order);
      expect(state[`reaction:${key}`]?.ownerKey).toBe('anna');
      expect(reactionsOf(state, 'section.s1', 'anna')).toEqual([]);
      const readd = reactionWrite(state, S1, 'f1', 'anna', '❤️', true, '2027-01-01T00:00:00Z');
      expect(readd?.op).toBe('set');
      const after = materialize([...order, rec({ entity: 'reaction', entityKey: key, op: 'set', fields: { ...readd?.fields } }, 300, 'anna', 'dev-anna')]);
      expect(reactionsOf(after, 'section.s1', 'eva')).toEqual([{ emoji: '❤️', count: 1, mine: false }]);
    }
    // before anna ever reacts, the foreign create alone shows nothing
    expect(reactionsOf(materialize([hijack]), 'section.s1', 'eva')).toEqual([]);
  });

  it('a person key with single underscores (a diary-import id) reacts, removes and re-adds', () => {
    const P = 'p_schaller_darinka';
    const records = [reaction(P, '❤️', true, 100), reaction(P, '❤️', false, 200, 'set'), reaction(P, '❤️', true, 300, 'set')];
    expect(records[0].entityKey).toBe(`r__section__s1__${P}__2764-fe0f`);
    expect(reactionsOf(materialize(records.slice(0, 2)), 'section.s1', P)).toEqual([]);
    expect(reactionsOf(materialize(records), 'section.s1', P)).toEqual([{ emoji: '❤️', count: 1, mine: true }]);
    expect(reactionsOf(materialize([...records].reverse()), 'section.s1', P)).toEqual([{ emoji: '❤️', count: 1, mine: true }]);
  });

  it('an r_ key that does not parse takes no records', () => {
    const state = materialize([rec({ entity: 'reaction', entityKey: 'r_bogus', op: 'create', fields: { active: true, emoji: '❤️', parentKey: 'section.s1' } }, 100, 'anna', 'dev-anna')]);
    expect(state['reaction:r_bogus']).toBeUndefined();
  });

  it('a record whose fields disagree with its key is not counted', () => {
    const key = reactionKey(S1, 'anna', '❤️') ?? '';
    const wrong = (fields: Record<string, unknown>) => materialize([rec({
      entity: 'reaction', entityKey: key, op: 'create',
      fields: { parentKey: 'section.s1', footprintKey: 'f1', emoji: '❤️', active: true, createdAt: 'x', ...fields },
    }, 100, 'anna', 'dev-anna')]);
    expect(reactionsOf(wrong({ parentKey: 'section.s2' }), 'section.s2', 'anna')).toEqual([]);
    expect(reactionsOf(wrong({ emoji: '👍' }), 'section.s1', 'anna')).toEqual([]);
    expect(footprintReactionCount(wrong({ emoji: '👍' }), 'f1')).toBe(0);
    expect(reactionsOf(wrong({}), 'section.s1', 'anna')).toEqual([{ emoji: '❤️', count: 1, mine: true }]);
  });
});

describe('journal feedback: summaries', () => {
  it('reactionsOf counts active reactions per emoji, marks mine, ordered by first use; other parents apart', () => {
    const state = materialize([
      reaction('anna', '❤️', true, 100),
      reaction('bruno', '👍', true, 200),
      reaction('eva', '❤️', true, 300),
      reaction('beat', '😂', true, 400),
      reaction('beat', '😂', false, 500, 'set'),
      reaction('eva', '👍', true, 600, 'create', 'dev-eva', { kind: 'image', id: 'i1' }),
    ]);
    expect(reactionsOf(state, 'section.s1', 'eva')).toEqual([
      { emoji: '❤️', count: 2, mine: true },
      { emoji: '👍', count: 1, mine: false },
    ]);
    expect(reactionsOf(state, 'image.i1', 'eva')).toEqual([{ emoji: '👍', count: 1, mine: true }]);
    expect(reactionsOf(state, 'section.s2', 'eva')).toEqual([]);
  });

  it('summarizeReactions works on plain rows (the server reads the materialised docs)', () => {
    expect(summarizeReactions([
      { emoji: '👍', personKey: 'b', createdAt: '2027-01-02' },
      { emoji: '❤️', personKey: 'a', createdAt: '2027-01-01' },
      { emoji: '👍', personKey: 'a', createdAt: '2027-01-03' },
    ], 'a')).toEqual([{ emoji: '❤️', count: 1, mine: true }, { emoji: '👍', count: 2, mine: true }]);
  });

  it('an old footprint like is not an emoji reaction', () => {
    const state = materialize([rec({ entity: 'reaction', entityKey: 'f1_anna', op: 'create', fields: { footprintKey: 'f1', type: 'like' } }, 100, 'anna', 'dev-anna')]);
    expect(reactionsOf(state, 'section.s1', 'anna')).toEqual([]);
    expect(footprintReactionCount(state, 'f1')).toBe(0);
  });

  it('footprintReactionCount: active reactions of every parent within the footprint, any emoji', () => {
    const state = materialize([
      reaction('anna', '❤️', true, 100),
      reaction('bruno', '👍', true, 200, 'create', 'dev-bruno', { kind: 'image', id: 'i1' }),
      reaction('eva', '😂', true, 300),
      reaction('eva', '😂', false, 400, 'set'),
      rec({ entity: 'reaction', entityKey: reactionKey(S1, 'beat', '❤️') ?? '', op: 'create', fields: { parentKey: 'section.s1', footprintKey: 'f2', emoji: '❤️', active: true } }, 500, 'beat', 'dev-beat'),
    ]);
    expect(footprintReactionCount(state, 'f1')).toBe(2);
    expect(footprintReactionCount(state, 'f2')).toBe(1);
  });

  const comment = (key: string, parentKey: string, text: string, createdAt: string, author = 'anna', wall = 100) =>
    rec({ entity: 'comment', entityKey: key, op: 'create', fields: { parentKey, footprintKey: 'f1', text, authorName: author.toUpperCase(), createdAt } }, wall, author, `dev-${author}`);

  it('commentsOfParent: per parent, oldest first, mine marked, archived gone, a non-owner archive ignored', () => {
    const state = materialize([
      comment('c2', 'section.s1', 'zwei', '2027-01-14T10:00:00Z', 'anna'),
      comment('c1', 'section.s1', 'eins', '2027-01-14T09:00:00Z', 'bruno'),
      comment('c3', 'image.i1', 'bild', '2027-01-14T09:30:00Z', 'anna'),
      comment('c4', 'section.s1', 'weg', '2027-01-14T11:00:00Z', 'anna'),
      rec({ entity: 'comment', entityKey: 'c4', op: 'archive' }, 200, 'anna', 'dev-anna'),
      comment('c5', 'section.s1', 'bleibt', '2027-01-14T12:00:00Z', 'anna'),
      rec({ entity: 'comment', entityKey: 'c5', op: 'archive' }, 300, 'eva', 'dev-eva'),
    ]);
    expect(commentsOfParent(state, 'section.s1', 'anna')).toEqual([
      { key: 'c1', parentKey: 'section.s1', footprintKey: 'f1', authorKey: 'bruno', authorName: 'BRUNO', text: 'eins', createdAt: '2027-01-14T09:00:00Z', mine: false },
      { key: 'c2', parentKey: 'section.s1', footprintKey: 'f1', authorKey: 'anna', authorName: 'ANNA', text: 'zwei', createdAt: '2027-01-14T10:00:00Z', mine: true },
      { key: 'c5', parentKey: 'section.s1', footprintKey: 'f1', authorKey: 'anna', authorName: 'ANNA', text: 'bleibt', createdAt: '2027-01-14T12:00:00Z', mine: true },
    ]);
    expect(commentCountOf(state, 'section.s1')).toBe(3);
    expect(commentCountOf(state, 'image.i1')).toBe(1);
    expect(commentCountOf(state, 'image.i2')).toBe(0);
  });
});

describe('journal feedback: switches and image titles', () => {
  it('feedbackOf: absent = all on; a stored value wins per switch; the hero takes none', () => {
    expect(feedbackOf({ type: 'article' })).toEqual(SECTION_FEEDBACK_DEFAULT);
    expect(feedbackOf({ type: 'album', feedback: { ...SECTION_FEEDBACK_DEFAULT, imageReactions: false } }))
      .toEqual({ comments: true, reactions: true, imageComments: true, imageReactions: false });
    expect(feedbackOf({ type: 'hero', feedback: SECTION_FEEDBACK_DEFAULT }))
      .toEqual({ comments: false, reactions: false, imageComments: false, imageReactions: false });
  });

  it('feedbackOf: only an article or album has images to comment on', () => {
    expect(feedbackOf({ type: 'video' })).toEqual({ comments: true, reactions: true, imageComments: false, imageReactions: false });
  });

  it('feedbackOf: a partial stored value keeps the missing switches on', () => {
    expect(feedbackOf({ type: 'article', feedback: { comments: false } as never })).toEqual({ ...SECTION_FEEDBACK_DEFAULT, comments: false });
  });

  it('imageTitle: the caption, else the alt text, else «Foto n» counted from 1', () => {
    const label = (i: number) => `Foto ${i}`;
    const image = { ...IMAGE_CONFIG_SHAPE, label: 'i1', url: '', altText: '', overlay: '' };
    expect(imageTitle({ ...image, overlay: ' Am Hafen ', altText: 'Boote' }, 0, label)).toBe('Am Hafen');
    expect(imageTitle({ ...image, altText: 'Boote' }, 0, label)).toBe('Boote');
    expect(imageTitle({ ...image, overlay: '  ' }, 2, label)).toBe('Foto 3');
  });
});
