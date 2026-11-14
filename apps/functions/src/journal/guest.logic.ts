import { HttpsError } from 'firebase-functions/v2/https';

import { AvatarInfo, JournalChange, JournalGuestLink, SectionFeedback, SectionModel } from '@okr/shared-models';
import {
  COMMENT_MAX, entityStateKey, FeedbackParent, feedbackOf, isEmoji, isJournalSectionType, JournalSectionType, materialize, parseParentKey,
  reactionKey, ReactionSummary, reactionWrite, ReactionWrite, routePoints, sectionClipKeys, sectionImageKeys, sectionTrackKey, simplifyTrack,
  summarizeReactions, TRACK_MAX_POINTS, TRACK_TOLERANCE_M, TrackCopy, trackCopyFrom, TrackCopyPhoto, viewOf,
} from '@okr/travel-journal-util';

import { isJournalKey } from './apply-journal-change.logic';

/*
 * Spec 1.113 §7, plan 7 — the guest side, decided server-side. A guest has no account: the 128-bit link
 * code is the credential of every `journalGuest` call. Everything a guest writes is built here from
 * allow-listed inputs; names shown next to comments come from the journal's own author and guest lists.
 */

/** `like`/`unlike` and a `comment` without `parentKey` are the footprint-level actions of clients older than 1.154 phase 4 (decision 10). */
export type GuestAction = 'view' | 'comment' | 'deleteComment' | 'react' | 'unreact' | 'like' | 'unlike' | 'settings' | 'mute' | 'unmute';
export type GuestChannel = 'email' | 'none';

export interface GuestRequest {
  journalKey: string;
  code: string;
  action: GuestAction;
  footprintKey?: string;
  parentKey?: string; // `section.<key>` / `image.<key>` of a comment or reaction (1.154 phase 4)
  emoji?: string;
  commentKey?: string;
  text?: string;
  channel?: GuestChannel;
}

const ACTIONS: GuestAction[] = ['view', 'comment', 'deleteComment', 'react', 'unreact', 'like', 'unlike', 'settings', 'mute', 'unmute'];
/** Longer than any single emoji (the longest ZWJ sequences have ~14 UTF-16 units): the segmenter never sees a long string. */
const EMOJI_MAX = 32;
/** `Intl.Segmenter` (Node 16+, the functions run on Node 22); the shared tsconfig's `lib: es2020` does not declare it. */
type GraphemeSegmenterCtor = new (locale: undefined, options: { granularity: 'grapheme' }) => { segment(input: string): Iterable<unknown> };
const graphemes = new (Intl as unknown as { Segmenter: GraphemeSegmenterCtor }).Segmenter(undefined, { granularity: 'grapheme' });

/** Exactly one grapheme, and an emoji (`isEmoji` of @okr/travel-journal-util). */
export function isOneEmoji(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= EMOJI_MAX
    && [...graphemes.segment(value)].length === 1 && isEmoji(value);
}
const CODE = /^[a-f0-9]{32}$/;

export class GuestRequestError extends Error {}

/** Shape check of a `journalGuest` request; anything else is refused before any read. */
export function parseGuestRequest(data: unknown): GuestRequest {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const journalKey = d['journalKey'];
  const code = d['code'];
  const action = d['action'];
  if (!isJournalKey(journalKey) || typeof code !== 'string' || !CODE.test(code) || !ACTIONS.includes(action as GuestAction)) {
    throw new GuestRequestError('invalid request');
  }
  const req: GuestRequest = { journalKey, code, action: action as GuestAction };
  // a comment names its section or image; without `parentKey` it is an old footprint comment (decision 10)
  const withParent = action === 'react' || action === 'unreact' || (action === 'comment' && d['parentKey'] !== undefined);
  if (withParent) {
    // the footprint is never taken from the guest: the server finds it from the parent (feedbackTarget)
    if (!parseParentKey(d['parentKey'])) throw new GuestRequestError('invalid parent');
    req.parentKey = d['parentKey'] as string;
  } else if (action === 'comment' || action === 'like' || action === 'unlike') {
    if (!isJournalKey(d['footprintKey'])) throw new GuestRequestError('invalid footprint');
    req.footprintKey = d['footprintKey'] as string;
  }
  if (action === 'react' || action === 'unreact') {
    if (!isOneEmoji(d['emoji'])) throw new GuestRequestError('invalid emoji');
    req.emoji = d['emoji'];
  }
  if (action === 'deleteComment') {
    if (!isJournalKey(d['commentKey'])) throw new GuestRequestError('invalid comment');
    req.commentKey = d['commentKey'] as string;
  }
  if (action === 'comment') {
    const text = typeof d['text'] === 'string' ? d['text'].trim() : '';
    if (text === '' || text.length > COMMENT_MAX) throw new GuestRequestError('invalid text');
    req.text = text;
  }
  if (action === 'settings') {
    // 'signal' comes from clients older than the release that retired the Signal channel: it means email now
    const channel = d['channel'] === 'signal' ? 'email' : d['channel'];
    if (channel !== 'email' && channel !== 'none') throw new GuestRequestError('invalid channel');
    req.channel = channel;
  }
  return req;
}

