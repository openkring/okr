import { NgTemplateOutlet } from '@angular/common';
import { Component, TemplateRef, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular';

import { ARTICLE_AS_NEWS, ArticleHeaderPlace, articleBackground, articleHasLightText, articleSubTitleLine, getSectionIntro } from '@okr/cms-section-util';
import { AppStore } from '@okr/shared-feature';
import { ArticleSection } from '@okr/shared-models';
import { OptionalCardHeader } from '@okr/shared-ui';

/**
 * The styles of the frame, for the component that draws `okr-article-frame` (article section, canvas of the editor). They
 * stand in the stylesheet of that host, and `:where` adds nothing to their weight: an accordion and a dashboard style the card
 * of an article with rules of the same weight, so the order of the stylesheets decides and must not change.
 */
export const ARTICLE_FRAME_STYLES = `
    :host ::ng-deep :where(okr-article-frame > ion-card) > ion-card-content { padding: 5px; }
    :host ::ng-deep :where(okr-article-frame) > ion-card.banner { background: color-mix(in srgb, var(--ion-color-secondary) 12%, transparent); border-radius: 8px; padding: 12px; }
    /* an own background colour (ArticleConfig.background): a solid band; text inherits the chosen colour */
    :host ::ng-deep :where(okr-article-frame) > ion-card.colored { --background: var(--article-bg); background: var(--article-bg); --color: var(--article-fg); color: var(--article-fg); border-radius: 8px; padding: 12px; }
    :host ::ng-deep :where(okr-article-frame) > ion-card.colored ion-card-title, :host ::ng-deep :where(okr-article-frame) > ion-card.colored ion-card-subtitle { --color: inherit; color: inherit; }
    :host ::ng-deep :where(okr-article-frame) > ion-card.colored ion-item { --background: transparent; --color: inherit; color: inherit; }
    :host ::ng-deep :where(okr-article-frame) > ion-card.colored a { color: inherit; }
    :host ::ng-deep :where(okr-article-frame) > ion-card.colored { --article-columns-align: center; }
    :host ::ng-deep :where(okr-article-frame) > ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }
`;

/**
 * The frame of an article: card, banner, own colour and the header above the content, which is projected (spec 1.175 §9).
 * For the article section and the canvas of the editor; both need `ARTICLE_FRAME_STYLES`. The article section loads eagerly,
 * so this file stays small.
 */
@Component({
  selector: 'okr-article-frame',
  standalone: true,
  imports: [NgTemplateOutlet, OptionalCardHeader, IonCard, IonCardContent],
  /* the card stands where the frame stands */
  styles: [`:host { display: contents; }`],
  template: `
    <ion-card [class.banner]="isBanner() && !background()" [class.colored]="!!background()"
              [style.--article-bg]="background() || null" [style.--article-fg]="background() ? (lightText() ? '#ffffff' : '#1e293b') : null">
      <!-- a slideshow carries the title and subtitle on its images, like the header of la21staefa.ch -->
      @if (headerTemplate(); as header) {
        <!-- the editor: title, subtitle and intro edited in place (okr-article-header-edit) -->
        <ng-container [ngTemplateOutlet]="header" />
      } @else if (!inColumn()) {
        <okr-optional-card-header [intro]="intro().text" [introPosition]="intro().position" [title]="onImages() ? '' : title()" [subTitle]="onImages() ? '' : subTitle()" />
      }
      <ion-card-content>
        <ng-content />
      </ion-card-content>
    </ion-card>
  `
})
export class ArticleFrame {
  private readonly appStore = inject(AppStore);

  // inputs
  public section = input<ArticleSection | undefined>();
  /** a free article: where its header stands (articleHeaderPlace) */
  public headerPlace = input<ArticleHeaderPlace>('card');
  /** a classic article: title and subtitle stand on its slideshow, or the header in its text column */
  public titleOnImages = input(false);
  public headerInColumn = input(false);
  /** the editor: what stands in place of the header drawn here */
  public headerTemplate = input<TemplateRef<unknown> | undefined>();

  // computed
  protected onImages = computed(() => this.titleOnImages() || this.headerPlace() === 'slideshow');
  protected inColumn = computed(() => this.headerInColumn() || this.headerPlace() === 'column');
  protected isBanner = computed(() => this.section()?.properties.emphasis === 'banner');
  /** the article's own background colour ('' = none) and whether its text is white */
  protected background = computed(() => articleBackground(this.section()?.properties));
  protected lightText = computed(() => articleHasLightText(this.section()?.properties));
  protected title = computed(() => this.appStore.replacePlaceholders(this.section()?.title ?? ''));
  /** on a blog page or in the news feed the date stands under the title instead of the subtitle */
  private readonly asNews = inject(ARTICLE_AS_NEWS, { optional: true }) ?? false;
  protected subTitle = computed(() => this.appStore.replacePlaceholders(articleSubTitleLine(this.section(), this.asNews)));
  protected intro = computed(() => {
    const intro = getSectionIntro(this.section());
    return { ...intro, text: this.appStore.replacePlaceholders(intro.text) };
  });
}
