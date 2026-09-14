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
      fields.push(IMAGES_PREFIX);
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
    case 'hero':
      if (showAdvanced) fields.push(...IMAGE_STYLE_FIELDS);
      break;
    case 'iframe':
      fields.push('url', 'style');
      break;
    case 'map':
      fields.push('centerLatitude', 'centerLongitude', 'zoom', 'useCurrentLocationAsCenter');
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
    inlineField === IMAGES_PREFIX ? field.startsWith(IMAGES_PREFIX) : inlineField === field);
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

/** Messages of a single field, safe for a template call on a possibly missing key. */
export function getFieldErrors(errors: SectionErrors | undefined, field: string): string[] {
  return errors?.[field] ?? [];
}

/** All `images[i].*` messages, flattened — the image list shows them below its card. */
export function getImageErrors(errors: SectionErrors | undefined): string[] {
  if (!errors) return [];
  return Object.entries(errors)
    .filter(([field]) => field.startsWith(IMAGES_PREFIX))
    .flatMap(([, messages]) => messages);
}
