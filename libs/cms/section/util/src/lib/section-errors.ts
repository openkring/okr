import { SectionType } from '@okr/shared-models';

/** Vest field name → error messages, as returned by `result.getErrors()`. */
export type SectionErrors = Record<string, string[]>;

/** An error that no field renders itself, shown in the form's fallback list. */
export interface SectionErrorEntry {
  field: string;
  messages: string[];
}

/** Field names of ImageStyle, validated flat (without a prefix) by imageStyleValidations. */
const IMAGE_STYLE_FIELDS = [
  'imgIxParams', 'width', 'height', 'sizes', 'border', 'borderRadius',
  'isThumbnail', 'slot', 'fill', 'hasPriority', 'action', 'zoomFactor'
];

/** Marks the `images[0].url`-style keys produced by imageConfigValidations. */
const IMAGES_PREFIX = 'images[';
/** Marks the `implicitValues.courseId`-style keys of a form section (one fixed value per implicit field). */
const IMPLICIT_VALUES_PREFIX = 'implicitValues.';
/** Marks the `tiles.columns` / `tiles.i0.title`-style keys of a tiles section (see tilesSectionValidations). */
const TILES_PREFIX = 'tiles.';
/** Marks the `ctas[0].label`-style keys of a hero section's call-to-action buttons. */
const CTAS_PREFIX = 'ctas[';
/** Marks the `avatar.imgWidth`-style keys of a people section (see peopleSectionValidations). */
const PEOPLE_PREFIX = 'avatar.';
/** Inline fields that stand for every key starting with them. */
const PREFIX_FIELDS = [IMAGES_PREFIX, IMPLICIT_VALUES_PREFIX, TILES_PREFIX, CTAS_PREFIX, PEOPLE_PREFIX];

/**
 * Field names the configuration components of a given section type render an inline
 * `<okr-error-note>` for. Everything else falls back to the list at the end of the form.
 *
 * Kept in sync by hand with section.form.ts (which child is rendered for which type, and
 * which of them only appear once the advanced toggle is on) and with the vest suites in
 * this lib (which field names they actually produce).
 */
export function getInlineErrorFields(type: SectionType, showAdvanced = false): string[] {
  // section-configuration is rendered for every type; `name` only in advanced mode
  const fields = ['title', 'subTitle'];
  if (showAdvanced) fields.push('name');

  switch (type) {
    case 'album':
      fields.push('folder', 'albumStyle', 'showVideos', 'showStreamingVideos', 'showDocs', 'showPdfs', 'effect');
      break;
    case 'article':
      // the «Bilder» card (spec 1.154 §5): the layout and the action group are in its Layout segment (always),
      // the rest of the image style in its Styles segment (advanced only)
      fields.push(IMAGES_PREFIX, 'cta.label', 'cta.url', 'imageLayout', 'action', 'zoomFactor');
      if (showAdvanced) fields.push(...IMAGE_STYLE_FIELDS);
      break;
    case 'button':
      if (showAdvanced) {
        fields.push(
          'icon.name', 'icon.size', 'icon.slot',
          'style.label', 'style.shape', 'style.fill', 'style.width', 'style.height', 'style.color',
          'action.type', 'action.url', 'action.altText',
          ...IMAGE_STYLE_FIELDS
        );
      }
      break;
    case 'chat':
      fields.push('chat.id', 'chat.name', 'chat.type', 'chat.url', 'chat.description');
      break;
    case 'advent':
      fields.push('adventYear');
      break;
    case 'form':
      fields.push('formKey', 'emailAddresses', IMPLICIT_VALUES_PREFIX, 'closesAt', 'maxResponses', 'closedMessage');
      break;
    case 'hero':
      fields.push('ctas', CTAS_PREFIX);
      if (showAdvanced) fields.push(...IMAGE_STYLE_FIELDS);
      break;
    case 'iframe':
      fields.push('url', 'style');
      break;
    case 'map':
      fields.push('centerLatitude', 'centerLongitude', 'zoom', 'useCurrentLocationAsCenter');
      break;
    case 'tiles':
      fields.push(TILES_PREFIX);
      break;
    case 'news':
    case 'events':
      fields.push('moreUrl');
      break;
    case 'people':
      fields.push(PEOPLE_PREFIX);
      break;
    case 'slider':
      fields.push(IMAGES_PREFIX);
      if (showAdvanced) fields.push(...IMAGE_STYLE_FIELDS);
      break;
    case 'tracker':
      fields.push('autostart', 'intervalInSeconds', 'enableHighAccuracy', 'maximumAge', 'exportFormat');
      break;
    case 'video':
      fields.push('url', 'width', 'height', 'frameborder', 'baseUrl');
      break;
  }
  return fields;
}

/** True when `field` is rendered inline by one of the configuration components. */
export function isInlineErrorField(field: string, inlineFields: string[]): boolean {
  return inlineFields.some((inlineField) =>
    PREFIX_FIELDS.includes(inlineField) ? field.startsWith(inlineField) : inlineField === field);
}

