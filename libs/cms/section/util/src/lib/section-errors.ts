import { MailBlock, SectionType } from '@okr/shared-models';

import { isObject } from './article-block.util';

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
/** Marks the `hero.url`-style keys of a hero's background image slot (see optionalImageSlotValidations). */
const HERO_IMAGE_PREFIX = 'hero.';
/** Marks the `gradient.from` / `gradient.to` keys of a hero's band colours. */
const HERO_GRADIENT_PREFIX = 'gradient.';
/** Marks the `logo.url`-style keys of a hero's logo slot. */
const LOGO_IMAGE_PREFIX = 'logo.';
/** Inline fields that stand for every key starting with them. */
const PREFIX_FIELDS = [IMAGES_PREFIX, IMPLICIT_VALUES_PREFIX, TILES_PREFIX, CTAS_PREFIX, PEOPLE_PREFIX, HERO_IMAGE_PREFIX, HERO_GRADIENT_PREFIX, LOGO_IMAGE_PREFIX];

/**
 * Field names the configuration components of a given section type render an inline
 * `<okr-error-note>` for. Everything else falls back to the list at the end of the form.
 *
 * Kept in sync by hand with section.form.ts (which child is rendered for which type, and
 * which of them only appear once the advanced toggle is on) and with the vest suites in
 * this lib (which field names they actually produce).
 */
