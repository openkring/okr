import { AvatarInfo, DEFAULT_DIARY_WEATHER, DiaryModel } from '@okr/shared-models';
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
  return sectionsUnder(file, THOUGHTS_HEADING)
    .map((section, index) => (index === 0 ? section.content : `${section.heading}${section.content}`))
    .join('')
    .trim();
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

export function toDiaryModel(
  file: DiaryFile,
  tenantId: string,
  authorKey: string,
  resolver: DiaryResolver
): DiaryModel {
  const model = new DiaryModel(tenantId);
  model.authorKey = authorKey;
  // isStrict = false: the import never aborts, it reports — a missing or unparseable date
  // must leave the entry visibly dateless rather than throw and abort the whole run.
  model.date = convertDateFormatToString(fmScalar(file, 'date'), DateFormat.IsoDate, DateFormat.StoreDate, false);
  model.title = fmScalar(file, 'title');
  model.text = thoughtsText(file);
  model.done = doneItems(file);
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