/** RFC 5321 caps a path at 256 octets, the address inside it at 254. */
const EMAIL_MAX = 254;
/** Deliberately loose: one `@`, a dot in the domain, no whitespace — the mail provider is the real judge. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Shape check of the optional email of `manageJournalGuest` `create` (spec 1.154 §9): a guest's email, entered by an author.
 * Trimmed and lower-cased; a malformed address or person key is refused before anything is read or stored.
 * Extra fields are dropped — the caller never chooses tenants, favorite flag or channel.
 */
export function parseGuestEmail(data: unknown): { personKey: string; email: string } {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const personKey = d['personKey'];
  if (!isJournalKey(personKey)) throw new HttpsError('invalid-argument', 'personKey');
  const email = typeof d['email'] === 'string' ? d['email'].trim().toLowerCase() : '';
  if (email.length > EMAIL_MAX || !EMAIL.test(email)) throw new HttpsError('invalid-argument', 'email');
  return { personKey, email };
}

/**
 * Whose emails the authors see (spec 1.154 §9): the journal's `authorKeys` (written by `applyJournalChange`)
 * and every person holding a non-revoked guest link — server-written data only, each key once, authors first.
 */
export function peopleKeys(authorKeys: unknown, links: JournalGuestLink[]): string[] {
  const authors = Array.isArray(authorKeys) ? authorKeys : [];
  const guests = links.filter((l) => !l.revokedAt).map((l) => l.personKey);
  return [...new Set([...authors, ...guests].filter((k): k is string => isJournalKey(k)))];
}

/** Display name of a journal member (author or guest) by person key; '' for anyone else. */
export function memberName(personKey: string, authors: AvatarInfo[], guests: { person: AvatarInfo }[]): string {
  const avatar = authors.find((a) => a.key === personKey) ?? guests.find((g) => g.person.key === personKey)?.person;
  return avatar ? `${avatar.name1} ${avatar.name2}`.trim() || avatar.label : '';
}

/** A fresh 128-bit link code (hex). */
export function newLinkCode(randomHex: () => string): string {
  const code = randomHex();
  if (!CODE.test(code)) throw new Error('bad link code');
  return code;
}

export type ManageAction = 'create' | 'expiry' | 'revoke';

/**
 * The guest links after an author's change: `create` reuses a live link of the person (or adds one),
 * `expiry` sets or clears the end date, `revoke` ends the link. Returns the person's link afterwards.
 */
export function applyManage(
  links: JournalGuestLink[], action: ManageAction, personKey: string, nowIso: string, newCode: () => string, expiresAt?: string | null,
): { links: JournalGuestLink[]; link: JournalGuestLink | undefined } {
  const live = links.find((l) => l.personKey === personKey && !l.revokedAt);
  switch (action) {
    case 'create': {
      if (live) return { links, link: live };
      const link: JournalGuestLink = { personKey, linkCode: newCode() };
      return { links: [...links, link], link };
    }
    case 'expiry': {
      if (!live) return { links, link: undefined };
      const link: JournalGuestLink = { ...live };
      if (expiresAt) link.expiresAt = expiresAt;
      else delete link.expiresAt;
      return { links: links.map((l) => (l === live ? link : l)), link };
    }
    case 'revoke': {
      if (!live) return { links, link: undefined };
      const link: JournalGuestLink = { ...live, revokedAt: nowIso };
      return { links: links.map((l) => (l === live ? link : l)), link };
    }
  }
}

