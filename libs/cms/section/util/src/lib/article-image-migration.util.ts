/**
 * Pure transform that normalises a legacy ArticleConfig `properties` object to the
 * canonical `images: ImageConfig[]` shape. Used by the one-off migration script.
 *
 * Rules:
 *  - If a legacy single `image` exists and `images` is empty/missing, set `images = [image]`.
 *  - Always drop the legacy `image` field if present.
 *  - `changed` is true whenever the output differs from the input (legacy field present
 *    and/or images were populated from it).
 */
export function migrateArticleImageProperties(
  properties: Record<string, unknown>
): { changed: boolean; properties: Record<string, unknown> } {
  const hasLegacy = 'image' in properties && properties['image'] != null;
  const existingImages = properties['images'];
  const hasImages = Array.isArray(existingImages) && existingImages.length > 0;

  if (!hasLegacy && hasImages) return { changed: false, properties };
  if (!hasLegacy && !hasImages) return { changed: false, properties };

  const next: Record<string, unknown> = { ...properties };
  if (!hasImages) {
    next['images'] = [properties['image']];
  }
  delete next['image'];
  return { changed: true, properties: next };
}