export function getInlineErrorFields(type: SectionType, showAdvanced = false): string[] {
  // section-configuration is rendered for every type; `name` and the intro only in advanced mode
  const fields = ['title', 'subTitle'];
  if (showAdvanced) fields.push('name', 'intro', 'introPosition');

  switch (type) {
    case 'album':
      fields.push('folder', 'albumStyle', 'showVideos', 'showStreamingVideos', 'showDocs', 'showPdfs', 'effect');
      break;
    case 'article':
      // the «Bilder» card (spec 1.154 §5): the layout and the action group are in its Layout segment (always),
      // the rest of the image style in its Styles segment (advanced only)
      fields.push(IMAGES_PREFIX, 'cta.label', 'cta.url', 'imageLayout', 'action', 'zoomFactor', 'background', 'textColor');
      if (showAdvanced) fields.push(...IMAGE_STYLE_FIELDS);
      break;
    case 'button':
      // the button card with its Button / Icon / Aktion segments is always shown (no advanced toggle)
      fields.push(...BUTTON_SEGMENT_FIELDS.button, ...BUTTON_SEGMENT_FIELDS.icon, ...BUTTON_SEGMENT_FIELDS.action);
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
      // the Hero card (image, imgix parameters, height, focus), the Logo card (image, width, border, radius), the Buttons
      fields.push('ctas', CTAS_PREFIX, ...HERO_SEGMENT_FIELDS.image, ...HERO_SEGMENT_FIELDS.style, ...HERO_SEGMENT_FIELDS.layout,
        ...LOGO_SEGMENT_FIELDS.image, ...LOGO_SEGMENT_FIELDS.style);
      break;
    case 'iframe':
      fields.push('url', 'height');
      break;
    case 'contact':
      fields.push('contact.layout', 'contact.rows', 'contact.formFields');
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
      fields.push('url', 'baseUrl', 'documentKey', 'aspectRatio');
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
  layout: ['imageLayout', 'action', 'zoomFactor', 'slideshow.effect', 'slideshow.interval', 'slideshow.duration'],
  styles: IMAGE_STYLE_FIELDS.filter((field) => field !== 'action' && field !== 'zoomFactor'),
};

/**
 * The two tabs of the article form (spec 1.171): «Inhalt» (what the editor writes) and «Darstellung» (how it
 * looks and who sees it). A tab whose fields hold an error gets a marker, so a blocked save is never unexplained.
 */
export const ARTICLE_TAB_FIELDS: SegmentErrorFields<'content' | 'appearance'> = {
  content: ['title', 'subTitle', 'intro', IMAGES_PREFIX, 'cta.label', 'cta.url'],
  appearance: [
    'name', 'roleNeeded', 'state', 'colSize', 'introPosition', 'emphasis', 'background', 'textColor', 'tags', 'notes',
    ...ARTICLE_IMAGES_SEGMENT_FIELDS.layout, ...ARTICLE_IMAGES_SEGMENT_FIELDS.styles,
  ],
};

/** The button card (no advanced toggle): its Button, Icon and Aktion segments. */
export const BUTTON_SEGMENT_FIELDS: SegmentErrorFields<'button' | 'icon' | 'action'> = {
  button: ['style.label', 'style.shape', 'style.fill', 'style.width', 'style.height', 'style.color'],
  icon: ['icon.name', 'icon.size', 'icon.slot'],
  action: ['action.type', 'action.url', 'action.altText'],
};

/**
 * The hero card (spec 1.154, phase 2): the background image; its extra imgix parameters and the gradient colours of the
 * band without image (Stil); the journal's text overlay; height and focus.
 */
export const HERO_SEGMENT_FIELDS: SegmentErrorFields<'image' | 'style' | 'overlay' | 'layout'> = {
  image: [HERO_IMAGE_PREFIX],
  style: ['imgIxParams', HERO_GRADIENT_PREFIX],
  overlay: ['overlay.'],
  layout: ['height', 'focus'],
};

/** The hero's optional logo card: the logo image and the parts of the image style that act on it. */
export const LOGO_SEGMENT_FIELDS: SegmentErrorFields<'image' | 'style'> = {
  image: [LOGO_IMAGE_PREFIX],
  style: ['width', 'border', 'borderRadius'],
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

// ---- the article editor (spec 1.175 §7.8) and the one of a mail (1.176): errors by block ----

const BLOCKS_PREFIX = 'blocks.';

/** The ids of all blocks, columns' content included, in reading order (a columns block before its content). */
function blockIdsInOrder(blocks: MailBlock[] | undefined): string[] {
  const ids: string[] = [];
  const walk = (list: unknown): void => {
    if (!Array.isArray(list)) return;
    for (const block of list) {
      if (!isObject(block)) continue;
      if (typeof block['id'] === 'string' && block['id'] !== '') ids.push(block['id']);
      if (Array.isArray(block['columns'])) {
        for (const column of block['columns']) if (isObject(column)) walk(column['blocks']);
      }
    }
  };
  walk(blocks);
  return ids;
}

/** The longest of `ids` that owns `key` (`blocks.<id>.<field>`); ids may contain dots, so the key is never split. */
function ownerOf(key: string, ids: string[]): { id: string; field: string } | undefined {
  if (!key.startsWith(BLOCKS_PREFIX)) return undefined;
  let owner: string | undefined;
  for (const id of ids) {
    if (key.startsWith(`${BLOCKS_PREFIX}${id}.`) && (owner === undefined || id.length > owner.length)) owner = id;
  }
  return owner === undefined ? undefined : { id: owner, field: key.slice(BLOCKS_PREFIX.length + owner.length + 1) };
}

/**
 * The errors of one block under its field names: `blocks.<id>.x` becomes `x`. The flat names the existing parts
 * look for are added: `imageStyle.width` also as `width`, `image.url` also as `images[0].url`. `blocks` is needed so an
 * id that is a prefix of another (`a` and `a.b`) does not take the other's errors.
 */
export function blockErrors(errors: SectionErrors | undefined, id: string, blocks: MailBlock[]): SectionErrors {
  const ids = [...new Set([...blockIdsInOrder(blocks), id])];
  const out: SectionErrors = {};
  for (const [key, messages] of Object.entries(errors ?? {})) {
    if (!messages?.length) continue;
    const owned = ownerOf(key, ids);
    if (owned?.id !== id) continue;
    out[owned.field] = messages;
    if (owned.field.startsWith('imageStyle.')) out[owned.field.slice('imageStyle.'.length)] = messages;
    if (owned.field.startsWith('image.')) out[`images[0].${owned.field.slice('image.'.length)}`] = messages;
  }
  return out;
}

/** The ids of the blocks that have an error, in reading order. */
export function blockIdsWithErrors(errors: SectionErrors | undefined, blocks: MailBlock[]): string[] {
  const ids = blockIdsInOrder(blocks);
  const withErrors = new Set<string>();
  for (const [key, messages] of Object.entries(errors ?? {})) {
    if (!messages?.length) continue;
    const owned = ownerOf(key, ids);
    if (owned) withErrors.add(owned.id);
  }
  return ids.filter((id) => withErrors.has(id));
}

/**
 * Everything that is not a known block's: the article's own fields, the `blocks` count / id errors, and a `blocks.*`
 * key that no block owns (an empty id in stored data), so such an error is never invisible.
 */
export function articleOwnErrors(errors: SectionErrors | undefined, blocks: MailBlock[]): SectionErrors {
  const ids = blockIdsInOrder(blocks);
  return Object.fromEntries(Object.entries(errors ?? {}).filter(([key]) => !ownerOf(key, ids)));
}
