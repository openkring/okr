import { ImageConfig } from '@okr/shared-models';
import { SectionErrors } from '@okr/cms-section-util';

/** A single image slot of a hero (`hero` / `logo`) as a one-image list for the image list; empty while none is set. */
export function heroSlotImages(image: ImageConfig | undefined): ImageConfig[] {
  return image && (image.url || image.label) ? [image] : [];
}

/** The messages of an image slot (`hero.url`, `logo.altText` …), flattened for one error note under its list. */
export function slotErrors(errors: SectionErrors | undefined, slot: 'hero' | 'logo'): string[] {
  return Object.entries(errors ?? {}).filter(([key]) => key.startsWith(`${slot}.`)).flatMap(([, messages]) => messages);
}
