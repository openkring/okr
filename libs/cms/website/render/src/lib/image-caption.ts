/**
 * Node-safe twin of `buildImageCaption` (shared-util-core, img.util.ts): render must not import the
 * util-core barrel (it pulls @angular/common, rxjs and vest). A parity spec keeps the two in step.
 */
export interface ImageCaption { text: string; source: string }

export interface CaptionImage { overlay?: string; credit?: string }

export function imageCaption(image: CaptionImage | undefined, fallbacks: (string | undefined)[] = []): ImageCaption {
  const own = image?.overlay?.trim() ?? '';
  const credit = image?.credit?.trim() ?? '';
  if (own) return { text: own, source: credit };
  if (credit) return { text: credit, source: '' };
  const fallback = fallbacks.map(t => t?.trim() ?? '').find(t => t.length > 0) ?? '';
  return { text: fallback, source: '' };
}