/** The guest's own delivery choice as `PersonModel.newsDelivery` (spec §8.1). */
export function deliveryFor(channel: GuestChannel): string[] {
  return channel === 'none' ? [] : [channel];
}

/**
 * Open conflict copies of a section are for the authors to resolve: a guest never receives them. A copy that
 * outlived its original (`conflict: false`) is a normal section (spec 1.126 §6.3). Fails closed: a copy doc
 * without an explicit `conflict: false` (e.g. from an older function revision) stays hidden.
 */
export function isGuestVisibleSection(section: Record<string, unknown>): boolean {
  return section['isArchived'] !== true && (section['conflictOf'] === undefined || section['conflict'] === false);
}

/** A section as a guest receives it, before its photos and clips are signed (`guestView`). */
export interface GuestSection {
  key: string;
  type: JournalSectionType;
  title: string;
  html: string;
  properties: Record<string, unknown>; // the CMS properties; image references name journal images in `label`, `url` empty
  authorKey: string; // resolved to a name by the caller; never sent to the guest
  imageKeys: string[]; // the photos, in `sectionImageKeys` order (a hero's cover last)
  clipKeys: string[]; // the video clips, in pick order
  feedback: SectionFeedback; // the switches in effect (`feedbackOf`): a hero none, image switches only for article and album
  trackKey?: string; // a track section: the `tracks/{key}` doc it shows (a valid key only); its photos are not in `imageKeys`
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The sections a guest sees on one footprint, in the footprint's `sections` order (spec 1.154 phase 2): visible
 * (`isGuestVisibleSection`) section docs of a phase-2 type; any other doc is left out.
 */
export function guestSectionsOf(docs: { id: string; data: Record<string, unknown> }[], footprintKey: string, order: string[]): GuestSection[] {
  return docs
    .filter((d) => d.data['footprintKey'] === footprintKey && isGuestVisibleSection(d.data) && isJournalSectionType(d.data['type']))
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    .map(({ id, data }) => {
      const properties = isRecord(data['properties']) ? data['properties'] : {};
      const content = isRecord(data['content']) ? data['content'] : {};
      return {
        key: id, type: data['type'] as JournalSectionType, title: typeof data['title'] === 'string' ? data['title'] : '',
        html: typeof content['htmlContent'] === 'string' ? content['htmlContent'] : '', properties,
        authorKey: typeof data['authorKey'] === 'string' ? data['authorKey'] : '',
        imageKeys: sectionImageKeys({ properties }), clipKeys: sectionClipKeys({ properties }),
        feedback: feedbackOf({ type: data['type'] as SectionModel['type'], feedback: data['feedback'] as SectionFeedback | undefined }),
        ...trackKeyOfSection(data['type'], properties),
      };
    });
}

/** A track section's track key, only when it is one Firestore path segment: the key comes from an author's device. */
function trackKeyOfSection(type: unknown, properties: Record<string, unknown>): { trackKey?: string } {
  if (type !== 'track') return {};
  const trackKey = sectionTrackKey({ properties });
  return isJournalKey(trackKey) ? { trackKey } : {};
}

// ---- map and track sections (spec 1.154 phase 5, plan decisions 1, 2, 5; Review Focus 1, 4) ----

/** A photo of a guest's track: the copy's position and time plus the signed URLs of the live journal image. */
export interface GuestTrackPhoto extends TrackCopyPhoto { url: string; thumb: string }

/**
 * A track as a guest receives it: the allow-listed copy (decision 2) without the trip key, its photos signed. Never
 * steps, strokes, heart rate, crew or notes — the doc is re-read through `trackCopyFrom`, so even a doc that carried
 * more would not pass them on.
 */
export type GuestTrack = Omit<TrackCopy, 'tripKey' | 'photos'> & { photos: GuestTrackPhoto[] };

/** Signs one private-bucket path for a width (imgix in `guestView`, a fake in the tests). */
export type SignPath = (path: string, width: number) => string;

/**
 * The guest's track of a `tracks/{key}` doc, or `undefined` for a missing or archived doc. Photos only of live
 * journal images with a file (`imageById` holds the live images only); others are left out, never an unsigned link.
 */
export function guestTrackOf(doc: Record<string, unknown> | undefined, imageById: Map<string, Record<string, unknown>>, sign: SignPath): GuestTrack | undefined {
  if (!doc || doc['isArchived'] === true) return undefined;
  const { name, startedAt, endedAt, distanceM, durationS, modes, sections, photos } = trackCopyFrom(doc);
  return {
    name, startedAt, endedAt, distanceM, durationS, modes, sections,
    photos: photos.flatMap((p) => {
      const image = imageById.get(p.imageKey);
      const path2048 = image?.['path2048'];
      if (typeof path2048 !== 'string' || path2048 === '') return [];
      return [{ ...p, url: sign(path2048, 1600), thumb: sign(String(image?.['path400'] ?? ''), 400) }];
    }),
  };
}

/**
 * The footprints a guest sees with their guest-visible sections (`guestSectionsOf`, in the footprint's `sections`
 * order): live and published only — checked here again, not just in the query, because the route and the tracks are
 * built from exactly this list (Review Focus 4).
 */
export function publishedGuestFootprints<T extends { id: string; data: Record<string, unknown> }>(
  footprints: T[], sectionDocs: { id: string; data: Record<string, unknown> }[],
): { footprint: T; sections: GuestSection[] }[] {
  return footprints.filter((f) => f.data['isArchived'] !== true && f.data['publishState'] === 'published').map((footprint) => {
    const order = Array.isArray(footprint.data['sections']) ? (footprint.data['sections'] as unknown[]).filter((k): k is string => typeof k === 'string') : [];
    return { footprint, sections: guestSectionsOf(sectionDocs, footprint.id, order) };
  });
}

/** Whether any of the guest's sections is a map that shows the journal route (`properties.showRoute`). */
export function wantsRoute(sections: GuestSection[]): boolean {
  return sections.some((s) => s.type === 'map' && s.properties['showRoute'] === true);
}

/** The most points a guest's route carries; a longer one is thinned by `simplifyTrack` (first and last kept). */
export const GUEST_ROUTE_MAX_POINTS = TRACK_MAX_POINTS;

/**
 * The journal route for guests (decision 5, Review Focus 4): the positions of the photos guests are shown, in time
 * order (`routePoints`, as `journalMapData` for the authors). `imageKeys` are the photos of the guest-visible sections of
 * live, published footprints (and of their tracks) — so a draft's photo never adds a point; video clips and images that
 * are not live (absent from `imageById`) neither. Thinned to `GUEST_ROUTE_MAX_POINTS` by Douglas–Peucker.
 */
export function guestRoute(imageKeys: Iterable<string>, imageById: Map<string, Record<string, unknown>>): [number, number][] {
  const photos = [...new Set(imageKeys)].flatMap((key) => {
    const image = imageById.get(key);
    if (!image || (typeof image['videoPath'] === 'string' && image['videoPath'] !== '')) return [];
    const takenAt = typeof image['takenAt'] === 'string' ? image['takenAt'] : undefined;
    const latitude = typeof image['latitude'] === 'number' ? image['latitude'] : undefined;
    const longitude = typeof image['longitude'] === 'number' ? image['longitude'] : undefined;
    return [{ takenAt, latitude, longitude }];
  });
  const route = routePoints(photos);
  if (route.length <= GUEST_ROUTE_MAX_POINTS) return route;
  return simplifyTrack(route.map(([lat, lng]) => ({ lat, lng, t: 0 })), TRACK_TOLERANCE_M, GUEST_ROUTE_MAX_POINTS).map((p) => [p.lat, p.lng]);
}

/** The playable clips of a video section, in pick order: unknown keys and clips whose `videoPath` is not a `-video.mp4` of this journal are left out. */
export function guestVideoClips(imageKeys: string[], imageById: Map<string, Record<string, unknown>>, tenant: string, journalKey: string): {
  key: string; width?: unknown; height?: unknown; durationSec?: unknown; objectPath: string; posterPath: string;
}[] {
  return imageKeys.flatMap((key) => {
    const image = imageById.get(key);
    const objectPath = typeof image?.['videoPath'] === 'string' ? image['videoPath'] : '';
    if (!image || !objectPath.startsWith(`tenant/${tenant}/journal/${journalKey}/`) || !objectPath.endsWith('-video.mp4') || objectPath.includes('..')) return [];
    return [{ key, width: image['width'], height: image['height'], durationSec: image['durationSec'], objectPath, posterPath: typeof image['path2048'] === 'string' ? image['path2048'] : '' }];
  });
}

/** The Storage object of a clip, as far as signing its read URL needs it (a fake in the tests). */
export interface ClipObject {
  exists(): Promise<[boolean]>;
  getSignedUrl(options: { version: 'v4'; action: 'read'; expires: number }): Promise<[string]>;
}

/**
 * The guest's read URL of a clip, or '' while its mp4 is not uploaded yet (clips go up last, after records and
 * posters). The guest page shows the poster with «Video noch nicht geladen» for '', never a player that 404s.
 */
export async function clipReadUrl(file: ClipObject, expiresMs: number): Promise<string> {
  const [exists] = await file.exists();
  if (!exists) return '';
  const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: expiresMs });
  return url;
}

