import { Component, computed, input } from '@angular/core';

import { mailPictureCells, mailPictureStyle } from '@okr/cms-section-util';
import type { GalleryBlock } from '@okr/shared-models';
import { Img } from '@okr/shared-ui';

/**
 * A gallery in the canvas of a mail (spec 1.176 §8.2): always rows of two, also on the phone; the whole pictures, an odd last one in one
 * cell. As in the mail a picture without a usable address shows its alt text or label in italics, and an empty entry draws nothing.
 */
@Component({
  selector: 'okr-mail-gallery',
  standalone: true,
  imports: [Img],
  styles: [`
    /* the padding of the other blocks; between the two the gutter of the mail */
    :host { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; padding: 5px; }
    okr-img { display: block; }
    .cell { min-width: 0; overflow-wrap: anywhere; }
    /* the caption of okr-img */
    .caption { padding: 4px 2px; font-size: 0.8rem; font-style: italic; color: var(--ion-color-medium-shade, #666); }
  `],
  template: `
    @for (cell of cells(); track $index) {
      <div class="cell">
        @if (cell.text) {
          @for (line of cell.above; track $index) { <div class="caption">{{ line }}</div> }
          <em>{{ cell.text }}</em>
          @for (line of cell.below; track $index) { <div class="caption">{{ line }}</div> }
        } @else {
          <okr-img [image]="cell.image" [imageStyle]="style()" [editMode]="true" />
        }
      </div>
    }
  `,
})
export class MailGallery {
  public readonly block = input.required<GalleryBlock>();

  protected readonly cells = computed(() => mailPictureCells(this.block()));
  protected readonly style = computed(() => mailPictureStyle(this.block().imageStyle, 'gallery'));
}
