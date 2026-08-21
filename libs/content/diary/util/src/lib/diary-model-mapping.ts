import { AvatarInfo, DEFAULT_DIARY_WEATHER, DiaryModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { DiaryFile } from './diary-file';
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
const DONE_ITEM = /^-\s*(?:\[[ xX]\]\s*)?(.+)$/;

function sectionContent(file: DiaryFile, heading: string): string {
  return file.sections.find(section => section.heading === heading)?.content ?? '';
}

function doneItems(file: DiaryFile): string[] {
  // sub-headings such as '### Verein' start their own section, so collect every section
  // from '## Erledigt' onwards until the next '## ' heading.
  const start = file.sections.findIndex(section => section.heading === DONE_HEADING);
  if (start < 0) {
    return [];
  }
  const items: string[] = [];
  for (let i = start; i < file.sections.length; i++) {
    if (i > start && file.sections[i].heading.startsWith('## ')) {
      break;
    }
    for (const line of file.sections[i].content.split('\n')) {
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
  model.text = sectionContent(file, THOUGHTS_HEADING).trim();
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
