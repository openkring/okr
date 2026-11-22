import { IMAGE_STYLE_SHAPE, SectionModel } from '@okr/shared-models';
import { compactImageStyle } from '@okr/shared-util-core';

/**
 * Fills the imageStyle fields a stored section lacks with the model defaults (IMAGE_STYLE_SHAPE).
 * Older and imported sections often carry an incomplete imageStyle (e.g. no `isThumbnail`, no `slot`):
 * the form shows a default for such a field, but imageStyleValidations sees `undefined`, reports
 * «Wert darf nicht undefined sein» and the editor never offers to save. Values already set are kept;
 * a section without an imageStyle (or no section at all) is returned as it is — except an article, which
 * stores only the fields that differ from the default (spec 1.171 D1b) and so gets the full default style.
 */
export function withImageStyleDefaults<T extends SectionModel | undefined>(section: T): T {
  if (!section) return section;
  const props = section.properties as { imageStyle?: Record<string, unknown> } | undefined;
  const stored = props?.imageStyle;
  const style = section.type === 'article' && (!stored || typeof stored !== 'object') ? {} : stored;
  if (!style || typeof style !== 'object') return section;
  const filled: Record<string, unknown> = { ...style };
  let changed = false;
  for (const [key, value] of Object.entries(IMAGE_STYLE_SHAPE)) {
    if (filled[key] === undefined) { filled[key] = value; changed = true; }
  }
  return changed ? { ...section, properties: { ...props, imageStyle: filled } } as T : section;
}

/**
 * The section as it is written to Firestore (spec 1.171 D1b): an article keeps only the image-style fields
 * that differ from IMAGE_STYLE_SHAPE, and none at all when nothing differs. The write replaces the whole
 * `properties` map, so the dropped fields really leave the document. Other section types are returned as
 * they are. Returns a new object; the input is not changed.
 */
export function compactSectionForSave<T extends SectionModel>(section: T): T {
  if (section.type !== 'article' || !section.properties) return section;
  const { imageStyle, ...properties } = section.properties;
  const compact = compactImageStyle(imageStyle);
  return { ...section, properties: compact ? { ...properties, imageStyle: compact } : properties } as T;
}