// ---- comments and emoji reactions on sections and images (spec 1.154 §7, phase-4 plan decision 5) ----

export type FeedbackKind = 'comment' | 'reaction';

/**
 * The footprint a guest's comment or reaction belongs to, or `undefined` to refuse it. `published` holds the guest-visible
 * sections (`guestSectionsOf`) of every live, published footprint of THIS journal, so a parent anywhere else — a draft,
 * another journal, an archived or unknown section or image, an open conflict copy — is refused. The parent's switch must
 * be on: a section's `comments`/`reactions`; an image's `imageComments`/`imageReactions` of a section that shows it.
 * An image shown in several sections is allowed when any of them allows it; the footprint is that of the first allowing
 * section in footprint-key, then section-key order (deterministic, so a guest's repeated writes agree).
 * `checkSwitch` false (withdrawing a reaction) ignores the switches: a guest may always take back what they gave.
 */
export function feedbackTarget(parentKey: string, kind: FeedbackKind, published: Map<string, GuestSection[]>, checkSwitch = true): string | undefined {
  const parent = parseParentKey(parentKey);
  if (!parent) return undefined;
  const candidates = [...published.entries()]
    .flatMap(([footprintKey, sections]) => sections.map((section) => ({ footprintKey, section })))
    .sort((a, b) => (a.footprintKey < b.footprintKey ? -1 : a.footprintKey > b.footprintKey ? 1 : a.section.key < b.section.key ? -1 : a.section.key > b.section.key ? 1 : 0));
  const allowed = candidates.find(({ section }) => parent.kind === 'section'
    ? section.key === parent.id && (!checkSwitch || (kind === 'comment' ? section.feedback.comments : section.feedback.reactions))
    : section.imageKeys.includes(parent.id) && (!checkSwitch || (kind === 'comment' ? section.feedback.imageComments : section.feedback.imageReactions)));
  return allowed?.footprintKey;
}

