import { InjectionToken } from '@angular/core';

import { ImageConfig } from '@okr/shared-models';

/**
 * Where the section form gets its photos and clips from (travel journal, spec 1.154 §2 «Photo picker»).
 * The travel journal provides one over its own photos (local files on the iPad, the private bucket in the
 * browser); its images carry the journal image key in `label` and an empty `url`, so the picker also
 * resolves their thumbnails.
 */
export interface SectionImagePicker {
  /** Lets the user choose photos (`image`) or clips (`video`); resolves to `[]` when nothing was chosen. */
  pick(kind: 'image' | 'video', multiple: boolean): Promise<ImageConfig[]>;
  /** A displayable url of an image this picker returned. */
  thumbnailUrl(image: ImageConfig): string;
}

/**
 * The image picker of the section form. Not provided by the CMS: without a provider, `okr-images-config`
 * and the hero image upload keep today's upload to the public Storage bucket (`UploadService`), unchanged.
 * It has no root default on purpose: today's upload needs the section's storage path, the current user and
 * the upload label, which a root-level picker does not know, and a util lib must not depend on the
 * data-access lib that holds `UploadService`. Inject it with `{ optional: true }`.
 */
export const SECTION_IMAGE_PICKER = new InjectionToken<SectionImagePicker>('SectionImagePicker');
