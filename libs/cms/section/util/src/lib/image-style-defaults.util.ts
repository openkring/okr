import { IMAGE_STYLE_SHAPE, SectionModel } from '@okr/shared-models';

/**
 * Fills the imageStyle fields a stored section lacks with the model defaults (IMAGE_STYLE_SHAPE).
 * Older and imported sections often carry an incomplete imageStyle (e.g. no `isThumbnail`, no `slot`):
 * the form shows a default for such a field, but imageStyleValidations sees `undefined`, reports
 * «Wert darf nicht undefined sein» and the editor never offers to save. Values already set are kept;
 * a section without an imageStyle is returned as it is.
 */
export function withImageStyleDefaults<T extends SectionModel>(section: T): T {
  const props = section.properties as { imageStyle?: Record<string, unknown> } | undefined;
  const style = props?.imageStyle;
  if (!style || typeof style !== 'object') return section;
  const filled: Record<string, unknown> = { ...style };
  let changed = false;
  for (const [key, value] of Object.entries(IMAGE_STYLE_SHAPE)) {
    if (filled[key] === undefined) { filled[key] = value; changed = true; }
  }
  return changed ? { ...section, properties: { ...props, imageStyle: filled } } as T : section;
}
