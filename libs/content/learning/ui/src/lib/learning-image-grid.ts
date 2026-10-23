import { Component, computed, inject, input } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { toGalleryImage } from '@okr/content-document-util';
import { LearningI18n } from '@okr/content-learning-util';
import { DocumentModel, IMAGE_STYLE_SHAPE, ImageConfig, ImageStyle } from '@okr/shared-models';
import { EmptyList, ImageGrid, openImageGallery } from '@okr/shared-ui';

/** Grid tiles are cropped to 4:3 by imgix (the shape's 100%/auto would yield no aspect ratio). */
const LEARNING_IMAGE_STYLE: ImageStyle = { ...IMAGE_STYLE_SHAPE, width: '400', height: '300' };

/**
 * The «Bilder» tab of a learning room (spec 1.115 §5.2): today's album look (grid, Pinterest,
 * list) over the room's image documents, reusing `okr-image-grid`.
 *
 * A tap opens the full-size gallery over exactly the images shown (the current filter), starting
 * at the tapped one. Opening the overlay here — not in the feature — keeps every room page from
 * repeating the same three lines; it is a pure UI overlay and touches no data.
 * 'list' renders the album's thumbnail list ('avatar'), since a list of bare titles is no use
 * for pictures.
 */
@Component({
  selector: 'okr-learning-image-grid',
  standalone: true,
  imports: [ImageGrid, EmptyList],
  template: `
    @if (images().length === 0) {
      <okr-empty-list [message]="i18n().empty_images()" />
    } @else {
      <okr-image-grid
        [images]="images()"
        [imageStyle]="imageStyle"
        [imgixBaseUrl]="imgixBaseUrl()"
        [albumStyle]="albumStyle()"
        (imageClicked)="onImageClicked($event)" />
    }
  `
})
export class LearningImageGrid {
  private readonly modalController = inject(ModalController);

  public docs = input<DocumentModel[]>([]);
  public style = input<'grid' | 'pinterest' | 'list'>('grid');
  public imgixBaseUrl = input.required<string>();
  public i18n = input.required<LearningI18n>();

  protected readonly imageStyle = LEARNING_IMAGE_STYLE;
  protected readonly images = computed(() => this.docs().map(toGalleryImage));
  protected readonly albumStyle = computed(() => this.style() === 'list' ? 'avatar' : this.style());

  protected async onImageClicked(image: ImageConfig): Promise<void> {
    // the full-size view uses the uncropped default style, as the document list does
    await openImageGallery(this.modalController, this.images(), image, IMAGE_STYLE_SHAPE);
  }
}
