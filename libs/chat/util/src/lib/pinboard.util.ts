/** Vorbelegung der Direktnachricht bei «Privat antworten» (spec §5.2). `prefix` enthaelt `{excerpt}`. */
export function pinboardReplyDraft(body: string, prefix: string): string {
  const flat = (body ?? '').replace(/\s+/g, ' ').trim();
  const excerpt = flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
  return prefix.replace('{excerpt}', () => excerpt);
}

/** Wie viele Personen ein Aushang benachrichtigt: alle Raummitglieder ausser der schreibenden. */
export function pinboardBroadcastCount(memberKeys: string[], selfKey: string): number {
  const self = selfKey.toLowerCase();
  return memberKeys.filter((k) => k.toLowerCase() !== self).length;
}
