/**
 * Pins with an expiry (spec 1.109 §6). Shared pins live in `m.room.pinned_events` plus the
 * `org.okr.pin_expiry` room state; personal pins live in the `org.okr.pins` room account data.
 * Time is always a parameter.
 */
import type { MatrixMessage } from '@okr/shared-models';

import { bookmarkSnippet } from './bookmark.util';

/** Room account data: `{ [eventId]: until (ms) | null }`, `null` = never expires. */
export const OKR_PINS_EVENT = 'org.okr.pins';

/** Room state (state_key ''): `{ [eventId]: until (ms) | null }` for shared pins. */
export const OKR_PIN_EXPIRY_EVENT = 'org.okr.pin_expiry';

export const MATRIX_PINNED_EVENTS = 'm.room.pinned_events';

export type PinScope = 'personal' | 'shared';

export interface ActivePin {
  eventId: string;
  scope: PinScope;
  until: number | null;
  order: number;
}

export type PinDuration = '24h' | '7d' | '30d' | 'forever';

/** Default duration is '7d'. */
export const PIN_DURATIONS: readonly PinDuration[] = ['24h', '7d', '30d', 'forever'];

const DAY_MS = 86_400_000;
const DURATION_MS: Record<Exclude<PinDuration, 'forever'>, number> = {
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
};

export function pinUntil(duration: PinDuration, now: number): number | null {
  return duration === 'forever' ? null : now + DURATION_MS[duration];
}

/** A pin is active until its expiry; no expiry means active forever. */
export function isPinActive(until: number | null | undefined, now: number): boolean {
  return until === null || until === undefined || until > now;
}

function isValidUntil(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

/** Shared expiry of one event: a malformed or missing value means no expiry. */
function sharedUntil(expiry: Record<string, unknown> | undefined, eventId: string): number | null {
  const value = expiry?.[eventId];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Active pins: shared first, then personal; newest first within each scope. Malformed personal entries are ignored. */
export function activePins(
  personal: Record<string, unknown> | undefined,
  sharedPinned: string[] | undefined,
  sharedExpiry: Record<string, unknown> | undefined,
  now: number,
): ActivePin[] {
  const shared = (sharedPinned ?? [])
    .map((eventId) => ({ eventId, until: sharedUntil(sharedExpiry, eventId) }))
    .filter((p) => isPinActive(p.until, now))
    .reverse();

  const own = Object.entries(personal ?? {})
    .filter((entry): entry is [string, number | null] => isValidUntil(entry[1]))
    .map(([eventId, until]) => ({ eventId, until }))
    .filter((p) => isPinActive(p.until, now))
    .sort((a, b) => (b.until ?? Infinity) - (a.until ?? Infinity));

  return [
    ...shared.map((p) => ({ ...p, scope: 'shared' as const })),
    ...own.map((p) => ({ ...p, scope: 'personal' as const })),
  ].map((p, order) => ({ eventId: p.eventId, scope: p.scope, until: p.until, order }));
}

/** Shared pins whose expiry has passed (to be unpinned by the next writer). */
export function expiredSharedPins(
  sharedPinned: string[] | undefined,
  sharedExpiry: Record<string, unknown> | undefined,
  now: number,
): string[] {
  return (sharedPinned ?? []).filter((eventId) => !isPinActive(sharedUntil(sharedExpiry, eventId), now));
}

function pruned(content: Record<string, unknown> | undefined, now: number): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const [eventId, until] of Object.entries(content ?? {})) {
    if (isValidUntil(until) && isPinActive(until, now)) result[eventId] = until;
  }
  return result;
}

/** New `org.okr.pins` content with the pin added (or replaced); expired entries are pruned. */
export function withPersonalPin(
  content: Record<string, unknown> | undefined,
  eventId: string,
  until: number | null,
  now: number,
): Record<string, number | null> {
  const result = pruned(content, now);
  if (isPinActive(until, now)) result[eventId] = until;
  return result;
}

/** New `org.okr.pins` content without the pin; expired entries are pruned. */
export function withoutPersonalPin(content: Record<string, unknown> | undefined, eventId: string, now: number): Record<string, number | null> {
  const result = pruned(content, now);
  delete result[eventId];
  return result;
}

/**
 * Icon of a pin (banner, pin menu). The icon repository has no dedicated pin glyph yet, so the
 * location marker stands in; swap the name here once a `pin` icon is uploaded.
 */
export const PIN_ICON = 'location';

/** Whether `eventId` is pinned in any scope. */
export function isEventPinned(eventId: string, pins: readonly ActivePin[]): boolean {
  return pins.some((p) => p.eventId === eventId);
}

/**
 * The scopes in which the caller may unpin `eventId`: personal always, shared only with the
 * right (`canUnpinShared`). Two entries mean the caller must be asked which one.
 */
export function unpinnableScopes(eventId: string, pins: readonly ActivePin[], canUnpinShared: boolean): PinScope[] {
  const scopes = new Set(pins.filter((p) => p.eventId === eventId).map((p) => p.scope));
  const result: PinScope[] = [];
  if (scopes.has('shared') && canUnpinShared) result.push('shared');
  if (scopes.has('personal')) result.push('personal');
  return result;
}

/** What the banner and the pin list show for a pinned message. */
export interface PinPreview {
  senderName: string;
  snippet: string;
}

/**
 * Preview of a pinned event from its raw type and content (a message that is not in the loaded
 * timeline). Undefined when nothing readable is left: encrypted, redacted or empty.
 */
export function pinPreviewOf(eventType: string, content: Record<string, unknown> | undefined, senderName: string): PinPreview | undefined {
  if (!content || eventType === 'm.room.encrypted') return undefined;
  const msgtype = content['msgtype'];
  const type = eventType === 'm.room.message' ? (typeof msgtype === 'string' ? msgtype : 'm.text') : eventType;
  const body = typeof content['body'] === 'string' ? content['body'] : '';
  const snippet = bookmarkSnippet({ type, body, content } as MatrixMessage);
  return snippet ? { senderName, snippet } : undefined;
}
