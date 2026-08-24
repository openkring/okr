import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

export { getPublicCalEvents } from './public-calevents';
export { ensureCalendarFeedToken, calendarFeed } from './feed';

// ─────────────────────────────────────────────────────────────────────────────
// Types (inlined to avoid monorepo cross-bundle imports)
// ─────────────────────────────────────────────────────────────────────────────

interface CalEventDoc {
  okey: string;
  name: string;
  description: string;
  startDate: string;   // yyyyMMdd
  startTime: string;   // HH:mm
  fullDay: boolean;
  durationMinutes: number;
  endDate: string;     // yyyyMMdd — only set for multi-day full-day events
  periodicity: string; // 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'workdays' | 'hourly' | 'never' | 'other'
  repeatUntilDate: string; // yyyyMMdd
  locationKey: string; // 'name@key'
  url: string;
  isArchived: boolean;
  calendars: string[];
  tenants: string[];
  seriesId: string;    // gesetzt ⇒ dieses Dokument IST ein materialisiertes Vorkommen
  state: string;       // 'proposed' | 'provisional' | 'definitive' | 'cancelled' (see CalEventModel.state)
  columnLabel: string; // non-empty ⇒ schedule-poll column-header pseudo-event; never shown in a calendar
}

interface CalendarDoc {
  name: string;
  title: string;
  defaultIsOpen: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ICS builder helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Fold long lines per RFC 5545 (max 75 octets, continuation with CRLF + space). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  let result = '';
  let remaining = line;
  let first = true;
  while (remaining.length > 0) {
    const chunkSize = first ? 75 : 74; // continuation lines have a leading space
    result += (first ? '' : '\r\n ') + remaining.substring(0, chunkSize);
    remaining = remaining.substring(chunkSize);
    first = false;
  }
  return result;
}

/** Escape special chars in ICS text values. */
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * Escape a value for use in an ICS parameter (RFC 5545 §3.2).
 * Per the RFC, param-values can be either bare `paramtext` (which excludes `;`, `:`, `,`)
 * or a `quoted-string`. Backslash escaping does not work in parameter values.
 * If the value contains reserved chars or embedded quotes, quote it and strip any embedded double quotes.
 */
function escapeParamValue(s: string): string {
  const hasReserved = /[;:,]/.test(s);
  const hasQuotes = /"/.test(s);
  if (!hasReserved && !hasQuotes) return s;
  // Strip embedded double quotes and wrap in quotes
  return `"${s.replace(/"/g, '')}"`;
}

// ponytail: hardcoded Swiss timezone; make it a tenant/app-config setting if a
// non-CH tenant ever appears. StoreDate/StoreTime are local wall-clock values.
const TZID = 'Europe/Zurich';

/** Minimal VTIMEZONE for Europe/Zurich — Outlook only honours TZID when the zone is defined. */
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/**
 * Convert StoreDate (yyyyMMdd) + StoreTime (HH:mm) to a local ICS datetime (yyyyMMddTHHmmss).
 * No `Z` — the value is local to TZID and must be emitted with `;TZID=…`.
 * Returns undefined if startDate is empty or invalid.
 */
function toIcsDateTime(storeDate: string, storeTime: string): string | undefined {
  if (!storeDate || storeDate.length !== 8) return undefined;
  const year  = storeDate.substring(0, 4);
  const month = storeDate.substring(4, 6);
  const day   = storeDate.substring(6, 8);
  const timeParts = storeTime?.split(':') ?? [];
  const hh = timeParts[0]?.padStart(2, '0') ?? '00';
  const mm = timeParts[1]?.padStart(2, '0') ?? '00';
  return `${year}${month}${day}T${hh}${mm}00`;
}

/**
 * Convert StoreDate (yyyyMMdd) to ICS date-only value (yyyyMMdd).
 * For full-day events the DTEND is exclusive (next day per RFC 5545).
 */
function toIcsDate(storeDate: string): string | undefined {
  if (!storeDate || storeDate.length !== 8) return undefined;
  return storeDate;
}

