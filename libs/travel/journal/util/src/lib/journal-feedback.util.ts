import { ImageConfig, SECTION_FEEDBACK_DEFAULT, SectionFeedback, SectionModel } from '@okr/shared-models';
import { entityStateKey, JournalState, reactionKeyPerson, viewOf } from './journal-merge.util';
import { storedFeedback } from './journal-section.util';

/**
 * Comments and emoji reactions on journal sections and images (spec 1.154 §7, phase-4 plan decisions 1–3, 6).
 *
 * Both stay change records (entities `comment`, `reaction`). Their record fields are the contract:
 * - comment `{ parentKey, footprintKey, text, authorName, createdAt }` (key: a random uuid; delete = `archive`);
 * - reaction `{ parentKey, footprintKey, emoji, active, createdAt }` (key: `reactionKey`; toggled with `active`, never
 *   archived — an archive is a one-way tombstone, so a removed emoji could never come back).
 * `parentKey` is `section.<sectionKey>` or `image.<imageKey>`; `footprintKey` keeps the author notifications, the guest
 * digest and the photo book grouping by footprint. Both entities are owned: only the creator's values count.
 */
export type FeedbackParentKind = 'section' | 'image';
export interface FeedbackParent { kind: FeedbackParentKind; id: string }

// type aliases, not interfaces: they must stay assignable to `JournalChange.fields` (Record<string, unknown>)
export type CommentRecordFields = { parentKey: string; footprintKey: string; text: string; authorName: string; createdAt: string };
export type ReactionRecordFields = { parentKey: string; footprintKey: string; emoji: string; active: boolean; createdAt: string };

/** The server's key guard (`isJournalKey` in apply-journal-change.logic): one safe Firestore path segment. */
const JOURNAL_KEY = /^[A-Za-z0-9_-]{1,128}$/;
const PARENT_KEY = /^(section|image)\.([A-Za-z0-9_-]{1,128})$/;

export function parentKeyOf(parent: FeedbackParent): string {
  return `${parent.kind}.${parent.id}`;
}

/** `section.<key>` / `image.<key>` with a journal-safe key; anything else (an old `page.<key>`) is undefined. */
export function parseParentKey(value: unknown): FeedbackParent | undefined {
  if (typeof value !== 'string') return undefined;
  const match = PARENT_KEY.exec(value);
  return match ? { kind: match[1] as FeedbackParentKind, id: match[2] } : undefined;
}

/** An emoji's code points as lower-case hex joined by `-` (`❤️` → `2764-fe0f`, `🇨🇭` → `1f1e8-1f1ed`). */
export function emojiCodepoints(emoji: string): string {
  return Array.from(emoji).map((c) => (c.codePointAt(0) ?? 0).toString(16)).join('-');
}

/**
 * At least one pictographic, regional-indicator (flag) or keycap code point; no letters, no whitespace and no ASCII
 * but the keycap bases `0-9 # *`. Loose on purpose: the picker's emoji vary by Unicode version.
 */
function isEmoji(value: string): boolean {
  return /[\p{Extended_Pictographic}\p{Regional_Indicator}⃣]/u.test(value)
    && !/[\p{L}\p{Z}\s]/u.test(value) && !/[\x00-\x22\x24-\x29\x2B-\x2F\x3A-\x7F]/.test(value); // eslint-disable-line no-control-regex
}

/**
 * A reaction's entity key, `r__<kind>__<parentId>__<personKey>__<codepoints>` (plan decision 2, ruling R1): one reaction per parent,
 * person and emoji. `undefined` when the emoji is not one, a part holds the `__` separator (or starts or ends with
 * `_`, which would merge into it) or a character outside `[A-Za-z0-9_-]`, or the key is longer than 128 characters (the
 * server's key guard): the caller refuses instead of writing a record the server drops. Single underscores in a person
 * key (`p_schaller_darinka`) are fine. With a uuid parent (36) and a 20-character person key the code points have 56
 * characters.
 */
export function reactionKey(parent: FeedbackParent, personKey: string, emoji: string): string | undefined {
  // the merge reads the person back from the key (reactionKeyPerson) and drops anyone else's records: no part may hold the `__` separator
  if (!isEmoji(emoji) || !parseParentKey(parentKeyOf(parent))) return undefined;
  if ([parent.id, personKey].some((part) => part === '' || part.includes('__') || !JOURNAL_KEY.test(part))) return undefined;
  const key = `r__${parent.kind}__${parent.id}__${personKey}__${emojiCodepoints(emoji)}`;
  return JOURNAL_KEY.test(key) && reactionKeyPerson(key) === personKey ? key : undefined;
}

/** Whether a reaction is on: created, its owner's latest `active` is true. */
export function isReactionActive(state: JournalState, key: string): boolean {
  return viewOf(state[entityStateKey('reaction', key)])?.['active'] === true;
}

export interface ReactionWrite { entityKey: string; op: 'create' | 'set'; fields: ReactionRecordFields }

/**
 * The record that switches a person's reaction on or off. The merge shows an entity only once a `create` arrived
 * (a `set` alone stays invisible, on the device and on the server), so the write is a `create` while this state does
 * not know the reaction, else a `set`. Two devices that both write a `create` are harmless: the key names the person,
 * the merge admits only that person's records (reactionKeyPerson), and their latest `active` wins either way.
 */
