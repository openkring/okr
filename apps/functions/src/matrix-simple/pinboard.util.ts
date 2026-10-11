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