/** Add `durationMinutes` to a StoreDate+StoreTime pair and return a local ICS datetime. */
function addMinutes(storeDate: string, storeTime: string, minutes: number): string {
  const timeParts = storeTime?.split(':') ?? [];
  const hh = parseInt(timeParts[0] ?? '0', 10);
  const mm = parseInt(timeParts[1] ?? '0', 10);
  const date = new Date(
    parseInt(storeDate.substring(0, 4), 10),
    parseInt(storeDate.substring(4, 6), 10) - 1,
    parseInt(storeDate.substring(6, 8), 10),
    hh, mm, 0
  );
  date.setMinutes(date.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  // local getters: pure wall-clock arithmetic, independent of the server's TZ
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

/** Add one day to a StoreDate string (yyyyMMdd), returning the next day's StoreDate. */
function nextDay(storeDate: string): string {
  const d = new Date(
    parseInt(storeDate.substring(0, 4), 10),
    parseInt(storeDate.substring(4, 6), 10) - 1,
    parseInt(storeDate.substring(6, 8), 10) + 1
  );
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** Map the app's periodicity value to an RFC 5545 RRULE string (or empty). */
function toRRule(periodicity: string, repeatUntilDate: string): string {
  let freq: string | undefined;
  let interval: number | undefined;
  let byDay: string | undefined;

  switch (periodicity) {
    case 'hourly':    freq = 'HOURLY'; break;
    case 'daily':     freq = 'DAILY'; break;
    case 'workdays':  freq = 'WEEKLY'; byDay = 'MO,TU,WE,TH,FR'; break;
    case 'weekly':    freq = 'WEEKLY'; break;
    case 'biweekly':  freq = 'WEEKLY'; interval = 2; break;
    case 'monthly':   freq = 'MONTHLY'; break;
    case 'quarterly': freq = 'MONTHLY'; interval = 3; break;
    case 'yearly':    freq = 'YEARLY'; break;
    default:          return ''; // 'once', 'never', 'other', or unknown
  }

  let rule = `FREQ=${freq}`;
  if (interval) rule += `;INTERVAL=${interval}`;
  if (byDay) rule += `;BYDAY=${byDay}`;
  if (repeatUntilDate && repeatUntilDate.length === 8) {
    // Kein `Z`: DTSTART ist zonenbehaftet, ein UTC-UNTIL verschiebt das letzte Vorkommen
    // um 1–2 h und lässt es im Abo flackern.
    rule += `;UNTIL=${repeatUntilDate}T235959`;
  }
  return rule;
}

/** Extract the human-readable name from a 'name@key' locationKey. */
function locationName(locationKey: string): string {
  if (!locationKey) return '';
  const atIdx = locationKey.lastIndexOf('@');
  return atIdx > 0 ? locationKey.substring(0, atIdx) : locationKey;
}

export interface IcsOptions {
  appOrigin?: string;
  listIdFor?: (e: CalEventDoc) => string;
  attendee?: { cn: string; email: string };
  partstatFor?: (e: CalEventDoc) => string | undefined;
}

/** Deep-Link auf die bestehende Listenroute; `listId` ist NICHT konstant (siehe Spec). */
function appDeepLink(opts: IcsOptions, e: CalEventDoc): string {
  if (!opts.appOrigin || !opts.listIdFor) return '';
  return `${opts.appOrigin}/calevent/${opts.listIdFor(e)}/c-calevents?event=${e.okey}`;
}

/** Build the full ICS text for a list of CalEventDoc objects. */
export function buildICS(calendarName: string, events: CalEventDoc[], opts: IcsOptions = {}): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    foldLine(`PRODID:-//bkaiser//GenerateCalendarICS//EN`),
    foldLine(`X-WR-CALNAME:${escapeText(calendarName)}`),
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...VTIMEZONE,
  ];

  for (const e of events) {
    const uid = `${e.okey}@bkaiser.ch`;
    const dtstart = e.fullDay
      ? `DTSTART;VALUE=DATE:${toIcsDate(e.startDate)}`
      : `DTSTART;TZID=${TZID}:${toIcsDateTime(e.startDate, e.startTime)}`;
    const dtend = e.fullDay
      ? `DTEND;VALUE=DATE:${toIcsDate(e.endDate && e.endDate.length === 8 ? nextDay(e.endDate) : nextDay(e.startDate))}`
      : `DTEND;TZID=${TZID}:${addMinutes(e.startDate, e.startTime, e.durationMinutes || 60)}`;
    // Serien sind in der DB expandiert (ein Dokument pro Vorkommen) und tragen die
    // Serienfelder als Beschreibung der SERIE, nicht dieses Termins. Ein RRULE würde
    // sie ein zweites Mal expandieren.
    const rrule = e.seriesId ? '' : toRRule(e.periodicity, e.repeatUntilDate);
    const loc = locationName(e.locationKey);

    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:${uid}`));
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(dtstart);
    lines.push(dtend);
    lines.push(foldLine(`SUMMARY:${escapeText(e.name || '')}`));

    // RFC 5545 §3.8.1.11: STATUS tells the subscribed calendar app to grey out/strike a
    // cancelled event instead of leaving it as a normal appointment forever, and to mark a
    // proposed one as unconfirmed.
    if (e.state === 'cancelled') {
      lines.push('STATUS:CANCELLED');
    } else if (e.state === 'proposed') {
      lines.push('STATUS:TENTATIVE');
    }

    const deepLink = appDeepLink(opts, e);
    const description = deepLink
      ? (e.description ? `${e.description}\n\nIm App öffnen: ${deepLink}` : `Im App öffnen: ${deepLink}`)
      : e.description;
    if (description) lines.push(foldLine(`DESCRIPTION:${escapeText(description)}`));
    if (loc)         lines.push(foldLine(`LOCATION:${escapeText(loc)}`));

    // Das benutzererfasste `url` hat Vorrang; der Deep-Link springt nur ein, wenn keins da ist.
    const urlValue = e.url || deepLink;
    if (urlValue) lines.push(foldLine(`URL:${urlValue}`));

    const partstat = opts.partstatFor?.(e);
    if (opts.attendee && partstat) {
      lines.push(foldLine(
        `ATTENDEE;CN=${escapeParamValue(opts.attendee.cn)};PARTSTAT=${partstat}:mailto:${opts.attendee.email}`
      ));
    }

    if (rrule)         lines.push(foldLine(`RRULE:${rrule}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

// ─────────────────────────────────────────────────────────────────────────────
// Authorization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether an event may leave through the UNAUTHENTICATED ICS endpoint.
 *
 * The calendar-key path already refuses closed calendars ("Ohne Token liefert dieser
 * Endpunkt nur noch OFFENE Kalender"), but the `e:<okey>` single-event path bypassed that
 * entirely: it looked the document up by id, so any guessed okey — of any tenant, in any
 * closed group calendar — came back in full. This applies the same rule to both paths.
 *
 * An event is exportable when it is live AND sits in at least one calendar whose
 * `defaultIsOpen` is true. An event in no calendar at all is NOT exportable: there is no
 * open calendar vouching for it, and the tenant-scoped equivalent (`calendars == []`) is
 * served by the token-authenticated `calendarFeed` instead.
 *
 * Pure so the decision is unit-testable without Firestore.
 *
 * @param event      the calevent document
 * @param openByKey  calendar key → `defaultIsOpen`; a key absent from the map counts as closed
 */
export function isPubliclyExportable(
  event: Pick<CalEventDoc, 'isArchived' | 'calendars'>,
  openByKey: Map<string, boolean>
): boolean {
  if (event.isArchived === true) return false;
  return (event.calendars ?? []).some(key => openByKey.get(key) === true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloud Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Public HTTP function that returns an ICS file for one or more calendars.
 * URL: GET /generateCalendarICS?calendar=<key>           (single calendar)
 *      GET /generateCalendarICS?calendar=<k1>,<k2>,<kn>  (merged, deduplicated)
 *      GET /generateCalendarICS?calendar=e:<eventOkey>   (single event)
 *
 * No authentication required, so it serves OPEN calendars only (`defaultIsOpen`) — and, as
 * of 2026-08-24, that rule covers the `e:<okey>` path too. Anything private goes through
 * the token-authenticated `calendarFeed` instead. See isPubliclyExportable.
 *
 * CORS is handled by the Express middleware in main.ts.
 */
export const generateCalendarICS = onRequest(
  { region: 'europe-west6' },
  async (req, res) => {
    const raw = (req.query['calendar'] as string)?.trim();

    if (!raw) {
      res.status(400).send('Missing required query parameter: calendar');
      return;
    }

    const calendarKeys = [...new Set(raw.split(',').map(k => k.trim()).filter(Boolean))];

    logger.info('generateCalendarICS: request', { calendarKeys });

    const db = getFirestore();

    // Separate single-event keys (e:<okey>) from calendar keys
    const eventOkeys = calendarKeys.filter(k => k.startsWith('e:')).map(k => k.slice(2));
    const calKeys    = calendarKeys.filter(k => !k.startsWith('e:'));

    // Fetch calendar names + open flags in parallel (best-effort — fall back to key/closed).
    // A calendar that cannot be read counts as CLOSED: an error must never open a calendar.
    const nameMap = new Map<string, string>();
    const openByKey = new Map<string, boolean>();
    const loadCalendars = async (keys: string[]): Promise<void> => {
      await Promise.all(keys.map(async key => {
        if (openByKey.has(key)) return;
        try {
          const calDoc = await db.collection('calendars').doc(key).get();
          if (calDoc.exists) {
            const cal = calDoc.data() as CalendarDoc;
            nameMap.set(key, cal.title || cal.name || key);
            openByKey.set(key, cal.defaultIsOpen === true);
          } else {
            nameMap.set(key, key);
            openByKey.set(key, false);
          }
        } catch (err) {
          logger.warn('generateCalendarICS: could not fetch calendar doc', { key, err });
          nameMap.set(key, key);
          openByKey.set(key, false);
        }
      }));
    };
    await loadCalendars(calKeys);

    // Ohne Token liefert dieser Endpunkt nur noch OFFENE Kalender. Vorher gab er zu jedem
    // geratenen Schlüssel die Anlässe heraus, auch aus geschlossenen Gruppen. Für alles
    // andere gibt es `calendarFeed` mit Token.
    const openCalKeys = calKeys.filter(k => openByKey.get(k) === true);
    if (openCalKeys.length !== calKeys.length) {
      logger.warn('generateCalendarICS: closed calendar requested without token', {
        requested: calKeys.length, served: openCalKeys.length,
      });
    }

    const calendarName = openCalKeys.map(k => nameMap.get(k) ?? k).join(', ') || 'Events';

    // Fetch events — collect from calendar queries and direct event lookups
    const events: CalEventDoc[] = [];
    const seen = new Set<string>();
    let refusedEvents = 0;

    try {
      // Calendar-based queries
      if (openCalKeys.length === 1) {
        const snap = await db.collection('calevents')
          .where('calendars', 'array-contains', openCalKeys[0])
          .where('isArchived', '==', false)
          .get();
        for (const doc of snap.docs) {
          if (!seen.has(doc.id)) { seen.add(doc.id); events.push({ okey: doc.id, ...doc.data() } as CalEventDoc); }
        }
      } else if (openCalKeys.length > 1) {
        // array-contains-any supports up to 30 values; chunk if needed
        const chunks: string[][] = [];
        for (let i = 0; i < openCalKeys.length; i += 30) chunks.push(openCalKeys.slice(i, i + 30));
        const snapshots = await Promise.all(
          chunks.map(chunk =>
            db.collection('calevents')
              .where('calendars', 'array-contains-any', chunk)
              .where('isArchived', '==', false)
              .get()
          )
        );
        for (const snap of snapshots) {
          for (const doc of snap.docs) {
            if (!seen.has(doc.id)) { seen.add(doc.id); events.push({ okey: doc.id, ...doc.data() } as CalEventDoc); }
          }
        }
      }

      // Direct single-event lookups (e:<okey>). A read by document id never passes through
      // the calendar/tenant filters the query above applies, so each event has to earn its
      // way out via isPubliclyExportable — the same open-calendar rule, applied per event.
      if (eventOkeys.length > 0) {
        const eventDocs = await Promise.all(
          eventOkeys.map(okey => db.collection('calevents').doc(okey).get())
        );
        const candidates = eventDocs
          .filter(doc => doc.exists)
          .map(doc => ({ okey: doc.id, ...doc.data() } as CalEventDoc));

        // The requested events may live in calendars nobody named in the query — load those
        // before judging them, or every direct lookup would fail closed.
        await loadCalendars([...new Set(candidates.flatMap(e => e.calendars ?? []))]);

        for (const event of candidates) {
          if (!isPubliclyExportable(event, openByKey)) {
            refusedEvents++;
            continue;
          }
          if (!seen.has(event.okey)) {
            seen.add(event.okey);
            events.push(event);
          }
        }
      }
    } catch (err) {
      logger.error('generateCalendarICS: Firestore query failed', { err });
      res.status(500).send('Failed to query calendar events.');
      return;
    }

    // Nothing the caller asked for was servable. Answer 404 rather than an empty-but-valid
    // ICS, which reads as "this calendar has no events" and hides the outcome from the user
    // and from the logs. Two independent cases, both 404:
    //   - every named CALENDAR was closed or unknown (openCalKeys empty while calKeys is not);
    //   - every named EVENT was refused OR does not exist.
    // The second deliberately does not distinguish refused from missing: a 404 either way is
    // what stops the endpoint confirming that a private event id exists.
    // An OPEN calendar that genuinely holds no events still gets its empty file — it is not
    // this branch, because at least one calendar was served.
    if (events.length === 0 && openCalKeys.length === 0 && (calKeys.length > 0 || eventOkeys.length > 0)) {
      logger.warn('generateCalendarICS: nothing exportable', {
        requestedCalendars: calKeys.length, requestedEvents: eventOkeys.length, refusedEvents,
      });
      res.status(404).send('No public calendar or event found for the requested key(s).');
      return;
    }

    logger.info('generateCalendarICS: found events', {
      calendarKeys, count: events.length, refusedEvents,
    });

    const ics = buildICS(calendarName, events);
    const filename = calendarKeys.join('_').replace(/[^a-zA-Z0-9_-]/g, '_') + '.ics';

    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(ics);
  }
);
