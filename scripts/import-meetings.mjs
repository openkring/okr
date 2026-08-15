/**
 * One-time import of the Seeclub Stäfa Vorstandssitzung minutes (CSV exports of the
 * Traktanden spreadsheets, 2019–2026) into `meetings`, `tasks` and `locations`.
 *
 * Per file:
 *   meetings/<yyyymmdd>   one MeetingModel, groupKey 'vorstand', state 'approved'
 *   tasks/<auto>          one TaskModel per non-empty "To Do" cell, relatedKey meeting.<id>
 *   locations/<slug>      the venues (Villa Sunneschy, Restaurant Frohberg, …)
 *
 * The meeting date comes from the "Vorstandssitzung vom dd.mm.yyyy" header INSIDE the
 * file, not from the filename — 20260218.csv is the 18.02.2025 meeting and 20260621.csv
 * is the 21.05.2025 one. The document id is that content date.
 *
 * Idempotent: every document id is derived from the data, so a re-run overwrites rather
 * than duplicates. Tasks are keyed <meetingId>-<agendaKey>-<n> for the same reason.
 *
 * Run with:  node scripts/import-meetings.mjs --dry [--dir <folder>]
 *            node scripts/import-meetings.mjs       [--dir <folder>]
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const TENANT = 'scs';
const GROUP_KEY = 'vorstand';
const DRY_RUN = process.argv.includes('--dry');
const dirArg = process.argv.indexOf('--dir');
const DIR = dirArg > -1 ? process.argv[dirArg + 1] : '/Users/bruno/Desktop/20260609scsVSTraktanden';
const tag = DRY_RUN ? '[dry] ' : '';

/* ------------------------------------------------------------------ CSV */

