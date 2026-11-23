import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, isDevMode, output } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonItem } from '@ionic/angular';

import { ArticleHeaderPlace, ColumnContentView, SECTION_I18N_KEYS, SectionIntro, articleBlockViews, undrawnBlockTypes } from '@okr/cms-section-util';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ArticleBlock, ImageConfig } from '@okr/shared-models';
import { badgeFor, Img, OptionalCardHeader } from '@okr/shared-ui';

import { ArticleCarousel } from './article-carousel';
import { ArticleImages } from './article-images';
import { ArticleSlideshowComponent } from './article-slideshow';
import { openSectionLink } from './section-link';

/** Which form the columns take; 'auto' follows the viewport. */
export type ArticlePreviewDevice = 'auto' | 'mobile' | 'tablet' | 'desktop';

/**
 * The blocks of a free article (spec 1.173 §7, §9.1). Loaded lazily by the article section, so this file is not exported
 * from the lib. What cannot be drawn (malformed, unknown, empty) is already left out by `articleBlockViews`.
 *
 * Texts use the same `ion-item` as the classic article, so both kinds look the same. The paddings of `.block` are the
 * ones of its ion-grid and ion-col.
 */
@Component({
  selector: 'okr-article-blocks',
  standalone: true,
  imports: [NgTemplateOutlet, Img, ArticleCarousel, ArticleImages, ArticleSlideshowComponent, OptionalCardHeader, IonButton, IonItem],
  styles: [`
    :host { display: block; padding: 5px; }
    .block { padding: 5px; }
    .html { width: 100%; min-width: 0; overflow-wrap: anywhere; }
    .image okr-img { display: block; }
    .button { padding: 8px 5px; }
    /* the header in the text column stands directly on the text, as in the classic article */
    .header { padding: 5px 5px 0 5px; }
    .header + .block { padding-top: 0; }
    .header okr-optional-card-header ::ng-deep ion-card-subtitle { font-size: 1.25rem; font-weight: 600; text-transform: none; }

    /* columns: side by side from 768 px (Ionic md), stacked below; previewDevice forces one of the two */
    .columns { display: grid; grid-template-columns: var(--columns); align-items: var(--article-columns-align, start); }
    .column { min-width: 0; }
    .columns.stacked { grid-template-columns: minmax(0, 1fr); }
    .columns.stacked .column { order: var(--stack-order); }
    @media (max-width: 767.98px) {
      .columns.auto { grid-template-columns: minmax(0, 1fr); }
      .columns.auto .column { order: var(--stack-order); }
    }

    .callout .tint { border-radius: 8px; padding: 12px; }
    .callout ion-item { --background: transparent; --min-height: 0; }
    .callout .primary { background: color-mix(in srgb, var(--ion-color-primary) 12%, transparent); }
    .callout .secondary { background: color-mix(in srgb, var(--ion-color-secondary) 12%, transparent); }
    .callout .tertiary { background: color-mix(in srgb, var(--ion-color-tertiary) 12%, transparent); }
    /* the solid grey surface has its own text colour, also in an article with its own background */
    .callout .neutral { background: var(--ion-color-light); color: var(--ion-color-light-contrast); }
    .callout .neutral ion-item { --color: var(--ion-color-light-contrast); color: var(--ion-color-light-contrast); }

    /* the colour of the text: the one of an own background, else the Ionic one around it */
    hr { margin: 8px 0; border: 0; height: 1px; background: var(--article-fg, currentColor); opacity: 0.4; }
    .space.small { height: 8px; }
    .space.medium { height: 24px; }
    .space.large { height: 48px; }
  `],
  template: `
    <!-- the blocks that also stand in a column -->
    <ng-template #contentTpl let-view>
      @let block = contentOf(view);
      @switch (block.type) {
        @case ('text') {
          <div class="block text">
            <ion-item lines="none" class="ion-no-padding">
              <div class="html" [style.text-align]="block.align === 'left' ? null : block.align" [innerHTML]="block.html"></div>
            </ion-item>
          </div>
        }
        @case ('image') {
          <div class="block image">
            <okr-img [captionFallbacks]="captionFallbacks()" [image]="block.image" [imageStyle]="block.imageStyle" [editMode]="editMode()" [zoomTitle]="i18n.zoomed()" [badge]="badgeOf(block.image.label)" [emitClicks]="emitImageClicks()" (clicked)="imageSelected.emit($event)" />
          </div>
        }
        @case ('button') {
          <div class="block button" [style.text-align]="block.align === 'left' ? null : block.align">
            <ion-button [color]="block.cta.style === 'secondary' ? 'secondary' : 'primary'" [fill]="block.cta.style === 'secondary' ? 'outline' : 'solid'" (click)="open(block.cta.url)">{{ block.cta.label }}</ion-button>
          </div>
        }
      }
    </ng-template>

    @for (block of views(); track block.key; let first = $first) {
      @switch (block.type) {
        @case ('grid') {
          <div class="block">
            <okr-article-images [images]="block.images" [imageStyle]="block.imageStyle" [layout]="block.layout" [editMode]="editMode()" [captionFallbacks]="captionFallbacks()" [zoomTitle]="i18n.zoomed()" [imageBadges]="imageBadges()" [emitImageClicks]="emitImageClicks()" (imageSelected)="imageSelected.emit($event)" />
          </div>
        }
        @case ('carousel') {
          <div class="block">
            <okr-article-carousel [images]="block.images" [imageStyle]="block.imageStyle" [captionFallbacks]="captionFallbacks()" [editMode]="editMode()" [imageBadges]="imageBadges()" [emitImageClicks]="emitImageClicks()" [zoomTitle]="i18n.zoomed()" (imageSelected)="imageSelected.emit($event)" />
          </div>
        }
        @case ('slideshow') {
          @let titled = first && headerPlace() === 'slideshow';
          <div class="block">
            <okr-article-slideshow [images]="block.images" [settings]="block.settings" [title]="titled ? title() : ''" [subTitle]="titled ? subTitle() : ''" />
          </div>
        }
        @case ('columns') {
          <div class="columns" [class]="columnsForm()" [style.--columns]="block.template">
            @for (column of block.columns; track $index) {
              <div class="column" [style.--stack-order]="block.stackReverse ? -$index : null">
                @if (first && headerPlace() === 'column' && block.headerColumn === $index) {
                  <div class="header">
                    <okr-optional-card-header [intro]="intro()?.text" [introPosition]="intro()?.position" [title]="title()" [subTitle]="subTitle()" />
                  </div>
                }
                @for (inner of column.blocks; track inner.key) {
                  <ng-container [ngTemplateOutlet]="contentTpl" [ngTemplateOutletContext]="{ $implicit: inner }" />
                }
              </div>
            }
          </div>
        }
        @case ('callout') {
          <div class="block callout">
            <div class="tint" [class]="block.tone">
              <ion-item lines="none" class="ion-no-padding">
                <div class="html" [innerHTML]="block.html"></div>
              </ion-item>
            </div>
          </div>
        }
        @case ('divider') {
          <div class="block"><hr /></div>
        }
        @case ('space') {
          <div class="space" [class]="block.size"></div>
        }
        @default {
          <ng-container [ngTemplateOutlet]="contentTpl" [ngTemplateOutletContext]="{ $implicit: block }" />
        }
      }
    }
  `,
})
export class ArticleBlocks {
  private readonly appStore = inject(AppStore);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService).translateAll({ zoomed: SECTION_I18N_KEYS.article_zoomed });

  // inputs
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
  protected views = computed(() => articleBlockViews(this.blocks(), (html) => this.appStore.replacePlaceholders(html)));
  protected captionFallbacks = computed(() => [this.subTitle(), this.title()]);
  protected columnsForm = computed((): 'auto' | 'stacked' | 'wide' => {
    const device = this.previewDevice();
    if (device === 'auto') return 'auto';
    return device === 'mobile' ? 'stacked' : 'wide';
  });

  protected badgeOf(label: string): string | undefined { return badgeFor(this.imageBadges(), label); }

  /** the template context has no type */
  protected contentOf(view: unknown): ColumnContentView { return view as ColumnContentView; }

  protected open(url: string): void {
    openSectionLink(this.router, url);
  }

  constructor() {
    if (isDevMode()) {
      effect(() => {
        const types = undrawnBlockTypes(this.blocks());
        if (types.length > 0) console.warn('ArticleBlocks: block types that are not drawn:', types);
      });
    }
  }
}
