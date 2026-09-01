import { AvatarInfo, DEFAULT_DIARY_WEATHER, DiaryModel, DiaryScope } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { DiaryFile, DiarySection } from './diary-file';
import { fmList, fmNumber, fmScalar } from './diary-frontmatter';

/** Looks up the okr entities a diary entry refers to. Injected so the mapping stays pure. */
export interface DiaryResolver {
  resolvePerson(slug: string): AvatarInfo | undefined;
  resolveLocation(label: string): AvatarInfo | undefined;
  /** returns the trips.okey of the travel trip, or '' when unknown */
  resolveTrip(slug: string): string;
}

const THOUGHTS_HEADING = '## Persönliche Gedanken';
const DONE_HEADING = '## Erledigt';
const DONE_ITEM = /^-\s+(?:\[[ xX]\]\s*)?(.+)$/;

/**
 * The provenance footer that files converted from a PDF carry at the very end. Measured across the
 * whole archive on 2026-08-22: 2259 of 2405 files have it, all in exactly this shape, and
 * '*Original:' occurs nowhere else. Link text and href are always the same file name.
 */
const ORIGIN_FOOTER = /\n-{3}\n\*Original: \[([^\]]+)\]\([^)]*\)\*\n?$/;

/** The file name from the trailing origin footer, or '' when the entry has none. */
export function extractSourceDocument(file: DiaryFile): string {
  const last = file.sections[file.sections.length - 1];
  if (!last) {
    return '';
  }
  return ORIGIN_FOOTER.exec(last.content)?.[1] ?? '';
}

/**
 * Every section from `heading` up to (not including) the next `## `-level heading.
 * A sub-heading the author writes inside a section (e.g. '### Verein') starts its own
 * DiarySection, so a section's full content is the run of sections that follows it.
 */
function sectionsUnder(file: DiaryFile, heading: string): DiarySection[] {
  const start = file.sections.findIndex(section => section.heading === heading);
  if (start < 0) {
    return [];
  }
  let end = start + 1;
  while (end < file.sections.length && !file.sections[end].heading.startsWith('## ')) {
    end++;
  }
  return file.sections.slice(start, end);
}

/** Re-emits the thoughts sections as markdown, dropping only the '## Persönliche Gedanken' line. */
function thoughtsText(file: DiaryFile): string {
  const joined = sectionsUnder(file, THOUGHTS_HEADING)
    .map((section, index) => (index === 0 ? section.content : `${section.heading}${section.content}`))
    .join('');
  return joined.replace(ORIGIN_FOOTER, '').trim();
}

function doneItems(file: DiaryFile): string[] {
  const items: string[] = [];
  for (const section of sectionsUnder(file, DONE_HEADING)) {
    for (const line of section.content.split('\n')) {
      const match = DONE_ITEM.exec(line.trim());
      if (match) {
        items.push(match[1].trim());
      }
    }
  }
  return items;
}

/** Frontmatter `scope:` — anything unrecognised (including absent) is a normal dated day. */
function diaryScope(raw: string): DiaryScope {
  return raw === 'month' || raw === 'year' ? raw : 'day';
}

/**
 * The entry's `date` as StoreDate ('yyyyMMdd'), with the components the scope does not resolve
 * zeroed: '2004-10' + month -> '20041000', '1990' + year -> '19900000'.
 *
 * Why not just parse the ISO date: a coarser scope carries a PARTIAL ISO value ('1990',
 * '2004-10') that no date parser accepts, so it used to convert to '' — and an entry with an
 * empty date is skipped by the import without ever being written. That silently dropped all 345
 * aggregates, i.e. everything the archive holds from before the first daily entry.
 *
 * isStrict = false on the day path: the import never aborts, it reports — a missing or
 * unparseable date must leave the entry visibly dateless rather than throw and abort the run.
 */
function storeDateForScope(raw: string, scope: DiaryScope): string {
  if (scope === 'day') {
    return convertDateFormatToString(raw, DateFormat.IsoDate, DateFormat.StoreDate, false);
  }
  const match = scope === 'year' ? /^(\d{4})$/.exec(raw) : /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) {
    // The scope claims a precision the date does not have — report it as dateless rather than
    // invent a value, so it shows up in the run's `withoutDate` instead of landing on a wrong id.
    return '';
  }
  return scope === 'year' ? `${match[1]}0000` : `${match[1]}${match[2]}00`;
}

export function toDiaryModel(
  file: DiaryFile,
  tenantId: string,
  authorKey: string,
  resolver: DiaryResolver
): DiaryModel {
  const model = new DiaryModel(tenantId);
  model.authorKey = authorKey;
  model.scope = diaryScope(fmScalar(file, 'scope'));
  model.date = storeDateForScope(fmScalar(file, 'date'), model.scope);
  model.title = fmScalar(file, 'title');
  model.text = thoughtsText(file);
  model.done = doneItems(file);
  model.sourceDocument = extractSourceDocument(file);
  model.status = fmScalar(file, 'status') === 'final' ? 'final' : 'draft';

  const locationLabel = fmScalar(file, 'location');
  const location = locationLabel === '' ? undefined : resolver.resolveLocation(locationLabel);
  model.location = location;
  model.customLocationLabel = location ? '' : locationLabel;

  for (const slug of fmList(file, 'people')) {
    const person = resolver.resolvePerson(slug);
    if (person) {
      model.people.push(person);
    } else {
      model.customPeopleLabels.push(slug);
    }
  }

  model.places = fmList(file, 'places');
  model.events = fmList(file, 'events');
  const tripSlug = fmScalar(file, 'trip');
  model.tripKey = tripSlug === '' ? '' : resolver.resolveTrip(tripSlug);

  model.weather = {
    ...DEFAULT_DIARY_WEATHER,
    min: fmNumber(file, 'weather_min') ?? DEFAULT_DIARY_WEATHER.min,
    max: fmNumber(file, 'weather_max') ?? DEFAULT_DIARY_WEATHER.max,
    precip: fmNumber(file, 'weather_precip') ?? DEFAULT_DIARY_WEATHER.precip,
    sunrise: fmScalar(file, 'sunrise'),
    sunset: fmScalar(file, 'sunset'),
  };

  model.tags = fmList(file, 'tags').join(',');
  return model;
}
