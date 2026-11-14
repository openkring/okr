import { HeroConfig, SectionModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, sunTimesLine } from '@okr/shared-util-core';
import { FootprintView, weatherLine } from './journal-view.util';

/**
 * The footprint facts a story shows (spec 1.113 §9.2, 1.154 decision 9): the chips of an overview card and the
 * hero's title, place and chips. The hero record stores only its switches and cover; its text is filled from the
 * footprint at render time, so renaming the footprint never leaves a stale hero title.
 */

function coordinate(value: number, positive: string, negative: string): string {
  const abs = Math.abs(value);
  let degrees = Math.floor(abs);
  let minutes = Math.round((abs - degrees) * 60);
  if (minutes === 60) { degrees += 1; minutes = 0; }
  return `${degrees}°${minutes}′${value < 0 ? negative : positive}`;
}

function viewDate(footprint: FootprintView): string {
  return footprint.date ? convertDateFormatToString(footprint.date, DateFormat.StoreDate, DateFormat.ViewDate, false) : '';
}

function coordinates(footprint: FootprintView): string {
  if (footprint.latitude === undefined || footprint.longitude === undefined) return '';
  return `${coordinate(footprint.latitude, 'N', 'S')} ${coordinate(footprint.longitude, 'E', 'W')}`;
}

/** Short facts for an overview card: date (dd.MM.yyyy), time, coordinates in degrees and minutes, weather. */
export function footprintChips(footprint: FootprintView): string[] {
  return [viewDate(footprint), footprint.time, coordinates(footprint), weatherLine(footprint.weather)].filter((c) => c !== '');
}

/** The hero's chips: date, coordinates, weather, sun times. */
export function footprintHeroChips(footprint: FootprintView): string[] {
  return [viewDate(footprint), coordinates(footprint), weatherLine(footprint.weather), sunTimesLine(footprint.weather)].filter((c) => c !== '');
}

/** A journal hero section with its title, subtitle and chips filled from the footprint; any other section unchanged. */
export function filledHero(section: SectionModel, footprint: FootprintView): SectionModel {
  if (section.type !== 'hero') return section;
  const properties: HeroConfig = { ...section.properties, chips: footprintHeroChips(footprint) };
  return { ...section, title: footprint.title, subTitle: footprint.placeName, properties };
}

const isStoreDate = (d: string | undefined): d is string => !!d && /^\d{8}$/.test(d);

function storeDateMs(d: string): number {
  return Date.UTC(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)));
}

/** The first day of the trip: the journal's start date, else the earliest footprint date; '' when nothing is dated. */
export function travelStartDate(journal: { startDate?: string }, footprints: readonly { date: string }[]): string {
  if (isStoreDate(journal.startDate)) return journal.startDate;
  return footprints.map((f) => f.date).filter(isStoreDate).sort()[0] ?? '';
}

/** The day of the trip a store date falls on, the start date being day 1; 0 when either date is missing or before the start. */
export function travelDay(date: string, startDate: string): number {
  if (!isStoreDate(date) || !isStoreDate(startDate)) return 0;
  const day = Math.round((storeDateMs(date) - storeDateMs(startDate)) / 86_400_000) + 1;
  return day >= 1 ? day : 0;
}

/**
 * The lines a journal hero draws over its cover (`okr-hero-section` `overlayText`, spec 1.154 §4): the footprint's
 * title, the subtitle «place · day N · date», the coordinates and the weather. Which of them show is the hero's
 * `overlay` setting. `dayLabel` turns the day number into the translated text («Tag 3»).
 */
export function footprintOverlayText(
  footprint: FootprintView, startDate: string, dayLabel: (day: number) => string,
): { title: string; subtitle: string; coords: string; weather: string } {
  const day = travelDay(footprint.date, startDate);
  return {
    title: footprint.title,
    subtitle: [footprint.placeName, day > 0 ? dayLabel(day) : '', viewDate(footprint)].filter((s) => s !== '').join(' · '),
    coords: coordinates(footprint),
    weather: weatherLine(footprint.weather),
  };
}