/**
 * The record that switches a guest's reaction on or off, from every stored record of its key (`records`): `reactionWrite`
 * on their merged state — a `create` while the reaction is unknown, else a `set` keeping the first `createdAt`. Records of
 * anyone but the person in the key are not admitted by the merge. `undefined`: nothing to write — removing a reaction the
 * guest never made, or an emoji that gives no valid key (the caller refuses that case before).
 */
export function guestReactionWrite(
  records: JournalChange[], parent: FeedbackParent, footprintKey: string, personKey: string, emoji: string, active: boolean, nowIso: string,
): ReactionWrite | undefined {
  const key = reactionKey(parent, personKey, emoji);
  if (!key) return undefined;
  const state = materialize(records.filter((r) => r.entity === 'reaction' && r.entityKey === key));
  const known = viewOf(state[entityStateKey('reaction', key)]);
  if (!known && !active) return undefined;
  const createdAt = typeof known?.['createdAt'] === 'string' && known['createdAt'] !== '' ? known['createdAt'] : nowIso;
  return reactionWrite(state, parent, footprintKey, personKey, emoji, active, createdAt);
}

/** Whether a guest may delete a comment: only their own live one, by the author its materialised doc names (Review Focus 4). */
export function mayDeleteComment(comment: Record<string, unknown> | undefined, personKey: string): boolean {
  return !!comment && comment['isArchived'] !== true && personKey !== '' && comment['authorKey'] === personKey;
}

