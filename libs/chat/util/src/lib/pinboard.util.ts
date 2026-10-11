/** Vorbelegung der Direktnachricht bei «Privat antworten» (spec §5.2). `prefix` enthaelt `{excerpt}`. */
export function pinboardReplyDraft(body: string, prefix: string): string {
  const flat = (body ?? '').replace(/\s+/g, ' ').trim();
  const excerpt = flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
  return prefix.replace('{excerpt}', () => excerpt);
}

/** Wie viele Personen ein Aushang benachrichtigt: alle Raummitglieder ausser der schreibenden. */
export function pinboardBroadcastCount(memberKeys: string[], selfKey: string, knownKeys?: Set<string>): number {
  const self = selfKey.toLowerCase();
  return memberKeys
    .map((k) => k.toLowerCase())
    // Mit `knownKeys` (lower-case okeys der Personen) zaehlen nur echte Personen — nicht das Matrix-Admin-Dienstkonto.
    .filter((k) => k !== self && (!knownKeys || knownKeys.has(k)))
    .length;
}

export type PinboardInput = { name: string; description: string; sourceGroupKeys: string[]; joinMode: 'optOut' | 'optIn'; allowReplyAll: boolean };
export type AvailablePinboard = { groupKey: string; name: string; description: string; roomId: string };
