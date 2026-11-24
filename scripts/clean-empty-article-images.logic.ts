/** The pure part of clean-empty-article-images.ts: which articles hold nothing but empty image placeholders. */
import { planDocument, type StoredSection } from './migrate-article-blocks.logic';

/** Whether the value of an image field carries nothing. */
function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === 0 || value === false || (typeof value === 'string' && value.trim() === '');
}

/** An image object without a url and without any other content. */
export function isEmptyImage(image: unknown): boolean {
  return typeof image === 'object' && image !== null && !Array.isArray(image) && Object.values(image).every(isEmpty);
}

export function withoutImages(data: StoredSection): StoredSection {
  return { ...data, properties: { ...(data.properties as object), images: [] } };
}

/**
 * Whether `properties.images` may be emptied: an article without blocks, all its images are empty placeholders, it is left
 * out of the migration because of them, and without them it migrates.
 */
export function isCleanable(key: string, data: StoredSection): boolean {
  const images: unknown = (data.properties as { images?: unknown } | undefined)?.images;
  if (data.type !== 'article' || !Array.isArray(images) || images.length === 0 || !images.every(isEmptyImage)) return false;
  const before = planDocument(key, data, '0.000000000');
  if (before.action !== 'leave' || before.reason !== 'not-identical') return false;
  return planDocument(key, withoutImages(data), '0.000000000').action === 'migrate';
}
