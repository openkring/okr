/**
 * Reine Auswahl- und Rechenlogik des Kalender-Feeds. Kein Firestore, kein express —
 * alles hier ist ohne Emulator testbar. Die I/O-Kette liegt in `feed.ts`.
 */

export interface FeedEvent {
  okey: string;
  calendars?: string[];
  responsiblePersons?: { key: string }[];
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Rollierendes Fenster als StoreDates. Lokaler Date-Konstruktor + lokale Getter — reine
 * Wall-Clock-Arithmetik, damit das Ergebnis auf dem UTC-Server und lokal identisch ist.
 */
export function computeWindow(today: string, monthsBack = 3, monthsForward = 12): { from: string; to: string } {
  const y = parseInt(today.substring(0, 4), 10);
  const m = parseInt(today.substring(4, 6), 10);
  const d = parseInt(today.substring(6, 8), 10);
  const shift = (months: number): string => {
    const target = new Date(y, m - 1 + months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d, lastDay));
    return `${target.getFullYear()}${pad(target.getMonth() + 1)}${pad(target.getDate())}`;
  };
  return { from: shift(-monthsBack), to: shift(monthsForward) };
}

/** Ein persönlicher Anlass ist definitionsgemäss der ohne Kalender (vgl. isPersonalCalevent). */
export function isPersonalEvent(e: FeedEvent): boolean {
  return (e.calendars?.length ?? 0) === 0;
}

/**
 * Der `my`-Filter, serverseitig — Spiegel von calevent.store.ts:185-207.
 * Persönliche Anlässe nur für Organisator oder Eingeladenen; alles andere nur aus
 * Kalendern, denen der Benutzer über eine Mitgliedschaft angehört.
 */
export function filterMyFeed<T extends FeedEvent>(
  events: T[],
  p: { allowedCalendarKeys: string[]; personKey: string; invitedEventKeys: string[] },
): T[] {
  return events.filter(e => {
    if (isPersonalEvent(e)) {
      if (!p.personKey) return false;
      const isOrganiser = e.responsiblePersons?.some(r => r.key === p.personKey) === true;
      return isOrganiser || p.invitedEventKeys.includes(e.okey);
    }
    return (e.calendars ?? []).some(k => p.allowedCalendarKeys.includes(k));
  });
}

/**
 * Die `:listId` des Deep-Links. Im persönlichen Feed 'my', im Kalender-Feed der Kalender,
 * den der Abonnent tatsächlich angefragt hat — sonst landet er in einer Ansicht, die er
 * gar nicht abonniert hat.
 */
export function resolveListId(e: FeedEvent, mode: 'my' | 'calendar', requestedKeys: string[]): string {
  if (mode === 'my') return 'my';
  const hit = (e.calendars ?? []).find(k => requestedKeys.includes(k));
  return hit ?? requestedKeys[0] ?? 'all';
}

/**
 * Zugangsprüfung für einen einzeln angefragten Kalender im `calendar`-Feed — die einzige
 * Autorisierungsschranke eines unauthentifizierten Endpunkts. Erlaubt, wenn der Kalender
 * existiert UND (Mitgliedschaft ODER offener Kalender). Ein unbekannter Schlüssel (kein
 * `cal`) ist immer verboten.
 */
export function isCalendarSubscribable(
  cal: { okey: string; defaultIsOpen?: boolean } | undefined,
  allowedCalendarKeys: string[],
): boolean {
  return !!cal && (allowedCalendarKeys.includes(cal.okey) || cal.defaultIsOpen === true);
}

/** InvitationState → RFC-5545-PARTSTAT. Ohne Einladung: undefined ⇒ kein ATTENDEE. */
export function toPartstat(state: string | undefined): string | undefined {
  switch (state) {
    case 'accepted': return 'ACCEPTED';
    case 'declined': return 'DECLINED';
    case 'maybe':    return 'TENTATIVE';
    case 'pending':  return 'NEEDS-ACTION';
    default:         return undefined;
  }
}