/** RFC4180 parser — the cells carry embedded newlines, so a split('\n') would shred them. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** One file is cp1252, the rest are UTF-8. Decode strictly, fall back on failure. */
function readText(path) {
  const buf = readFileSync(path);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

const clean = s => (s ?? '').replace(/ /g, ' ').trim();

/* -------------------------------------------------------------- persons */

/**
 * First-name → person aliases for the board roster. The minutes name people by first
 * name only ("Urs", "Claudia"), and several first names are ambiguous club-wide, so the
 * board seat decides. Anything not listed here stays unresolved and is reported.
 */
const ALIASES = {
  dieter: 'Dieter Widmer', bruno: 'Bruno Kaiser', barbara: 'Barbara Kaiser',
  evelyn: 'Evelyn Eisenhauer', evelyne: 'Evelyn Eisenhauer',
  henry: 'Heinrich Fröhlich', heinrich: 'Heinrich Fröhlich',
  ueli: 'Ueli Lott', urs: 'Urs Tischhauser', rolf: 'Rolf Brüggemann',
  esther: 'Esther Walther', claudia: 'Claudia Wehrli', beat: 'Beat Matthaei',
  markus: 'Markus Imholz', stephan: 'Stephan Suter', tom: 'Tom Büchel',
  anne: 'Anne Weyden', 'jean-claude': 'Jean-Claude Perriard',
  'jean claude': 'Jean-Claude Perriard', jcp: 'Jean-Claude Perriard',
  ernst: 'Ernst Schweizer', thomas: 'Thomas Nigg', michel: 'Michel van Haaften',
  res: 'Res Caflisch', brian: 'Brian Büchel', britta: 'Britta Matthesius',
  anna: 'Anna Ingenhoven', rubino: 'Rubino Marconi', stefan: 'Stefan Jucker-Joos',
  irene: 'Irene Timm', christoph: 'Christoph Schubert', chrisotph: 'Christoph Schubert',
  andy: 'Andy Hartmann',
  nadia: 'Nadia Hungerbühler', frank: 'Frank Roskothen', alice: 'Alice Bechtiger',
  carolyn: 'Caroline Burckhardt', werner: 'Werner Merz', max: 'Max Chapman',
  david: 'David Appenzeller', nina: 'Nina Wettstein', 'rené': 'René Wettstein',
};

/** Words that look like a name column entry but never resolve to one person. */
const NON_NAMES = /^(alle|alle vorstandsmitglieder|vorstand|vorstandsmitglieder|team|beide|dito|laufend|zeitnah|situativ|breitensport|leistungssport|infrastruktur|boote|kommunikation|-|)$/i;

/** Prose, not a name: the Vorbereitung column often holds a whole instruction sentence. */
const isNameShaped = t => t.length <= 30 && t.split(/\s+/).length <= 3 && !/[.!?:]/.test(t);

let byFullName = new Map();      // 'Dieter Widmer' → AvatarInfo
const unresolved = new Map();    // token → count

function toAvatar(id, d) {
  return {
    key: id,
    name1: d.firstName ?? '',
    name2: d.lastName ?? '',
    modelType: 'person',
    type: d.gender ?? '',
    subType: '',
    label: `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim(),
  };
}

/**
 * Resolve one token to an avatar. Full name first, then the first-name alias — the
 * minutes misspell two surnames consistently (Eisenhauser/Eisenhauer, Henry/Heinrich
 * Fröhlich), and falling back on the first name absorbs both without a spelling table.
 */
function resolvePerson(token) {
  const t = clean(token);
  if (!t || NON_NAMES.test(t)) return undefined;
  const full = byFullName.get(t.toLowerCase());
  if (full) return full;
  // "Leistungssportchef Urs" / "Breitensportchefin Claudia" put the role before the name
  const words = t.split(/\s+/);
  const alias = ALIASES[t.toLowerCase()] ?? ALIASES[words[0].toLowerCase()] ?? ALIASES[words.at(-1).toLowerCase()];
  if (alias) return byFullName.get(alias.toLowerCase());
  if (isNameShaped(t)) unresolved.set(t, (unresolved.get(t) ?? 0) + 1);
  return undefined;
}

/**
 * Split a "Wer"/"Vorbereitung"/"Anwesend" cell into its person tokens. Parentheses go
 * first: "Dieter (Vorsitz, Protokoll)" must not split on the comma inside them.
 */
function splitNames(cell) {
  return clean(cell)
    .replace(/\(.*?\)/gs, ' ')
    .split(/[\n,;/]|\s+und\s+|\s+mit\s+|\s+&\s+|\s+bzw\.\s+/)
    .map(clean)
    .filter(Boolean);
}

function firstPerson(cell) {
  for (const token of splitNames(cell)) {
    const p = resolvePerson(token);
    if (p) return p;
  }
  return undefined;
}

/* ------------------------------------------------------------ locations */

/** Venue text as written in the "Ort:" row → { name, id } of a locations document. */
const VENUES = [
  [/sunneschy/i,                  { id: 'villa-sunneschy', name: 'Villa Sunneschy' }],
  [/frohberg/i,                   { id: 'restaurant-frohberg', name: 'Restaurant Frohberg' }],
  [/obstgarten/i,                 { id: 'restaurant-obstgarten', name: 'Restaurant Obstgarten Männedorf' }],
  [/salzwaag/i,                   { id: 'wirtschaft-salzwaag', name: 'Wirtschaft zur Salzwaag Stäfa' }],
  [/segelclub/i,                  { id: 'segelclub-staefa', name: 'Segelclub Stäfa' }],
  [/sonnenwies/i,                 { id: 'sonnenwiessaal', name: 'Sonnenwiessaal Stäfa' }],
  [/panoramaweg|uerikon/i,        { id: 'panoramaweg-uerikon', name: 'Panoramaweg 1, Uerikon' }],
  [/seeclub/i,                    { id: 'scs', name: 'Seeclub Stäfa' }],   // already exists
];

function resolveVenue(ort) {
  const t = clean(ort);
  if (!t || /videokonferenz|telefonkonferenz|^tbd$/i.test(t)) return undefined;
  for (const [re, loc] of VENUES) if (re.test(t)) return loc;
  return undefined;
}

/* ----------------------------------------------------------------- dates */

const MONTHS = { jan: 1, feb: 2, mar: 3, mär: 3, apr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dez: 12 };
const pad = n => String(n).padStart(2, '0');

/** "Bis wann" is free text; only unambiguous single dates become a dueDate. */
function toStoreDate(raw) {
  const t = clean(raw);
  let m;
  if ((m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/))) return `${m[3]}${pad(m[2])}${pad(m[1])}`;
  if ((m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/))) return `20${m[3]}${pad(m[2])}${pad(m[1])}`;
  if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/))) return `20${m[3]}${pad(m[1])}${pad(m[2])}`;  // US m/d/yy, as exported
  if ((m = t.match(/^(\d{1,2})-([A-Za-zä]{3})-(\d{2})$/))) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) return `20${m[3]}${pad(mo)}${pad(m[1])}`;
  }
  return '';
}

/* ------------------------------------------------------------ one file */

const HEADER_KEYS = {
  traktandum: 'title', traktanden: 'title',
  zeit: 'time', ziel: 'goal', vorbereitung: 'prep',
  entscheid: 'decision', 'kommentar / entscheid': 'decision',
  'to do': 'todo', wer: 'who', 'bis wann': 'due',
  controlling: 'controlling', bemerkungen: 'remarks',
  'bemerkungen, reminder': 'remarks', 'nr.': 'nr',
};

/** Value of a labelled header row ("Ort:", "Anwesend:") — the first non-empty cell after it. */
function headerValue(rows, label) {
  for (const row of rows) {
    const i = row.findIndex(c => clean(c).toLowerCase().startsWith(label));
    if (i > -1) {
      const rest = row.slice(i + 1).map(clean).filter(Boolean);
      if (rest.length) return rest.join(' ');
    }
  }
  return '';
}

function parseFile(file, text) {
  const rows = parseCsv(text);

  // header block ends at the row that names the agenda columns
  const headerRowIdx = rows.findIndex(r => r.some(c => /^traktand/i.test(clean(c))));
  if (headerRowIdx < 0) throw new Error(`${file}: no Traktanden header row`);
  const meta = rows.slice(0, headerRowIdx);

  const dateCell = meta.flat().map(clean).find(c => /vorstandssitzung vom \d{1,2}\.\d{1,2}\.\d{4}/i.test(c));
  if (!dateCell) throw new Error(`${file}: no "Vorstandssitzung vom d.m.yyyy" header`);
  const [, dd, mm, yyyy] = dateCell.match(/vom (\d{1,2})\.(\d{1,2})\.(\d{4})/i);
  const meetingDate = `${yyyy}${pad(mm)}${pad(dd)}`;

  const ort = headerValue(meta, 'ort:');
  const zeit = headerValue(meta, 'zeit:');
  const present = headerValue(meta, 'anwesend:');
  const excused = [headerValue(meta, 'entschuldigt:'), headerValue(meta, 'abwesend:')].filter(Boolean).join(', ');
  const guests = [headerValue(meta, 'gäste:'), headerValue(meta, 'gäste zum')].filter(Boolean).join(', ');

  // column index → logical field
  const cols = {};
  rows[headerRowIdx].forEach((c, i) => {
    const key = HEADER_KEYS[clean(c).toLowerCase()];
    if (key && cols[key] === undefined) cols[key] = i;
  });
  const at = (row, key) => (cols[key] === undefined ? '' : clean(row[cols[key]]));

  const agenda = [];
  const todos = [];
  for (const row of rows.slice(headerRowIdx + 1)) {
    if (!row.some(c => clean(c))) continue;
    const title = at(row, 'title');
    const goal = at(row, 'goal');
    const prep = at(row, 'prep');
    const decision = at(row, 'decision');
    const todo = at(row, 'todo');
    const who = at(row, 'who');
    const due = at(row, 'due');
    const controlling = at(row, 'controlling');
    const remarks = at(row, 'remarks');
    if (!title && !goal && !prep && !decision && !todo) continue;

    const key = String(agenda.length + 1);
    const minutes = [
      goal && `Ziel: ${goal}`,
      prep && `Vorbereitung: ${prep}`,
      controlling && `Controlling: ${controlling}`,
      remarks && `Bemerkungen: ${remarks}`,
    ].filter(Boolean).join('\n\n');

    agenda.push({
      key,
      title: title || '(ohne Titel)',
      owner: firstPerson(prep) ?? null,
      timeBoxMinutes: Number.parseInt(at(row, 'time'), 10) || 10,
      kind: /genehmigung|entscheid|beschluss|bewilligung|festlegung|festgelegt|definiert|bestimmt/i.test(goal) ? 'decision'
          : /information|updated|kenntnis|^info/i.test(goal) ? 'info'
          : 'discussion',
      minutes,
      decision,
      carriedFromMeetingKey: '',
    });

    if (todo) todos.push({ agendaKey: key, title, todo, who, due, controlling });
  }

  return { file, meetingDate, ort, zeit, present, excused, guests, agenda, todos };
}

/* ------------------------------------------------------------ modelling */

function attendeesOf(parsed) {
  const out = [], seen = new Set();
  const add = (cell, state) => {
    for (const token of splitNames(cell)) {
      const p = resolvePerson(token);
      if (p && !seen.has(p.key)) { seen.add(p.key); out.push({ person: p, state }); }
    }
  };
  add(parsed.present, 'present');
  add(parsed.excused, 'excused');
  add(parsed.guests, 'present');
  return out;
}

/** "(Vorsitz)" / "(Protokoll)" mark the two roles inside the Anwesend cell. */
function roleOf(present, role) {
  for (const part of clean(present).split(/,(?![^(]*\))/)) {
    if (new RegExp(role, 'i').test(part)) return firstPerson(part.replace(/\(.*?\)/g, ''));
  }
  return undefined;
}

function startTimeOf(zeit) {
  const m = clean(zeit).match(/(\d{1,2})[:.]?(\d{2})?\s*(?:Uhr|bis|-|–)/i) ?? clean(zeit).match(/^(\d{1,2})[:.](\d{2})/);
  return m ? `${pad(m[1])}${m[2] ?? '00'}` : '';
}

function addIndexElement(index, key, value) {
  if (!key || value === '' || value === undefined) return index;
  return index.length === 0 ? `${key}:${value}` : `${index} ${key}:${value}`;
}

function meetingIndex(m) {
  let i = '';
  i = addIndexElement(i, 'n', m.name);
  i = addIndexElement(i, 'd', m.meetingDate);
  i = addIndexElement(i, 'g', m.groupKey);
  if (m.chair) i = addIndexElement(i, 'c', `${m.chair.name1} ${m.chair.name2}`);
  if (m.secretary) i = addIndexElement(i, 's', `${m.secretary.name1} ${m.secretary.name2}`);
  return i;
}

const displayDate = d => `${d.slice(6, 8)}.${d.slice(4, 6)}.${d.slice(0, 4)}`;

function buildMeeting(parsed, previousMeetingKey) {
  const venue = resolveVenue(parsed.ort);
  const m = {
    tenants: [TENANT],
    isArchived: false,
    name: `Vorstandssitzung vom ${displayDate(parsed.meetingDate)}`,
    index: '',
    tags: '',
    notes: [parsed.ort && `Ort: ${parsed.ort}`, parsed.zeit && `Zeit: ${parsed.zeit}`].filter(Boolean).join('\n'),
    groupKey: GROUP_KEY,
    calEventKey: '',
    meetingDate: parsed.meetingDate,
    startTime: startTimeOf(parsed.zeit),
    locationKey: venue ? `${venue.name}@${venue.id}` : '',
    chair: roleOf(parsed.present, 'vorsitz') ?? null,
    secretary: roleOf(parsed.present, 'protokoll') ?? null,
    state: 'approved',
    attendees: attendeesOf(parsed),
    agenda: parsed.agenda,
    previousMeetingKey,
    minutesDocumentKey: '',
  };
  m.index = meetingIndex(m);
  return m;
}

/** Long To-Do cells: the first sentence/line is the task name, the whole cell the notes. */
function taskName(todo) {
  const first = todo.split('\n').map(clean).find(Boolean) ?? todo;
  return first.length > 100 ? `${first.slice(0, 97)}…` : first;
}

function buildTask(meetingId, meetingDate, secretary, t, n) {
  const before2026 = meetingDate < '20260101';
  const due = toStoreDate(t.due);
  const assignee = firstPerson(t.who) ?? null;
  const author = secretary ?? null;   // the minute-taker is who wrote the To-Do down

  let index = addIndexElement('', 'n', taskName(t.todo));
  if (author) {
    index = addIndexElement(index, 'an', `${author.name1} ${author.name2}`);
    index = addIndexElement(index, 'ak', author.key);
  }
  if (assignee) {
    index = addIndexElement(index, 'asn', `${assignee.name1} ${assignee.name2}`);
    index = addIndexElement(index, 'ask', assignee.key);
  }

  return {
    id: `${meetingId}-${t.agendaKey}-${n}`,
    data: {
      tenants: [TENANT],
      isArchived: false,
      name: taskName(t.todo),
      index,
      tags: '',
      notes: [
        t.title && `Traktandum: ${t.title}`,
        `To Do: ${t.todo}`,
        t.who && `Wer: ${t.who}`,
        t.due && `Bis wann: ${t.due}`,
        t.controlling && `Controlling: ${t.controlling}`,
      ].filter(Boolean).join('\n\n'),
      author,
      assignee,
      state: before2026 ? 'done' : 'initial',
      dueDate: due,
      completionDate: before2026 ? (due || meetingDate) : '',
      priority: 'medium',
      importance: 'medium',
      calendars: [],
      rank: '',
      relatedModelType: 'meeting',
      relatedKey: `meeting.${meetingId}`,
    },
  };
}

/* ------------------------------------------------------------------ run */

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

const persons = await db.collection('persons').where('tenants', 'array-contains', TENANT).get();
byFullName = new Map(persons.docs.map(d => {
  const a = toAvatar(d.id, d.data());
  return [`${a.name1} ${a.name2}`.trim().toLowerCase(), a];
}));
console.log(`${tag}persons loaded: ${byFullName.size}`);

const files = readdirSync(DIR).filter(f => f.endsWith('.csv')).sort();
const parsed = files.map(f => parseFile(f, readText(join(DIR, f)))).sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));

// venues actually referenced, in the order the meetings use them
const venues = new Map();
for (const p of parsed) {
  const v = resolveVenue(p.ort);
  if (v && v.id !== 'scs') venues.set(v.id, v);
}

let previous = '';
const meetings = [], tasks = [];
for (const p of parsed) {
  const id = p.meetingDate;
  const meeting = buildMeeting(p, previous);
  meetings.push({ id, data: meeting });
  p.todos.forEach((t, n) => tasks.push(buildTask(id, p.meetingDate, meeting.secretary, t, n + 1)));
  previous = id;
}

console.log(`\n${tag}${meetings.length} meetings, ${tasks.length} tasks, ${venues.size} new locations`);
for (const m of meetings) {
  const mismatch = parsed.find(p => p.meetingDate === m.id).file.replace('.csv', '') !== m.id ? '  <-- filename differs' : '';
  console.log(`  ${m.id}  ${String(m.data.agenda.length).padStart(2)} items  ${String(m.data.attendees.length).padStart(2)} attendees  ` +
    `chair=${m.data.chair?.label ?? '—'}  prot=${m.data.secretary?.label ?? '—'}  loc=${m.data.locationKey || '—'}${mismatch}`);
}

if (unresolved.size) {
  console.log(`\n${tag}unresolved name tokens (left empty, text preserved):`);
  [...unresolved.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`  ${String(n).padStart(3)}x  ${t}`));
}

if (DRY_RUN) {
  console.log('\n[dry] sample meeting:', JSON.stringify(meetings[0], null, 1).slice(0, 2000));
  console.log('\n[dry] sample task:', JSON.stringify(tasks[0], null, 1));
  console.log('\n[dry] nothing written.');
  process.exit(0);
}

let batch = db.batch(), n = 0;
const flush = async () => { if (n) { await batch.commit(); batch = db.batch(); n = 0; } };
const put = async (ref, data) => { batch.set(ref, data); if (++n >= 400) await flush(); };

for (const v of venues.values()) {
  await put(db.collection('locations').doc(v.id), {
    tenants: [TENANT], isArchived: false, index: `n:${v.name}`, name: v.name,
    address: '', tags: '', type: 'address', latitude: 0, longitude: 0, placeId: '',
    what3words: '', seaLevel: 0, speed: 0, direction: 0, distance: 0,
    notes: 'Sitzungsort Vorstand (Import Traktanden-Archiv)',
  });
}
for (const m of meetings) await put(db.collection('meetings').doc(m.id), m.data);
for (const t of tasks) await put(db.collection('tasks').doc(t.id), t.data);
await flush();

console.log(`\nwritten: ${venues.size} locations, ${meetings.length} meetings, ${tasks.length} tasks`);
