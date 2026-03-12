import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// Types (inlined to avoid monorepo cross-bundle imports)
// ─────────────────────────────────────────────────────────────────────────────

interface CalEventDoc {
  bkey: string;
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
 * Convert StoreDate (yyyyMMdd) + StoreTime (HH:mm) to ICS datetime string (yyyyMMddTHHmmssZ).
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
  return `${year}${month}${day}T${hh}${mm}00Z`;
}

/**
 * Convert StoreDate (yyyyMMdd) to ICS date-only value (yyyyMMdd).
 * For full-day events the DTEND is exclusive (next day per RFC 5545).
 */
function toIcsDate(storeDate: string): string | undefined {
  if (!storeDate || storeDate.length !== 8) return undefined;
  return storeDate;
}

/** Add `durationMinutes` to a StoreDate+StoreTime pair and return ICS datetime. */
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
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
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
    rule += `;UNTIL=${repeatUntilDate}T235959Z`;
  }
  return rule;
}

/** Extract the human-readable name from a 'name@key' locationKey. */
function locationName(locationKey: string): string {
  if (!locationKey) return '';
  const atIdx = locationKey.lastIndexOf('@');
  return atIdx > 0 ? locationKey.substring(0, atIdx) : locationKey;
}

/** Build the full ICS text for a list of CalEventDoc objects. */
function buildICS(calendarName: string, events: CalEventDoc[]): string {
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
  ];

  for (const e of events) {
    const uid = `${e.bkey}@bkaiser.ch`;
    const dtstart = e.fullDay
      ? `DTSTART;VALUE=DATE:${toIcsDate(e.startDate)}`
      : `DTSTART:${toIcsDateTime(e.startDate, e.startTime)}`;
    const dtend = e.fullDay
      ? `DTEND;VALUE=DATE:${toIcsDate(e.endDate && e.endDate.length === 8 ? nextDay(e.endDate) : nextDay(e.startDate))}`
      : `DTEND:${addMinutes(e.startDate, e.startTime, e.durationMinutes || 60)}`;
    const rrule = toRRule(e.periodicity, e.repeatUntilDate);
    const loc = locationName(e.locationKey);

    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:${uid}`));
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(dtstart);
    lines.push(dtend);
    lines.push(foldLine(`SUMMARY:${escapeText(e.name || '')}`));
    if (e.description) lines.push(foldLine(`DESCRIPTION:${escapeText(e.description)}`));
    if (loc)           lines.push(foldLine(`LOCATION:${escapeText(loc)}`));
    if (e.url)         lines.push(foldLine(`URL:${e.url}`));
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
 * Public HTTP function that returns an ICS file for a given calendar.
 * URL: GET /generateCalendarICS?calendar=<calendarBkey>
 *
 * No authentication required — calendar data is considered public.
 * CORS is handled by the Express middleware in main.ts.
 */
export const generateCalendarICS = onRequest(
  { region: 'europe-west6' },
  async (req, res) => {
    const calendarKey = (req.query['calendar'] as string)?.trim();

    if (!calendarKey) {
      res.status(400).send('Missing required query parameter: calendar');
      return;
    }

    logger.info('generateCalendarICS: request', { calendarKey });

    const db = getFirestore();

    // Fetch calendar name (best-effort — fall back to key if not found)
    let calendarName = calendarKey;
    try {
      const calDoc = await db.collection('calendars').doc(calendarKey).get();
      if (calDoc.exists) {
        const cal = calDoc.data() as CalendarDoc;
        calendarName = cal.title || cal.name || calendarKey;
      }
    } catch (err) {
      logger.warn('generateCalendarICS: could not fetch calendar doc', { calendarKey, err });
    }

    // Fetch events belonging to this calendar
    let events: CalEventDoc[] = [];
    try {
      const snap = await db.collection('calevents')
        .where('calendars', 'array-contains', calendarKey)
        .where('isArchived', '==', false)
        .get();
      events = snap.docs.map(doc => ({ bkey: doc.id, ...doc.data() } as CalEventDoc));
    } catch (err) {
      logger.error('generateCalendarICS: Firestore query failed', { err });
      res.status(500).send('Failed to query calendar events.');
      return;
    }

    logger.info('generateCalendarICS: found events', { calendarKey, count: events.length });

    const ics = buildICS(calendarName, events);

    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${calendarKey}.ics"`);
    res.send(ics);
  }
);
