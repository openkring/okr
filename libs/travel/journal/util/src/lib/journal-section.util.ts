import {
  ALBUM_SECTION_SHAPE, ARTICLE_SECTION_SHAPE, HERO_OVERLAY_DEFAULT, HERO_SECTION_SHAPE, IMAGE_CONFIG_SHAPE, ImageConfig,
  SectionModel, VIDEO_SECTION_SHAPE,
} from '@okr/shared-models';
import type { SectionView } from './journal-view.util';

/**
 * A footprint's content as CMS sections in the change log (spec 1.154 §2, plan decisions 1–4, 8). A `section`
 * record carries `type`, `title`, `htmlContent`, `order`, `footprintKey` and one field `p_<key>` per top-level
 * property key, so the field-level merge merges per property key. Only the content keys keep both versions of a
 * concurrent edit as a conflict copy; settings keys are last-writer-wins.
 */
export const JOURNAL_SECTION_TYPES = ['hero', 'article', 'album', 'video'] as const;
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

/** The record fields of a section: `type`, `title`, `htmlContent` and one `p_<key>` per property key. */
export function sectionFieldsOf(section: Pick<SectionModel, 'type' | 'title' | 'content' | 'properties'>): Record<string, unknown> {
  const fields: Record<string, unknown> = { type: section.type, title: section.title ?? '', htmlContent: section.content?.htmlContent ?? '' };
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
 * A property removed by the edit is not written: the change log has no unset.
 */
export function changedSectionFields(before: SectionView, after: SectionModel): Record<string, unknown> {
  const old = sectionFieldsOf(sectionModelOf(before, ''));
  return Object.fromEntries(Object.entries(sectionFieldsOf(after)).filter(([field, value]) => !sameValue(old[field], value)));
}

/**
 * The section as a CMS `SectionModel`: the type's shape defaults (shared-models `*_SECTION_SHAPE`) overlaid with
 * the view. Image references keep the journal image key in `ImageConfig.label`; their url is resolved by the renderer.
 */
export function sectionModelOf(view: SectionView, tenantId: string): SectionModel {
  const shape = SHAPES[view.type];
  const properties: Record<string, unknown> = structuredClone((shape.properties ?? {}) as Record<string, unknown>);
  for (const [key, value] of Object.entries(view.properties)) properties[key] = storedProperty(key, value);
  return {
    ...shape,
    okey: view.key, name: view.key, type: view.type, title: view.title, subTitle: '', tenants: [tenantId],
    authorKey: view.authorKey, order: view.order,
    content: { ...shape.content, htmlContent: view.htmlContent },
    properties,
  } as unknown as SectionModel;
}

const labelsOf = (images: ImageConfig[]): string[] => images.map((i) => i.label).filter((k) => k !== '');

/** The journal photos a section shows: its `images` list and a hero's cover. May name images not (yet) received. */
export function sectionImageKeys(view: Pick<SectionView, 'properties'>): string[] {
  const hero = storedImage(view.properties[IMAGE_KEY]);
  return [...new Set([...labelsOf(storedImages(view.properties['images'])), ...labelsOf(hero ? [hero] : [])])];
}

/** The journal video clips of a section (`clips`), in pick order. */
export function sectionClipKeys(view: Pick<SectionView, 'properties'>): string[] {
  return labelsOf(storedImages(view.properties['clips']));
}

/** The types the author may add: a footprint has at most one hero. */
export function addableSectionTypes(sections: SectionView[]): JournalSectionType[] {
  const hasHero = sections.some((s) => s.type === 'hero');
  return JOURNAL_SECTION_TYPES.filter((t) => t !== 'hero' || !hasHero);
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
