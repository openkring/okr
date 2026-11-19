/**
 * Maps one event of the LA21 WordPress calendar (Stachethemes Event Calendar, REST `stec/v5/events`)
 * to the fields of a calevent (spec 1.165 §8.4). Pure: no Firestore, no network — the CLI
 * (import-events.mjs) fetches, maps, expands series and writes.
 *
 * The plugin does not expose its taxonomy names, so a mapping file names them:
 *   { "groups": { "<stec_cat id>": "<group key>" }, "locations": { "<stec_loc id>": "<address text>" } }
 *
 * Dates follow the StoreDate/StoreTime local-wall-clock contract (calendar skill): the plugin
 * stores local Zurich time, which is what a calevent stores too — no time-zone shift.
 */

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#39;': "'", '&nbsp;': ' ', '&#8211;': '–', '&#8212;': '—', '&#8222;': '„', '&#8220;': '“', '&#8221;': '”', '&#8217;': '’', '&#038;': '&' };

export function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m) => ENTITIES[m] ?? (m.startsWith('&#x') ? String.fromCodePoint(parseInt(m.slice(3, -1), 16))
      : m.startsWith('&#') ? String.fromCodePoint(parseInt(m.slice(2, -1), 10)) : m));
}

/** html → plain text: paragraphs and breaks become new lines, tags dropped, entities decoded. */
export function htmlToText(html) {
  const text = String(html ?? '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text).replace(/\n{3,}/g, '\n\n').trim();
}

/** RRULE → calevent periodicity; null = a rule a calevent cannot express (imported as one date). */
export function parseRrule(rrule) {
  const parts = Object.fromEntries(String(rrule ?? '').split(';').filter(Boolean).map((p) => p.split('=')));
  if (!parts.FREQ) return { periodicity: 'once', until: '' };
  const until = /^\d{8}$/.test(parts.UNTIL ?? '') ? parts.UNTIL : '';
  if (parts.FREQ === 'WEEKLY' && (!parts.INTERVAL || parts.INTERVAL === '1')) return { periodicity: 'weekly', until };
  if (parts.FREQ === 'WEEKLY' && parts.INTERVAL === '2') return { periodicity: 'biweekly', until };
  if (parts.FREQ === 'YEARLY') return { periodicity: 'yearly', until };
  if (parts.FREQ === 'MONTHLY' && !parts.BYDAY) return { periodicity: 'monthly', until };
  return { periodicity: null, until: '' };
}

function splitDateTime(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(raw ?? ''));
  return m ? { date: `${m[1]}${m[2]}${m[3]}`, time: `${m[4]}:${m[5]}` } : { date: '', time: '' };
}

function minutesBetween(a, b) {
  const t = (s) => new Date(`${s.date.slice(0, 4)}-${s.date.slice(4, 6)}-${s.date.slice(6, 8)}T${s.time}:00Z`).getTime();
  return Math.round((t(b) - t(a)) / 60000);
}

/**
 * @param e   one event of `stec/v5/events`
 * @param map { groups, locations } from the mapping file
 * @returns { model, exdates, warnings } — model holds the calevent fields the import sets
 */
export function mapStecEvent(e, map) {
  const meta = e.meta ?? {};
  const warnings = [];
  const start = splitDateTime(meta.start_date);
  const end = splitDateTime(meta.end_date);
  const fullDay = meta.all_day === 'True' || meta.all_day === true;

  const rule = parseRrule(meta.rrule);
  let periodicity = rule.periodicity ?? 'once';
  if (rule.periodicity === null) warnings.push(`Regel ${meta.rrule} kann ein Termin nicht abbilden: als einzelner Termin übernommen`);
  if (periodicity !== 'once' && !rule.until) {
    warnings.push(`Wiederholung ${meta.rrule} ohne Enddatum: als einzelner Termin übernommen`);
    periodicity = 'once';
  }
  if (!fullDay && start.time === '01:00') warnings.push('Beginn 01:00 sieht nach einem Eingabefehler aus: prüfen');

  const groupKeys = (e.stec_cat ?? []).map((id) => {
    const key = map.groups?.[id] ?? map.groups?.[String(id)];
    if (!key) warnings.push(`Kategorie ${id} hat keine Gruppe in der Zuordnung`);
    return key;
  }).filter(Boolean);
  const location = (e.stec_loc ?? []).map((id) => map.locations?.[id] ?? map.locations?.[String(id)]).find(Boolean) ?? '';
  if ((e.stec_loc ?? []).length > 0 && !location) warnings.push(`Ort ${e.stec_loc.join(',')} hat keinen Text in der Zuordnung`);
  if (e.featured_media) warnings.push(`Bild ${e.featured_media} nicht übernommen (Terminbild noch nicht freigegeben, EV7)`);

  const link = Array.isArray(meta.external_link) ? meta.external_link.find((l) => l && l.url) : undefined;
  const multiDay = fullDay && end.date && end.date !== start.date;

  const model = {
    name: decodeEntities(e.title?.rendered ?? '').trim(),
    description: htmlToText(e.content?.rendered ?? ''),
    startDate: start.date,
    startTime: fullDay ? '' : start.time,
    fullDay,
    durationMinutes: fullDay ? 1440 : Math.max(0, minutesBetween(start, end)),
    endDate: multiDay ? end.date : '',
    periodicity,
    repeatUntilDate: periodicity === 'once' ? '' : rule.until,
    calendars: ['public', ...new Set(groupKeys)],
    locations: location ? [{ key: '', name1: '', name2: '', modelType: 'location', type: '', subType: '', label: location }] : [],
    url: link?.url ?? '',
    urlLabel: link?.label ?? '',
    state: meta.event_status === 'EventCancelled' ? 'cancelled' : 'definitive',
  };
  const exdates = Array.isArray(meta.exdate) ? [...new Set(meta.exdate.filter((d) => /^\d{8}$/.test(d)))] : [];
  return { model, exdates, warnings };
}

/**
 * The dates of the calevents to write: the event's date, or for a series the dates the app itself
 * would materialise (`recurring` = calculateRecurringDates of @okr/shared-util-core) minus the
 * plugin's excluded dates.
 */
export function occurrenceDates(model, exdates, recurring) {
  if (model.periodicity === 'once') return [model.startDate];
  const skip = new Set(exdates);
  return recurring(model.startDate, model.repeatUntilDate, model.periodicity).filter((d) => !skip.has(d));
}
