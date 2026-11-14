import {
  ALBUM_SECTION_SHAPE, ARTICLE_SECTION_SHAPE, HERO_OVERLAY_DEFAULT, HERO_SECTION_SHAPE, IMAGE_CONFIG_SHAPE, ImageConfig,
  JOURNAL_TRACK_SECTION_SHAPE, MAP_SECTION_SHAPE, SECTION_FEEDBACK_DEFAULT, SectionFeedback, SectionModel, VIDEO_SECTION_SHAPE, ViewPosition,
} from '@okr/shared-models';
import { htmlToPlainText } from './journal-forms.util';
import type { SectionView } from './journal-view.util';

/**
 * A footprint's content as CMS sections in the change log (spec 1.154 §2, plan decisions 1–4, 8). A `section`
 * record carries `type`, `title`, `htmlContent`, `order`, `footprintKey` and one field `p_<key>` per top-level
 * property key, so the field-level merge merges per property key. Only the content keys keep both versions of a
 * concurrent edit as a conflict copy; settings keys are last-writer-wins. `feedback` (phase 4, plan decision 4) is one
 * top-level settings field holding `BaseSection.feedback`.
 * Phase 5 adds `map` (settings zoom, layer, showRoute) and `track` (settings `track = { trackKey }`, a reference to the
 * journal's `track` entity, journal-track.util): all settings, so last writer wins.
 */
export const JOURNAL_SECTION_TYPES = ['hero', 'article', 'album', 'video', 'map', 'track'] as const;
export type JournalSectionType = (typeof JOURNAL_SECTION_TYPES)[number];

/** The record fields whose concurrent edits keep both versions (decision 3). */
export const SECTION_CONTENT_FIELDS = ['title', 'htmlContent', 'p_images', 'p_clips'];

export const SECTION_PROPERTY_PREFIX = 'p_';

/** The property keys holding journal image references (`ImageConfig.label` = image key). */
const IMAGE_LIST_KEYS = ['images', 'clips'];
const IMAGE_KEY = 'hero';

const SHAPES: Record<JournalSectionType, SectionModel> = {
  hero: HERO_SECTION_SHAPE,
  article: ARTICLE_SECTION_SHAPE,
  album: ALBUM_SECTION_SHAPE,
  video: VIDEO_SECTION_SHAPE,
  map: MAP_SECTION_SHAPE,
  track: JOURNAL_TRACK_SECTION_SHAPE,
};

