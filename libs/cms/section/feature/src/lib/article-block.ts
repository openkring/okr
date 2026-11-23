import { NgTemplateOutlet } from '@angular/common';
import { Component, TemplateRef, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonItem } from '@ionic/angular';

import { ArticleBlockView, ArticlePreviewDevice, SECTION_I18N_KEYS } from '@okr/cms-section-util';
import { I18nService } from '@okr/shared-i18n';
import { ImageConfig } from '@okr/shared-models';
import { badgeFor, Img } from '@okr/shared-ui';

import { ArticleCarousel } from './article-carousel';
import { ArticleImages } from './article-images';
import { ArticleSlideshowComponent } from './article-slideshow';
import { openSectionLink } from './section-link';

/** The padding of a list of blocks (the one of the ion-grid of a classic article), for the reader list and the canvas. */
export const ARTICLE_LIST_PADDING = '5px';

/**
 * The grid of the columns and the header in one of them, for whoever draws the columns around `okr-article-block`s: the
 * reader list and the canvas of the editor. The block after the header carries the class `after-header`.
 */
export const ARTICLE_COLUMNS_STYLES = `
    /* the header in the text column stands directly on the text, as in the classic article */
    .header { padding: 5px 5px 0 5px; }
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
`;

/**
 * One drawn block of an article, except columns (spec 1.175 §9): for readers inside `okr-article-blocks`, and in the canvas of
 * the editor. Only reachable through lazily loaded components, so this file is not exported from the lib.
 *
 * Texts use the same `ion-item` as the classic article, so both kinds look the same. The paddings of `.block` are the
 * ones of its ion-grid and ion-col.
 */
@Component({
  selector: 'okr-article-block',
  standalone: true,
  imports: [Img, ArticleCarousel, ArticleImages, ArticleSlideshowComponent, NgTemplateOutlet, IonButton, IonItem],
  host: {
    '[class.classic-text]': 'classic()',
    '(click)': 'onLink($event)',
    '(auxclick)': 'onLink($event)',
  },
  styles: [`
    :host { display: block; }
    .block { padding: 5px; }
    .html { width: 100%; min-width: 0; overflow-wrap: anywhere; }
    .image okr-img { display: block; }
    /* not .button alone: Ionic gives its ion-button that class too */
    div.button { padding: 8px 5px; }
    :host(.after-header) .block { padding-top: 0; }
    :host(.classic-text) .block { padding: 0; }
    :host(.classic-text) .html { width: auto; }

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
    @let block = view();
    @switch (block.type) {
      @case ('text') {
        <div class="block text">
          <ion-item lines="none" [class.ion-no-padding]="!classic()">
            @if (textEditor(); as editor) {
              <div class="html" [style.text-align]="block.align === 'left' ? null : block.align"><ng-container [ngTemplateOutlet]="editor" /></div>
            } @else {
              <div class="html" [style.text-align]="block.align === 'left' ? null : block.align" [innerHTML]="block.html"></div>
            }
          </ion-item>
        </div>
      }
      @case ('image') {
        <div class="block image">
          <okr-img [captionFallbacks]="captionFallbacks()" [image]="block.image" [imageStyle]="block.imageStyle" [editMode]="editMode() || inert()" [zoomTitle]="i18n.zoomed()" [badge]="badgeOf(block.image.label)" [emitClicks]="emitImageClicks()" (clicked)="imageSelected.emit($event)" />
        </div>
      }
      @case ('button') {
        <div class="block button" [style.text-align]="block.align === 'left' ? null : block.align">
          <ion-button [color]="block.cta.style === 'secondary' ? 'secondary' : 'primary'" [fill]="block.cta.style === 'secondary' ? 'outline' : 'solid'" (click)="open(block.cta.url)">{{ block.cta.label }}</ion-button>
        </div>
      }
      @case ('grid') {
        <div class="block">
          <okr-article-images [images]="block.images" [imageStyle]="block.imageStyle" [layout]="block.layout" [editMode]="editMode() || inert()" [captionFallbacks]="captionFallbacks()" [zoomTitle]="i18n.zoomed()" [imageBadges]="imageBadges()" [emitImageClicks]="emitImageClicks()" [previewDevice]="previewDevice()" (imageSelected)="imageSelected.emit($event)" />
        </div>
      }
      @case ('carousel') {
        <div class="block">
          <okr-article-carousel [images]="block.images" [imageStyle]="block.imageStyle" [captionFallbacks]="captionFallbacks()" [editMode]="editMode()" [imageBadges]="imageBadges()" [emitImageClicks]="emitImageClicks()" [zoomTitle]="i18n.zoomed()" [previewDevice]="previewDevice()" [inert]="inert()" (imageSelected)="imageSelected.emit($event)" />
        </div>
      }
      @case ('slideshow') {
        <div class="block">
          <okr-article-slideshow [images]="block.images" [settings]="block.settings" [title]="title()" [subTitle]="subTitle()" [previewDevice]="previewDevice()" [paused]="paused()" [inert]="inert()" />
        </div>
      }
      @case ('callout') {
        <div class="block callout">
          <div class="tint" [class]="block.tone">
            <ion-item lines="none" class="ion-no-padding">
              @if (textEditor(); as editor) {
                <div class="html"><ng-container [ngTemplateOutlet]="editor" /></div>
              } @else {
                <div class="html" [innerHTML]="block.html"></div>
              }
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
    }
  `,
})
export class ArticleBlockComponent {
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService).translateAll({ zoomed: SECTION_I18N_KEYS.article_zoomed });

  // inputs
  /** what to draw (BlockViewCache); the columns themselves are drawn by the host */
  public view = input.required<ArticleBlockView>();
  public captionFallbacks = input<string[]>([]);
  public editMode = input(false);
  /** small text per image, keyed by ImageConfig.label */
  public imageBadges = input<Record<string, string>>({});
  /** hand a tap on an image to the host (imageSelected) instead of running the image style's action */
  public emitImageClicks = input(false);
  public imageSelected = output<ImageConfig>();
  /** title and subtitle on the images of a slideshow */
  public title = input('');
  public subTitle = input('');
  public previewDevice = input<ArticlePreviewDevice>('auto');
  /** a slideshow stands still */
  public paused = input(false);
  /** nothing happens on a click on an image, a button or a link */
  public inert = input(false);
  /** a text with the spacing of an article of only a text; not an aligned one, which readers see as a block */
  public classicText = input(false);
  /** the editor of a text or callout, drawn in place of its html (the canvas of the editor) */
  public textEditor = input<TemplateRef<unknown>>();

  // computed
  protected classic = computed(() => {
    const view = this.view();
    return this.classicText() && view.type === 'text' && view.align === 'left';
  });

  protected badgeOf(label: string): string | undefined { return badgeFor(this.imageBadges(), label); }

  protected open(url: string): void {
    if (!this.inert()) openSectionLink(this.router, url);
  }

  /** a link in a text; the click itself still reaches the host */
  protected onLink(event: Event): void {
    if (this.inert() && event.target instanceof Element && event.target.closest('a')) event.preventDefault();
  }
}
