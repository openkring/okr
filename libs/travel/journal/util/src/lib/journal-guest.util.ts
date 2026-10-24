import { JournalChange, JournalChangeOp, JournalEntity, JournalGuestLink } from '@okr/shared-models';
import { formatHlc } from './journal-hlc.util';
import { entityStateKey, JournalState, viewOf } from './journal-merge.util';
import { footprintsOf } from './journal-view.util';

/**
 * Guests, comments and likes of a travel journal (spec 1.113 §7, §8, plan 7). Guests have no account: their
 * link code is checked by the `journalGuest` callable, and what they write becomes ordinary change records of
 * a per-guest device, so comments and likes travel to the iPads like everything else.
 */
export type GuestLinkState = 'ok' | 'revoked' | 'expired' | 'unknown';

export const COMMENT_MAX = 2000;

export function findGuestLink(links: JournalGuestLink[], code: string): JournalGuestLink | undefined {
  return code.length >= 16 ? links.find((l) => l.linkCode === code) : undefined;
}

export function guestLinkState(link: JournalGuestLink | undefined, nowIso: string): GuestLinkState {
  if (!link) return 'unknown';
  if (link.revokedAt) return 'revoked';
  if (link.expiresAt && link.expiresAt <= nowIso) return 'expired';
  return 'ok';
}

/** The device of a guest's records — one per person, so their seq counts their own writes. */
export function guestDeviceId(personKey: string): string {
  return `guest-${personKey}`;
}

/** A like's entity key: one per footprint and person, so liking twice is a no-op and unliking archives it. */
export function likeKey(footprintKey: string, personKey: string): string {
  return `${footprintKey}_${personKey}`;
}

export interface GuestChangeInput {
  id: string;
  journalKey: string;
  personKey: string;
  entity: Extract<JournalEntity, 'comment' | 'reaction'>;
  entityKey: string;
  op: JournalChangeOp;
  fields: Record<string, unknown>;
  seq: number;
  nowMs: number;
}

/** A change record written by the server for a guest: device `guest-<personKey>`, server clock. */
export function guestChangeRecord(input: GuestChangeInput): JournalChange {
  const deviceId = guestDeviceId(input.personKey);
  return {
    id: input.id, journalKey: input.journalKey, deviceId, seq: input.seq,
    hlc: formatHlc({ wall: input.nowMs, counter: 0, deviceId }), authorKey: input.personKey,
    entity: input.entity, entityKey: input.entityKey, op: input.op, fields: input.fields,
  };
}

export interface CommentView { key: string; footprintKey: string; authorKey: string; authorName: string; text: string; createdAt: string }

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The live comments of a footprint, oldest first. */
export function commentsOf(state: JournalState, footprintKey: string): CommentView[] {
  const out: CommentView[] = [];
  for (const entity of Object.values(state)) {
    if (entity.entity !== 'comment') continue;
    const v = viewOf(entity);
    if (!v || v['footprintKey'] !== footprintKey) continue;
    out.push({
      key: entity.entityKey, footprintKey, authorKey: entity.ownerKey ?? '', authorName: str(v['authorName']),
      text: str(v['text']), createdAt: str(v['createdAt']),
    });
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

/** Who likes a footprint (person keys of live likes). */
export function likesOf(state: JournalState, footprintKey: string): string[] {
  const keys: string[] = [];
  for (const entity of Object.values(state)) {
    if (entity.entity !== 'reaction') continue;
    const v = viewOf(entity);
    if (v && v['footprintKey'] === footprintKey && v['type'] === 'like' && entity.ownerKey) keys.push(entity.ownerKey);
  }
  return keys;
}

export interface DigestItem { footprintKey: string; title: string; date: string; updated: boolean; newComments: number }

/**
 * What changed since the last notification, per published footprint: a footprint, one of its blocks or images
 * changed (`updated`), or comments were added. Drafts and archived footprints never appear.
 */
export function digestOf(records: JournalChange[], state: JournalState, journalKey: string): DigestItem[] {
  const published = new Map(footprintsOf(state, journalKey).filter((f) => f.publishState === 'published').map((f) => [f.key, f]));
  const imageToFootprints = new Map<string, string[]>();
  for (const fp of published.values()) {
    for (const block of fp.blocks) for (const key of block.imageKeys ?? []) imageToFootprints.set(key, [...(imageToFootprints.get(key) ?? []), fp.key]);
  }
  const items = new Map<string, DigestItem>();
  const touch = (footprintKey: string, comment: boolean): void => {
    const fp = published.get(footprintKey);
    if (!fp) return;
    const item = items.get(footprintKey) ?? { footprintKey, title: fp.title, date: fp.date, updated: false, newComments: 0 };
    if (comment) item.newComments += 1;
    else item.updated = true;
    items.set(footprintKey, item);
  };
  for (const r of records) {
    switch (r.entity) {
      case 'footprint':
        touch(r.entityKey, false);
        break;
      case 'section': {
        const fk = viewOf(state[entityStateKey('section', r.entityKey)])?.['footprintKey'];
        if (typeof fk === 'string') touch(fk, false);
        break;
      }
      case 'image':
        for (const fk of imageToFootprints.get(r.entityKey) ?? []) touch(fk, false);
        break;
      case 'comment':
        if (r.op === 'create' && typeof r.fields['footprintKey'] === 'string') touch(r.fields['footprintKey'], true);
        break;
      default:
        break; // likes and journal settings are not news
    }
  }
  return [...items.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
