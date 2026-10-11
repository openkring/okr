// apps/functions/src/matrix-simple/pinboard.util.ts
//
// Reine Funktionen der Pinnwand (planning/specs/2026-10-11-chat-pinnwand-spec.md §4.1) —
// ohne Firestore und ohne Matrix, damit die Abgleichsregel vollstaendig testbar ist.

export function pinboardKey(tenantId: string, randomPart: string): string {
  return `${tenantId}_p_${randomPart}`;
}

/** `_p_` kann `getGroupKeyFromName` nie erzeugen (es entfernt alles ausser [a-z0-9]). */
export function isPinboardKey(key: string): boolean {
  return /^[a-z0-9]+_p_[a-z0-9]+$/.test(key);
}

/** Deterministisch, damit jeder Schreiber (Anlage, Trigger, Sweep, Beitritt) idempotent ist. */
export function pinboardMembershipId(pinboardKey: string, personKey: string): string {
  return `pb_${pinboardKey}_${personKey}`;
}

export type PinboardMembershipState = { active: boolean; isOptedOut: boolean };
export type PinboardPlan = { add: string[]; end: string[] };

/**
 * Wer kommt dazu, wer faellt heraus.
 * - `eligible`: aktive Personen-Mitglieder aller Quellgruppen (Vereinigung).
 * - `keep`: bleiben drin, solange sie nicht selbst ausgetreten sind (die Admins der Pinnwand, auch ohne Quellgruppe).
 * - `current`: bestehende Pinnwand-Mitgliedschaften je Person.
 * - `only`: nur diese eine Person betrachten (Trigger auf eine Quell-Mitgliedschaft).
 */
export function planPinboardMembership(input: {
  joinMode: 'optOut' | 'optIn';
  eligible: Set<string>;
  keep: Set<string>;
  current: Map<string, PinboardMembershipState>;
  only?: string;
}): PinboardPlan {
  const { joinMode, eligible, keep, current, only } = input;
  const consider = (key: string) => only === undefined || key === only;
  const add: string[] = [];
  const end: string[] = [];

  for (const key of [...new Set([...eligible, ...keep])]) {
    if (!consider(key)) continue;
    const state = current.get(key);
    if (state?.active) continue;
    if (state?.isOptedOut) continue;
    if (keep.has(key)) { add.push(key); continue; }
    if (joinMode === 'optOut') add.push(key);
  }
  for (const [key, state] of current) {
    if (!consider(key) || !state.active) continue;
    if (!eligible.has(key) && !keep.has(key)) end.push(key);
  }
  return { add, end };
}

type SourceMembershipDoc = { orgKey?: string; orgModelType?: string; memberKey?: string; memberModelType?: string };

/**
 * Welche (Quellgruppe, Person)-Paare muss eine Aenderung einer Mitgliedschaft abgleichen?
 * Vorher- und Nachher-Stand, ohne Duplikate; nur Personen-Mitgliedschaften in Gruppen.
 */
export function sourcePairsToReconcile(before?: SourceMembershipDoc, after?: SourceMembershipDoc): [string, string][] {
  const pairs = new Map<string, [string, string]>();
  for (const d of [after, before]) {
    if (!d || d.orgModelType !== 'group' || d.memberModelType !== 'person' || !d.orgKey || !d.memberKey) continue;
    if (isPinboardKey(d.orgKey)) continue;
    pairs.set(`${d.orgKey}|${d.memberKey}`, [d.orgKey, d.memberKey]);
  }
  return [...pairs.values()];
}

/**
 * Eine Person kann mehrere Pinnwand-Mitgliedschaften haben (zufaellige ids aus dem generischen
 * Mitglieder-UI). Aktiv schlaegt beendet; unter beendeten gewinnt `isOptedOut`, damit ein
 * aelteres beendetes Dokument ohne Flag den Austritt nicht verdeckt.
 */
export function mergeMembershipState(prev: PinboardMembershipState | undefined, next: PinboardMembershipState): PinboardMembershipState {
  if (!prev) return next;
  if (prev.active) return prev;
  if (next.active) return next;
  return next.isOptedOut && !prev.isOptedOut ? next : prev;
}

export const PINBOARD_NAME_MAX = 50;
export const PINBOARD_DESCRIPTION_MAX = 500;

export function validatePinboardInput(
  input: { name?: unknown; description?: unknown; sourceGroupKeys?: unknown; joinMode?: unknown; allowReplyAll?: unknown },
  partial: boolean,
): string | undefined {
  if (!partial || input.name !== undefined) {
    if (typeof input.name !== 'string' || input.name.trim().length === 0) return 'name is required';
    if (input.name.length > PINBOARD_NAME_MAX) return `name exceeds ${PINBOARD_NAME_MAX} characters`;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== 'string') return 'description must be a string';
    if (input.description.length > PINBOARD_DESCRIPTION_MAX) return `description exceeds ${PINBOARD_DESCRIPTION_MAX} characters`;
  }
  if (!partial || input.sourceGroupKeys !== undefined) {
    const keys = input.sourceGroupKeys;
    if (!Array.isArray(keys) || keys.length === 0 || keys.some((k) => typeof k !== 'string' || !k)) return 'at least one source group is required';
    if (keys.some((k) => isPinboardKey(k as string) || /_c_/.test(k as string))) return 'a source group must be a real group';
  }
  if (input.joinMode !== undefined && input.joinMode !== 'optOut' && input.joinMode !== 'optIn') return 'joinMode must be optOut or optIn';
  if (input.allowReplyAll !== undefined && typeof input.allowReplyAll !== 'boolean') return 'allowReplyAll must be a boolean';
  return undefined;
}
