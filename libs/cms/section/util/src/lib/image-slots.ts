import { ImageConfig, SectionModel } from '@bk2/shared-models';

/** An image "slot" on a section: either the multi `images[]` array or a named single image. */
export interface ImageSlot {
  field: 'images' | 'logo' | 'hero';
  multi: boolean;
}

/** Enumerate the image slots a section type supports. Empty array = no image upload. */
export function getSectionImageSlots(section: SectionModel): ImageSlot[] {
  switch (section.type) {
    case 'article':
    case 'slider':
      return [{ field: 'images', multi: true }];
    case 'hero':
      return [
        { field: 'logo', multi: false },
        { field: 'hero', multi: false },
      ];
    default:
      return [];
  }
}

export function sectionSupportsImages(section: SectionModel): boolean {
  return getSectionImageSlots(section).length > 0;
}

/** True when the slot already holds image data (a non-empty array, or a single image with a url). */
export function isSlotOccupied(section: SectionModel, slot: ImageSlot): boolean {
  const props = section.properties as Record<string, unknown>;
  if (slot.multi) {
    const arr = props[slot.field];
    return Array.isArray(arr) && arr.length > 0;
  }
  const single = props[slot.field] as ImageConfig | undefined;
  return !!single?.url;
}

/**
 * Return a new section with the uploaded images applied to the slot.
 * Multi slot → append. Single slot → replace with the first uploaded image.
 * Pure: never mutates the input.
 */
export function applyImagesToSlot(section: SectionModel, slot: ImageSlot, uploaded: ImageConfig[]): SectionModel {
  const props = section.properties as Record<string, unknown>;
  if (slot.multi) {
    const current = Array.isArray(props[slot.field]) ? (props[slot.field] as ImageConfig[]) : [];
    return { ...section, properties: { ...props, [slot.field]: [...current, ...uploaded] } } as SectionModel;
  }
  return { ...section, properties: { ...props, [slot.field]: uploaded[0] } } as SectionModel;
}