/**
 * The errors that no configuration component shows next to its field — generated fields
 * (okey, index), fields hidden behind the advanced toggle, and anything a suite validates
 * that the form does not offer for editing.
 */
export function getRemainingErrors(errors: SectionErrors, inlineFields: string[]): SectionErrorEntry[] {
  return Object.entries(errors)
    .filter(([field]) => !isInlineErrorField(field, inlineFields))
    .map(([field, messages]) => ({ field, messages }));
}

/**
 * Which fields each segment of a segmented configuration card shows. A field ending in `[` or `.` stands for every
 * key starting with it (`images[0].url`).
 */
export type SegmentErrorFields<S extends string> = Record<S, string[]>;

/** The article's «Bilder» card (spec 1.154 §5). */
export const ARTICLE_IMAGES_SEGMENT_FIELDS: SegmentErrorFields<'select' | 'layout' | 'styles'> = {
  select: [IMAGES_PREFIX],
  layout: ['imageLayout', 'action', 'zoomFactor'],
  styles: IMAGE_STYLE_FIELDS.filter((field) => field !== 'action' && field !== 'zoomFactor'),
};

/** The hero card (spec 1.154, phase 2). */
export const HERO_SEGMENT_FIELDS: SegmentErrorFields<'image' | 'overlay' | 'layout'> = {
  image: ['imgIxParams'],
  overlay: ['overlay.'],
  layout: ['height', 'focus'],
};

/**
 * The segments of `offered` (in that order) that hold at least one error. A segmented card opens on the first of
 * them and marks each, so an error in a closed segment never blocks saving without a visible message.
 */
export function getErrorSegments<S extends string>(errors: SectionErrors | undefined, fields: SegmentErrorFields<S>, offered: readonly S[]): S[] {
  const keys = Object.entries(errors ?? {}).filter(([, messages]) => messages?.length > 0).map(([key]) => key);
  const matches = (key: string, field: string) =>
    field.endsWith('[') || field.endsWith('.') ? key.startsWith(field) : key === field;
  return offered.filter((segment) => keys.some((key) => fields[segment].some((field) => matches(key, field))));
}

/** Messages of a single field, safe for a template call on a possibly missing key. */
export function getFieldErrors(errors: SectionErrors | undefined, field: string): string[] {
  return errors?.[field] ?? [];
}

/** Messages of a field and of its per-item keys (`avatar.info` + `avatar.info[0]` …). */
export function getFieldAndItemErrors(errors: SectionErrors | undefined, field: string): string[] {
  if (!errors) return [];
  return Object.entries(errors)
    .filter(([key]) => key === field || key.startsWith(field + '['))
    .flatMap(([, messages]) => messages);
}

/** All `images[i].*` messages, flattened — the image list shows them below its card. */
export function getImageErrors(errors: SectionErrors | undefined): string[] {
  if (!errors) return [];
  return Object.entries(errors)
    .filter(([field]) => field.startsWith(IMAGES_PREFIX))
    .flatMap(([, messages]) => messages);
}

/**
 * The `implicitValues.<key>` errors whose entry has no row in «Feste Werte» (an AHV key from pasted or legacy
 * data, R1): the card shows them with a button to remove the entry, otherwise nothing would explain why the
 * section cannot be saved.
 */
export function getUnrenderedFixedKeys(errors: SectionErrors | undefined, renderedKeys: string[]): string[] {
  return Object.keys(errors ?? {})
    .filter((field) => field.startsWith(IMPLICIT_VALUES_PREFIX))
    .map((field) => field.slice(IMPLICIT_VALUES_PREFIX.length))
    .filter((key) => key !== '' && !renderedKeys.includes(key));
}

/**
 * Field names the section form renders an inline `<okr-error-note>` for in journal mode (travel journal,
 * spec 1.154): the title of section-configuration (not shown for a hero, whose title comes from the footprint)
 * and the cards of `journalModeSectionFields`. Every other error falls back to the list at the end of the form,
 * so a field the journal hides can never block saving without a message.
 */
export function getJournalInlineErrorFields(type: SectionType): string[] {
  switch (type) {
    case 'hero':
      return ['overlay.darkening', 'overlay.label', 'overlay.color', 'overlay.position', 'overlay.fontSize', 'height', 'focus'];
    case 'article':
      // the «Bilder» card shows the photos and the layout; no Styles, so width, height and fill fall back (decision 8)
      return ['title', IMAGES_PREFIX, 'imageLayout'];
    case 'album':
      return ['title', IMAGES_PREFIX];
    case 'video':
      return ['title', 'clips'];
    case 'map':
      return ['title', 'zoom', 'layer'];
    case 'track':
      return ['title', 'trackKey'];
    default:
      return ['title'];
  }
}
