import { AvatarInfo, JournalGuestLink } from '@okr/shared-models';
import { COMMENT_MAX } from '@okr/travel-journal-util';

import { isJournalKey } from './apply-journal-change.logic';

/*
 * Spec 1.113 §7, plan 7 — the guest side, decided server-side. A guest has no account: the 128-bit link
 * code is the credential of every `journalGuest` call. Everything a guest writes is built here from
 * allow-listed inputs; names shown next to comments come from the journal's own author and guest lists.
 */

export type GuestAction = 'view' | 'comment' | 'deleteComment' | 'like' | 'unlike' | 'settings' | 'mute' | 'unmute';
export type GuestChannel = 'email' | 'signal' | 'none';

export interface GuestRequest {
  journalKey: string;
  code: string;
  action: GuestAction;
  footprintKey?: string;
  commentKey?: string;
  text?: string;
  channel?: GuestChannel;
}

const ACTIONS: GuestAction[] = ['view', 'comment', 'deleteComment', 'like', 'unlike', 'settings', 'mute', 'unmute'];
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
  if (action === 'comment' || action === 'like' || action === 'unlike') {
    if (!isJournalKey(d['footprintKey'])) throw new GuestRequestError('invalid footprint');
    req.footprintKey = d['footprintKey'] as string;
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
    if (d['channel'] !== 'email' && d['channel'] !== 'signal' && d['channel'] !== 'none') throw new GuestRequestError('invalid channel');
    req.channel = d['channel'];
  }
  return req;
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

/** Conflict copies of a block are for the authors to resolve: a guest never receives them (spec 1.126 §6.3). */
export function isGuestVisibleSection(section: Record<string, unknown>): boolean {
  return section['isArchived'] !== true && section['conflictOf'] === undefined;
}