export function reactionWrite(
  state: JournalState, parent: FeedbackParent, footprintKey: string, personKey: string, emoji: string, active: boolean, createdAt: string,
): ReactionWrite | undefined {
  const entityKey = reactionKey(parent, personKey, emoji);
  if (!entityKey) return undefined;
  const known = state[entityStateKey('reaction', entityKey)]?.created === true;
  return { entityKey, op: known ? 'set' : 'create', fields: { parentKey: parentKeyOf(parent), footprintKey, emoji, active, createdAt } };
}

export interface ReactionSummary { emoji: string; count: number; mine: boolean }

/** One active reaction as a plain row: the device reads it from the change log, the server from the reaction docs. */
export interface ReactionRow { emoji: string; personKey: string; createdAt: string }

/** Counts per emoji, `mine` when `me` is among them, ordered by first use (earliest `createdAt`, then emoji). */
export function summarizeReactions(rows: ReactionRow[], me: string): ReactionSummary[] {
  const byEmoji = new Map<string, { emoji: string; count: number; mine: boolean; first: string }>();
  for (const row of rows) {
    const entry = byEmoji.get(row.emoji) ?? { emoji: row.emoji, count: 0, mine: false, first: row.createdAt };
    entry.count += 1;
    if (row.personKey === me) entry.mine = true;
    if (row.createdAt < entry.first) entry.first = row.createdAt;
    byEmoji.set(row.emoji, entry);
  }
  return [...byEmoji.values()]
    .sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : a.emoji < b.emoji ? -1 : a.emoji > b.emoji ? 1 : 0))
    .map(({ emoji, count, mine }) => ({ emoji, count, mine }));
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The active emoji reactions of the change log, optionally of one parent or one footprint. Old likes have no emoji. */
function activeReactions(state: JournalState, match: (view: Record<string, unknown>) => boolean): ReactionRow[] {
  const rows: ReactionRow[] = [];
  for (const entity of Object.values(state)) {
    if (entity.entity !== 'reaction') continue;
    const v = viewOf(entity);
    if (!v || v['active'] !== true || str(v['emoji']) === '' || !match(v)) continue;
    // the fields must agree with the key: a record cannot move a reaction to another parent or emoji
    const parent = parseParentKey(v['parentKey']);
    if (!parent || reactionKey(parent, entity.ownerKey ?? '', str(v['emoji'])) !== entity.entityKey) continue;
    rows.push({ emoji: str(v['emoji']), personKey: entity.ownerKey ?? '', createdAt: str(v['createdAt']) });
  }
  return rows;
}

/** The reaction chips of a parent (`section.<key>` / `image.<key>`): active reactions only. */
export function reactionsOf(state: JournalState, parentKey: string, me: string): ReactionSummary[] {
  return summarizeReactions(activeReactions(state, (v) => v['parentKey'] === parentKey), me);
}

/** How many active reactions a footprint has, any emoji, on any of its sections and images (the photo book's «♥ n»). */
export function footprintReactionCount(state: JournalState, footprintKey: string): number {
  return activeReactions(state, (v) => v['footprintKey'] === footprintKey).length;
}

export interface FeedbackComment {
  key: string; parentKey: string; footprintKey: string; authorKey: string; authorName: string; text: string; createdAt: string; mine: boolean;
}

/** The live comments of a parent, oldest first. Archived ones are gone; an archive by anyone but the author is ignored. */
export function commentsOfParent(state: JournalState, parentKey: string, me: string): FeedbackComment[] {
  const out: FeedbackComment[] = [];
  for (const entity of Object.values(state)) {
    if (entity.entity !== 'comment') continue;
    const v = viewOf(entity);
    if (!v || v['parentKey'] !== parentKey) continue;
    const authorKey = entity.ownerKey ?? '';
    out.push({
      key: entity.entityKey, parentKey, footprintKey: str(v['footprintKey']), authorKey, authorName: str(v['authorName']),
      text: str(v['text']), createdAt: str(v['createdAt']), mine: authorKey !== '' && authorKey === me,
    });
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export function commentCountOf(state: JournalState, parentKey: string): number {
  return commentsOfParent(state, parentKey, '').length;
}

const NONE: SectionFeedback = { comments: false, reactions: false, imageComments: false, imageReactions: false };
const IMAGE_SECTION_TYPES = ['article', 'album'];

/**
 * The switches in effect for a section: the stored ones, a missing one on (SECTION_FEEDBACK_DEFAULT). A hero takes no
 * comments or reactions; only an article or album has images to comment on (spec 1.154 §7).
 */
export function feedbackOf(section: Pick<SectionModel, 'type' | 'feedback'>): SectionFeedback {
  if (section.type === 'hero') return { ...NONE };
  const feedback = storedFeedback(section.feedback) ?? { ...SECTION_FEEDBACK_DEFAULT };
  return IMAGE_SECTION_TYPES.includes(section.type) ? feedback : { ...feedback, imageComments: false, imageReactions: false };
}

/**
 * The title of an image's action sheet (plan decision 6): its caption (`overlay`), else its alt text, else
 * `photoLabel(n)` («Foto n») with n its position in the section counted from 1 (`index` is 0-based).
 */
export function imageTitle(image: ImageConfig, index: number, photoLabel: (n: number) => string): string {
  return image.overlay?.trim() || image.altText?.trim() || photoLabel(index + 1);
}
