import { Component, computed, effect, inject, input, isDevMode, output } from '@angular/core';

import { ArticleHeaderPlace, ArticlePreviewDevice, BlockViewCache, SectionIntro, articleColumnsForm, undrawnBlockTypes } from '@okr/cms-section-util';
import { AppStore } from '@okr/shared-feature';
import { ArticleBlock, ImageConfig } from '@okr/shared-models';
import { OptionalCardHeader } from '@okr/shared-ui';

import { ARTICLE_COLUMNS_STYLES, ARTICLE_LIST_PADDING, ArticleBlockComponent } from './article-block';

/**
 * The blocks of a free article (spec 1.173 §7, §9.1). Loaded lazily by the article section, so this file is not exported
 * from the lib. What cannot be drawn (malformed, unknown, empty) is already left out by the views.
 */
@Component({
  selector: 'okr-article-blocks',
  standalone: true,
  imports: [ArticleBlockComponent, OptionalCardHeader],
  styles: [`
    :host { display: block; padding: ${ARTICLE_LIST_PADDING}; }
  `, ARTICLE_COLUMNS_STYLES],
  template: `
    @for (block of views(); track block.key; let first = $first) {
      @if (block.type === 'columns') {
        <div class="columns" [class]="columnsForm()" [style.--columns]="block.template">
          @for (column of block.columns; track $index) {
            @let withHeader = first && headerPlace() === 'column' && block.headerColumn === $index;
            <div class="column" [style.--stack-order]="block.stackReverse ? -$index : null">
              @if (withHeader) {
                <div class="header">
                  <okr-optional-card-header [intro]="intro()?.text" [introPosition]="intro()?.position" [title]="title()" [subTitle]="subTitle()" />
                </div>
              }
              @for (inner of column.blocks; track inner.key; let firstInner = $first) {
                <okr-article-block [class.after-header]="withHeader && firstInner" [view]="inner" [captionFallbacks]="captionFallbacks()" [editMode]="editMode()" [imageBadges]="imageBadges()" [emitImageClicks]="emitImageClicks()" [previewDevice]="previewDevice()" (imageSelected)="imageSelected.emit($event)" />
              }
            </div>
          }
        </div>
      } @else {
        @let titled = first && headerPlace() === 'slideshow';
        <okr-article-block [view]="block" [captionFallbacks]="captionFallbacks()" [editMode]="editMode()" [imageBadges]="imageBadges()" [emitImageClicks]="emitImageClicks()" [title]="titled ? title() : ''" [subTitle]="titled ? subTitle() : ''" [previewDevice]="previewDevice()" (imageSelected)="imageSelected.emit($event)" />
      }
    }
  `,
})
export class ArticleBlocks {
  private readonly appStore = inject(AppStore);
  private readonly viewCache = new BlockViewCache((html) => this.placeholders() ? this.appStore.replacePlaceholders(html) : html);

  // inputs
  /** replace placeholders such as @APPNAME@ in the texts (an article); false for blocks that are already final (a Mitteilung) */
  public placeholders = input(true);
  public blocks = input.required<ArticleBlock[]>();
  /** title and subtitle of the article (placeholders replaced): captions fall back to them, and see headerPlace */
  public title = input('');
  public subTitle = input('');
  public intro = input<SectionIntro | undefined>();
  /** where the header of the article stands (articleHeaderPlace); with 'card' the host draws it */
  public headerPlace = input<ArticleHeaderPlace>('card');
  public editMode = input(false);
  public previewDevice = input<ArticlePreviewDevice>('auto');
  /** small text per image, keyed by ImageConfig.label */
  public imageBadges = input<Record<string, string>>({});
  /** hand a tap on an image to the host (imageSelected) instead of running the image style's action */
  public emitImageClicks = input(false);
  public imageSelected = output<ImageConfig>();

  // computed
  protected views = computed(() => this.viewCache.views(this.blocks()));
  protected captionFallbacks = computed(() => [this.subTitle(), this.title()]);
  protected columnsForm = computed(() => articleColumnsForm(this.previewDevice()));

  constructor() {
    if (isDevMode()) {
      effect(() => {
        const types = undrawnBlockTypes(this.blocks());
        if (types.length > 0) console.warn('ArticleBlocks: block types that are not drawn:', types);
      });
    }
  }
}
