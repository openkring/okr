import { SectionModel, SectionType } from '@bk2/shared-models';

import { baseSectionValidations } from './base-section.validations';
import { albumSectionValidations } from './album-section.validations';
import { articleSectionValidations } from './article-section.validations';
import { buttonSectionValidations } from './button-section.validations';
import { calendarSectionValidations } from './calendar-section.validations';
import { chartSectionValidations } from './chart-section.validations';
import { chatSectionValidations } from './chat-section.validations';
import { heroSectionValidations } from './hero-section.validations';
import { iframeSectionValidations } from './iframe-section.validations';
import { mapSectionValidations } from './map-section.validations';
import { peopleSectionValidations } from './people-section.validations';
import { sliderSectionValidations } from './slider-section.validations';
import { tableSectionValidations } from './table-section.validations';
import { trackerSectionValidations } from './tracker-section.validations';
import { videoSectionValidations } from './video-section.validations';

/** A section vest suite: takes the section model (and an optional field) and returns the run result. */
export type SectionSuite = (model: SectionModel, field?: string) => ReturnType<typeof baseSectionValidations>;

/**
 * Maps each section type to its vest suite. Types without a dedicated suite fall back to
 * {@link baseSectionValidations} via {@link getSectionValidationSuite}, so every section gets
 * at least base-field validation.
 */
export const SECTION_VALIDATION_SUITES: Partial<Record<SectionType, SectionSuite>> = {
  album: albumSectionValidations as SectionSuite,
  article: articleSectionValidations as SectionSuite,
  button: buttonSectionValidations as SectionSuite,
  cal: calendarSectionValidations as SectionSuite,
  chart: chartSectionValidations as SectionSuite,
  chat: chatSectionValidations as SectionSuite,
  hero: heroSectionValidations as SectionSuite,
  iframe: iframeSectionValidations as SectionSuite,
  map: mapSectionValidations as SectionSuite,
  people: peopleSectionValidations as SectionSuite,
  slider: sliderSectionValidations as SectionSuite,
  table: tableSectionValidations as SectionSuite,
  tracker: trackerSectionValidations as SectionSuite,
  video: videoSectionValidations as SectionSuite
};

/** Returns the suite for a section type, falling back to base-section validation. */
export function getSectionValidationSuite(type: SectionType): SectionSuite {
  return SECTION_VALIDATION_SUITES[type] ?? (baseSectionValidations as SectionSuite);
}

/** Runs the appropriate vest suite for the given section and returns the result. */
export function validateSection(model: SectionModel): ReturnType<typeof baseSectionValidations> {
  return getSectionValidationSuite(model.type)(model);
}
