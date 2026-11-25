import { Component, computed, input } from '@angular/core';

import { drawableImages, mailPictureStyle } from '@okr/cms-section-util';
import type { GalleryBlock } from '@okr/shared-models';
import { Img } from '@okr/shared-ui';

/**
 * A gallery in the canvas of a mail (spec 1.176 §8.2): always rows of two, also on the phone; the whole pictures, an odd last one in one
 * cell. Pictures without an address draw nothing, as in the mail.
 */
@Component({
  selector: 'okr-mail-gallery',
  standalone: true,
  imports: [Img],
  styles: [`
    /* the padding of the other blocks; between the two the gutter of the mail */
    :host { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; padding: 5px; }
    okr-img { display: block; }
  `],
  template: `
    @for (image of images(); track $index) {
      <okr-img [image]="image" [imageStyle]="style()" [editMode]="true" />
    }
  `,
})
export class MailGallery {
  public readonly block = input.required<GalleryBlock>();

  protected readonly images = computed(() => drawableImages(this.block().images).filter((image) => (image.url ?? '').trim() !== ''));
  protected readonly style = computed(() => mailPictureStyle(this.block().imageStyle, 'gallery'));
}