/** A comment as a guest receives it: no person key, only the display name. */
export interface GuestComment { key: string; authorName: string; text: string; createdAt: string; mine: boolean }
export interface GuestFeedback { reactions: ReactionSummary[]; comments: GuestComment[] }
type StoredDoc = { id: string; data: Record<string, unknown> };

const strOf = (v: unknown): string => (typeof v === 'string' ? v : '');
const byCreated = (a: GuestComment, b: GuestComment): number =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

/**
 * Comments and reaction summaries per parent (`section.<key>` / `image.<key>`), built from the materialised
 * `comments`/`reactions` docs — never from client data. Archived docs, old footprint likes and comments (`page.<key>`)
 * and a reaction doc whose fields disagree with its id are left out. `me` is the guest's person key (for `mine`);
 * `name` resolves an author's display name from the journal lists, else the comment's stored `authorName` is shown.
 */
export function feedbackIndex(comments: StoredDoc[], reactions: StoredDoc[], me: string, name: (personKey: string) => string): Map<string, GuestFeedback> {
  const rows = new Map<string, { emoji: string; personKey: string; createdAt: string }[]>();
  for (const { id, data } of reactions) {
    const parent = parseParentKey(data['parentKey']);
    const personKey = strOf(data['personKey']);
    const emoji = strOf(data['emoji']);
    if (data['isArchived'] === true || !parent || emoji === '' || reactionKey(parent, personKey, emoji) !== id) continue;
    const parentKey = strOf(data['parentKey']);
    rows.set(parentKey, [...(rows.get(parentKey) ?? []), { emoji, personKey, createdAt: strOf(data['createdAt']) }]);
  }
  const notes = new Map<string, GuestComment[]>();
  for (const { id, data } of comments) {
    if (data['isArchived'] === true || !parseParentKey(data['parentKey'])) continue;
    const parentKey = strOf(data['parentKey']);
    const authorKey = strOf(data['authorKey']);
    const comment = { key: id, authorName: name(authorKey) || strOf(data['authorName']), text: strOf(data['description']), createdAt: strOf(data['creationDateTime']), mine: authorKey !== '' && authorKey === me };
    notes.set(parentKey, [...(notes.get(parentKey) ?? []), comment]);
  }
  const index = new Map<string, GuestFeedback>();
  for (const parentKey of new Set([...rows.keys(), ...notes.keys()])) {
    index.set(parentKey, { reactions: summarizeReactions(rows.get(parentKey) ?? [], me), comments: (notes.get(parentKey) ?? []).sort(byCreated) });
  }
  return index;
}

/** What `guestView` adds to a section: its switches, its own feedback and its images' — each only while its switch is on. */
export function guestSectionFeedback(section: GuestSection, index: Map<string, GuestFeedback>): GuestFeedback & {
  feedback: SectionFeedback; images: Record<string, GuestFeedback>;
} {
  const { feedback } = section;
  const own = index.get(`section.${section.key}`);
  const images: Record<string, GuestFeedback> = {};
  if (feedback.imageComments || feedback.imageReactions) {
    for (const key of section.imageKeys) {
      const image = index.get(`image.${key}`);
      images[key] = { reactions: feedback.imageReactions ? image?.reactions ?? [] : [], comments: feedback.imageComments ? image?.comments ?? [] : [] };
    }
  }
  return { feedback, reactions: feedback.reactions ? own?.reactions ?? [] : [], comments: feedback.comments ? own?.comments ?? [] : [], images };
}
