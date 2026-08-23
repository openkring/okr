import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

export { getPublicCalEvents } from './public-calevents';

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
}

interface CalendarDoc {
  name: string;
  title: string;
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
// Cloud Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Public HTTP function that returns an ICS file for one or more calendars.
 * URL: GET /generateCalendarICS?calendar=<key>           (single calendar)
 *      GET /generateCalendarICS?calendar=<k1>,<k2>,<kn>  (merged, deduplicated)
 *
 * No authentication required — calendar data is considered public.
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

    // Fetch calendar names for all calendar keys in parallel (best-effort — fall back to key)
    const nameMap = new Map<string, string>();
    await Promise.all(calKeys.map(async key => {
      try {
        const calDoc = await db.collection('calendars').doc(key).get();
        if (calDoc.exists) {
          const cal = calDoc.data() as CalendarDoc;
          nameMap.set(key, cal.title || cal.name || key);
        } else {
          nameMap.set(key, key);
        }
      } catch (err) {
        logger.warn('generateCalendarICS: could not fetch calendar doc', { key, err });
        nameMap.set(key, key);
      }
    }));

    const calendarName = calKeys.map(k => nameMap.get(k) ?? k).join(', ') || 'Events';

    // Fetch events — collect from calendar queries and direct event lookups
    let events: CalEventDoc[] = [];
    const seen = new Set<string>();

    try {
      // Calendar-based queries
      if (calKeys.length === 1) {
        const snap = await db.collection('calevents')
          .where('calendars', 'array-contains', calKeys[0])
          .where('isArchived', '==', false)
          .get();
        for (const doc of snap.docs) {
          if (!seen.has(doc.id)) { seen.add(doc.id); events.push({ okey: doc.id, ...doc.data() } as CalEventDoc); }
        }
      } else if (calKeys.length > 1) {
        // array-contains-any supports up to 30 values; chunk if needed
        const chunks: string[][] = [];
        for (let i = 0; i < calKeys.length; i += 30) chunks.push(calKeys.slice(i, i + 30));
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

      // Direct single-event lookups (e:<okey>)
      if (eventOkeys.length > 0) {
        const eventDocs = await Promise.all(
          eventOkeys.map(okey => db.collection('calevents').doc(okey).get())
        );
        for (const doc of eventDocs) {
          if (doc.exists && !seen.has(doc.id)) {
            seen.add(doc.id);
            events.push({ okey: doc.id, ...doc.data() } as CalEventDoc);
          }
        }
      }
    } catch (err) {
      logger.error('generateCalendarICS: Firestore query failed', { err });
      res.status(500).send('Failed to query calendar events.');
      return;
    }

    logger.info('generateCalendarICS: found events', { calendarKeys, count: events.length });

    const ics = buildICS(calendarName, events);
    const filename = calendarKeys.join('_').replace(/[^a-zA-Z0-9_-]/g, '_') + '.ics';

    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(ics);
  }
);
