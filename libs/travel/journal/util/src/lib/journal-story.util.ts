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