export function isJournalSectionType(value: unknown): value is JournalSectionType {
  return (JOURNAL_SECTION_TYPES as readonly unknown[]).includes(value);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * An image reference as stored: the journal image key in `label`, never a resolved url. A url is bound to one
 * device (a local file) or to a few hours (a signed url); the renderer resolves it from the label.
 */
function storedImage(value: unknown): ImageConfig | undefined {
  if (typeof value === 'string') return { ...IMAGE_CONFIG_SHAPE, label: value, url: '', altText: '' };
  if (!isRecord(value)) return undefined;
  return { ...IMAGE_CONFIG_SHAPE, ...value, label: typeof value['label'] === 'string' ? value['label'] : '', url: '' } as ImageConfig;
}

function storedImages(value: unknown): ImageConfig[] {
  return Array.isArray(value) ? value.map(storedImage).filter((i): i is ImageConfig => i !== undefined) : [];
}

/** A property value as stored: image references reduced to their keys, everything else unchanged. */
function storedProperty(key: string, value: unknown): unknown {
  if (IMAGE_LIST_KEYS.includes(key)) return storedImages(value);
  if (key === IMAGE_KEY) return storedImage(value) ?? value;
  return value;
}

/** The record field holding `BaseSection.feedback` (a settings key: last writer wins, never a conflict copy). */
export const SECTION_FEEDBACK_FIELD = 'feedback';

/**
 * A stored `feedback` value as the four switches; a missing switch is on (SECTION_FEEDBACK_DEFAULT). `undefined` for
 * anything that is not an object — `null` is how an edit removes it (changedSectionFields).
 */
export function storedFeedback(value: unknown): SectionFeedback | undefined {
  if (!isRecord(value)) return undefined;
  const on = (key: keyof SectionFeedback): boolean => (typeof value[key] === 'boolean' ? value[key] as boolean : SECTION_FEEDBACK_DEFAULT[key]);
  return { comments: on('comments'), reactions: on('reactions'), imageComments: on('imageComments'), imageReactions: on('imageReactions') };
}

/**
 * The record fields of a section: `type`, `title`, `htmlContent`, one `p_<key>` per property key and `feedback` when
 * the section has one.
 */
export function sectionFieldsOf(section: Pick<SectionModel, 'type' | 'title' | 'content' | 'properties' | 'feedback'>): Record<string, unknown> {
  const fields: Record<string, unknown> = { type: section.type, title: section.title ?? '', htmlContent: section.content?.htmlContent ?? '' };
  const feedback = storedFeedback(section.feedback);
  if (feedback) fields[SECTION_FEEDBACK_FIELD] = feedback;
  for (const [key, value] of Object.entries((section.properties ?? {}) as Record<string, unknown>)) {
    if (value !== undefined) fields[`${SECTION_PROPERTY_PREFIX}${key}`] = storedProperty(key, value);
  }
  return fields;
}

/** Structural equality of plain record values (JSON data: no dates, maps or class instances). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => a[k] !== undefined || b[k] !== undefined));
  return [...keys].every((k) => sameValue(a[k], b[k]));
}

/**
 * The record fields an edit has to write: only those whose value differs from the model the edit started from
 * (`sectionModelOf(before)`), so an unchanged default is never written and a concurrent edit of another key survives.
 * A stored property the edit removed (the hero height back to «Standard») is written as `null`: the change log has no
 * unset, and a `null` property reads as absent, so the type's default applies again. A removed `feedback` likewise.
 */
export function changedSectionFields(before: SectionView, after: SectionModel): Record<string, unknown> {
  const old = sectionFieldsOf(sectionModelOf(before, ''));
  const changed = Object.fromEntries(Object.entries(sectionFieldsOf(after)).filter(([field, value]) => !sameValue(old[field], value)));
  const kept = (after.properties ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(before.properties)) {
    if (value !== undefined && value !== null && kept[key] === undefined) changed[`${SECTION_PROPERTY_PREFIX}${key}`] = null;
  }
  if (before.feedback !== undefined && after.feedback === undefined) changed[SECTION_FEEDBACK_FIELD] = null;
  return changed;
}

/**
 * The section as a CMS `SectionModel`: the type's shape defaults (shared-models `*_SECTION_SHAPE`) overlaid with
 * the view. Image references keep the journal image key in `ImageConfig.label`; their url is resolved by the renderer.
 * The record carries no `content.position` (plan 1.154 phase 3, decision 8): an article always shows its images on top,
 * set here explicitly rather than inherited from the shape, so a single photo is never hidden by a shape default.
 */
export function sectionModelOf(view: SectionView, tenantId: string): SectionModel {
  const shape = SHAPES[view.type];
  const properties: Record<string, unknown> = structuredClone((shape.properties ?? {}) as Record<string, unknown>);
  // a null property was removed by an edit (changedSectionFields): the shape's default applies
  for (const [key, value] of Object.entries(view.properties)) if (value !== null && value !== undefined) properties[key] = storedProperty(key, value);
  return {
    ...shape,
    okey: view.key, name: view.key, type: view.type, title: view.title, subTitle: '', tenants: [tenantId],
    authorKey: view.authorKey, order: view.order,
    content: { ...shape.content, htmlContent: view.htmlContent, ...(view.type === 'article' ? { position: ViewPosition.Top } : {}) },
    properties,
    ...(view.feedback ? { feedback: { ...view.feedback } } : {}),
  } as unknown as SectionModel;
}

const labelsOf = (images: ImageConfig[]): string[] => images.map((i) => i.label).filter((k) => k !== '');

/**
 * The journal photos a section shows: its `images` list and a hero's cover. May name images not (yet) received.
 * A track section's photos live in its `track` entity, not in the section: `sectionImageKeysIn` (journal-track.util)
 * adds them for a caller that holds the journal state.
 */
export function sectionImageKeys(view: Pick<SectionView, 'properties'>): string[] {
  const hero = storedImage(view.properties[IMAGE_KEY]);
  return [...new Set([...labelsOf(storedImages(view.properties['images'])), ...labelsOf(hero ? [hero] : [])])];
}

/** The journal video clips of a section (`clips`), in pick order. */
export function sectionClipKeys(view: Pick<SectionView, 'properties'>): string[] {
  return labelsOf(storedImages(view.properties['clips']));
}

/** The key of the journal `track` a track section refers to (`properties.track.trackKey`); '' when none is chosen. */
export function sectionTrackKey(view: Pick<SectionView, 'properties'>): string {
  const track = view.properties['track'];
  return isRecord(track) && typeof track['trackKey'] === 'string' ? track['trackKey'] : '';
}

/**
 * Whether a section holds anything an author made: a title, text, photos or clips. A hero counts only with a cover —
 * the hero every new footprint starts with is empty until a photo is imported (spec 1.154 §3). A map always shows the
 * footprint; a track counts once a track is chosen.
 */
export function sectionHasContent(view: Pick<SectionView, 'type' | 'title' | 'htmlContent' | 'properties'>): boolean {
  if (view.type === 'hero') return sectionImageKeys(view).length > 0;
  if (view.type === 'map') return true;
  if (view.type === 'track') return sectionTrackKey(view) !== '';
  return view.title.trim() !== '' || htmlToPlainText(view.htmlContent) !== ''
    || sectionImageKeys(view).length > 0 || sectionClipKeys(view).length > 0;
}

/** The types the author may add: a footprint has at most one hero. */
export function addableSectionTypes(sections: SectionView[]): JournalSectionType[] {
  const hasHero = sections.some((s) => s.type === 'hero');
  return JOURNAL_SECTION_TYPES.filter((t) => t !== 'hero' || !hasHero);
}

/**
 * The hero cover a photo import sets (spec 1.154 §3: a new footprint starts with a hero, its cover is the first photo):
 * the footprint's hero (not a conflict copy) gets `imageKey` as cover when it has none yet. `p_hero` is a settings
 * key, so the record carries no bases. Undefined without a photo key, without a hero, or when the hero has a cover.
 */
export function heroCoverPatch(
  sections: Pick<SectionView, 'key' | 'type' | 'properties' | 'conflictOf'>[], imageKey: string | undefined,
): { sectionKey: string; fields: Record<string, unknown> } | undefined {
  const hero = sections.find((s) => s.type === 'hero' && s.conflictOf === undefined);
  if (!imageKey || !hero || sectionImageKeys(hero).length > 0) return undefined;
  return { sectionKey: hero.key, fields: { [`${SECTION_PROPERTY_PREFIX}${IMAGE_KEY}`]: storedImage(imageKey) } };
}

/**
 * The sections of a new footprint: a hero showing the overlay (a CMS hero without `overlay` shows none) with the
 * cover photo, and an empty article. The caller adds `footprintKey` and `order`.
 */
export function newFootprintSections(coverImageKey: string): { type: JournalSectionType; fields: Record<string, unknown> }[] {
  const hero: Record<string, unknown> = { type: 'hero', title: '', htmlContent: '', p_overlay: { ...HERO_OVERLAY_DEFAULT } };
  if (coverImageKey !== '') hero['p_hero'] = storedImage(coverImageKey);
  return [
    { type: 'hero', fields: hero },
    { type: 'article', fields: { type: 'article', title: '', htmlContent: '' } },
  ];
}
