/**
 * The kiosk's own black box: a small journal in localStorage that survives a reload or a killed
 * web view, so that the page which comes back after an outage can say WHY it was gone.
 *
 * A dead kiosk cannot report its own death — no JS runs in a killed WKWebView, and an offline one
 * cannot reach Sentry. What it can do is write down what happened to it (went hidden, went offline,
 * stopped ticking, booted fresh) while it still runs, and report the whole story as one event the
 * moment a check-in reaches Sentry again. The outage ALARM itself is the Sentry Crons monitor fed by
 * the same check-ins (see KioskMonitorService); this journal only explains it afterwards.
 *
 * Pure functions only — the service owns the timers, localStorage and Sentry.
 */

/** How often the kiosk checks in with Sentry. Also the tick of this journal. */
export const KIOSK_CHECKIN_INTERVAL_MS = 5 * 60_000;

/** A page that did not tick for this long was not running (asleep, suspended or dead). */
export const KIOSK_SILENCE_MS = 2 * KIOSK_CHECKIN_INTERVAL_MS;

/** A gap between two successful check-ins longer than this is reported as an outage. */
export const KIOSK_OUTAGE_MS = 30 * 60_000;

/** Ring size. Kiosker reloads the page after every idle spell, so boots alone fill a few per hour. */
export const KIOSK_JOURNAL_MAX = 60;

export type KioskEventKind = 'boot' | 'hidden' | 'visible' | 'offline' | 'online' | 'silence';

export interface KioskEvent {
  /** ISO timestamp. For a `silence`, the last tick before it — i.e. when the page stopped. */
  at: string;
  kind: KioskEventKind;
  /** Duration of a `silence` in ms. */
  ms?: number;
}

export interface KioskJournal {
  /** Last time the page ran a tick — written locally, so it advances even while offline. */
  lastAlive?: string;
  /** Last time a check-in was accepted by Sentry — the device was provably reachable. */
  lastReached?: string;
  events: KioskEvent[];
}

/**
 * - `asleep`            the page went hidden (iPad locked / Kiosker backgrounded) and stopped
 * - `webview-reloaded`  the page stopped while visible and came back as a fresh load — the
 *                       web view was killed or crashed and something (Kiosker's idle reload,
 *                       a person) reloaded it
 * - `suspended`         the page stopped while visible and resumed without a reload
 * - `offline`           the page kept running, the device itself reported no network (Wi-Fi)
 * - `unreachable`       the page kept running and claimed a network, yet check-ins failed —
 *                       Wi-Fi without internet, DNS, captive portal, or Sentry/Firebase down
 */
export type KioskOutageCause = 'asleep' | 'webview-reloaded' | 'suspended' | 'offline' | 'unreachable';

export interface KioskOutage {
  from: string;
  to: string;
  minutes: number;
  cause: KioskOutageCause;
  /** The journal entries inside the gap — the evidence behind `cause`. */
  events: KioskEvent[];
}

export function emptyKioskJournal(): KioskJournal {
  return { events: [] };
}

export function recordKioskEvent(journal: KioskJournal, kind: KioskEventKind, at: string, ms?: number): KioskJournal {
  const event: KioskEvent = ms === undefined ? { at, kind } : { at, kind, ms };
  return { ...journal, events: [...journal.events, event].slice(-KIOSK_JOURNAL_MAX) };
}

/** One tick of a running page: notes a silence if the previous tick is too long ago. */
export function tickKioskJournal(journal: KioskJournal, now: string): KioskJournal {
  const silent = journal.lastAlive ? Date.parse(now) - Date.parse(journal.lastAlive) : 0;
  const next = silent > KIOSK_SILENCE_MS && journal.lastAlive
    ? recordKioskEvent(journal, 'silence', journal.lastAlive, silent)
    : journal;
  return { ...next, lastAlive: now };
}

/**
 * A check-in was accepted. If the previous accepted one is longer ago than KIOSK_OUTAGE_MS,
 * the time in between was an outage: return it, classified, for reporting.
 */
export function markKioskReached(journal: KioskJournal, now: string): { journal: KioskJournal; outage?: KioskOutage } {
  const next = { ...journal, lastReached: now };
  const from = journal.lastReached;
  if (!from) return { journal: next };
  const gapMs = Date.parse(now) - Date.parse(from);
  if (gapMs <= KIOSK_OUTAGE_MS) return { journal: next };
  // by END, not start: a silence starts at the tick just BEFORE the check-in that set lastReached
  const events = journal.events.filter(e => eventEnd(e) > from && e.at <= now);
  return {
    journal: next,
    outage: { from, to: now, minutes: Math.round(gapMs / 60_000), cause: classifyKioskOutage(events, from, now), events },
  };
}

/**
 * Was the page down, or was it running without a network? Decided by how much of the gap the
 * page spent silent. For a page-down outage, the longest silence tells the rest: a `hidden` inside
 * it means the device went to sleep, a `boot` ending it means the page had to be loaded afresh.
 */
export function classifyKioskOutage(events: KioskEvent[], from: string, to: string): KioskOutageCause {
  const gapMs = Math.max(1, Date.parse(to) - Date.parse(from));
  const silences = events.filter(e => e.kind === 'silence');
  const silentMs = silences.reduce((sum, e) => sum + (e.ms ?? 0), 0);

  if (silentMs * 2 >= gapMs) {
    const longest = silences.reduce((a, b) => ((b.ms ?? 0) > (a.ms ?? 0) ? b : a), silences[0]);
    const start = longest.at;
    const end = eventEnd(longest);
    if (events.some(e => e.kind === 'hidden' && e.at >= start && e.at <= end)) return 'asleep';
    if (events.some(e => e.kind === 'boot' && e.at >= start && e.at <= end)) return 'webview-reloaded';
    return 'suspended';
  }
  return events.some(e => e.kind === 'offline') ? 'offline' : 'unreachable';
}

function eventEnd(event: KioskEvent): string {
  return event.ms ? new Date(Date.parse(event.at) + event.ms).toISOString() : event.at;
}

/**
 * Sentry Crons monitor slug for one kiosk device: one monitor per kiosk, so a second kiosk that
 * is alive cannot mask a dead one. Sentry slugs are lower-case.
 */
export function kioskMonitorSlug(tenantId: string, uid: string): string {
  return `logbuch-kiosk-${tenantId}-${uid.slice(0, 8)}`.toLowerCase();
}
