import { Component, computed, input, output } from '@angular/core';

import { ImageConfig, ImageStyle } from '@okr/shared-models';
import { ImageLayoutId, imageLayoutTiles } from '@okr/cms-section-util';
import { Img } from '@okr/shared-ui';

/**
 * The images of an article laid out as a grid (everything except the slider, which the article draws itself).
 *
 * The tiles come from `imageLayoutTiles` and sit on a 12-column grid of square cells: one row is as high as
 * one column is wide (`grid-auto-rows` from the container width, see `.images`), so `colSpan / rowSpan` is a
 * tile's aspect ratio. Every image fills its tile (cropped, `object-fit: cover`), keeping the article's
 * border, radius and caption. A click runs the image style's action with all images as the gallery.
 *
 * Narrow screens (below 576 px): every layout except the filmstrip becomes two columns of equal tiles,
 * below 360 px one column.
 */
@Component({
  selector: 'okr-article-images',
  standalone: true,
  imports: [Img],
  styles: [`
    :host { display: block; }
    /* the container gives the grid its own width to measure rows against (cqw) */
    .images { container-type: inline-size; margin: 0.5rem 0; }
    .grid {
      --gap: 4px;
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: var(--gap);
      /* one row = one column wide: (width - 11 gaps) / 12 */
      grid-auto-rows: calc((100cqw - 11 * var(--gap)) / 12);
    }
    .tile { position: relative; min-width: 0; min-height: 0; }
    .tile okr-img { display: block; height: 100%; }
    @media (max-width: 575.98px) {
      .grid:not(.filmstrip) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-auto-rows: calc((100cqw - var(--gap)) / 2);
      }
      .grid:not(.filmstrip) .tile { grid-column: auto !important; grid-row: auto !important; }
    }
    @media (max-width: 359.98px) {
      .grid:not(.filmstrip) {
        grid-template-columns: minmax(0, 1fr);
        grid-auto-rows: calc(100cqw * 0.75);
      }
    }
  `],
  template: `
    <div class="images">
      <div class="grid" [class.filmstrip]="layout() === 'filmstrip'">
        @for (tile of tiles(); track tile.index) {
          <div class="tile" [style.grid-column]="tile.column + ' / span ' + tile.colSpan" [style.grid-row]="tile.row + ' / span ' + tile.rowSpan">
            <okr-img [image]="images()[tile.index]" [imageStyle]="tileStyle()" [editMode]="editMode()" [gallery]="images()" [captionFallbacks]="captionFallbacks()" [zoomTitle]="zoomTitle()" [badge]="imageBadges()[images()[tile.index].label]" [emitClicks]="emitImageClicks()" (clicked)="imageSelected.emit($event)" />
          </div>
        }
      </div>
    </div>
  `
})
export class ArticleImages {
  // inputs
  public images = input.required<ImageConfig[]>();
  public imageStyle = input.required<ImageStyle>();
  /** the resolved layout (see resolveImageLayout), never the raw stored id */
  public layout = input.required<ImageLayoutId>();
  public editMode = input<boolean>(false);
  public captionFallbacks = input<string[]>([]);
  public zoomTitle = input<string>('Zoom');
  /** small text per image, keyed by ImageConfig.label */
  public imageBadges = input<Record<string, string>>({});
  /** hand a tap on an image to the host (imageSelected) instead of running the image style's action */
  public emitImageClicks = input(false);
  public imageSelected = output<ImageConfig>();

  protected tiles = computed(() => imageLayoutTiles(this.layout(), this.images().length).tiles);

  // every image covers its cell: fill mode with a 100 % high box (the cell), so the image is cropped, not
  // stretched; border, radius, caption and action come from the article's style
  protected tileStyle = computed((): ImageStyle => ({
    ...this.imageStyle(),
    width: '100%',
    height: '100%',
    fill: true,
  }));
}
