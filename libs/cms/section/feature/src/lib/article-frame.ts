import { Component, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular';

import { ArticleHeaderPlace, articleBackground, articleHasLightText, getSectionIntro } from '@okr/cms-section-util';
import { AppStore } from '@okr/shared-feature';
import { ArticleSection } from '@okr/shared-models';
import { OptionalCardHeader } from '@okr/shared-ui';

/**
 * The frame of an article: card, banner, own colour and the header above the content, which is projected (spec 1.175 §9).
 * For the article section and the canvas of the editor. The article section loads eagerly, so this file stays small.
 */
@Component({
  selector: 'okr-article-frame',
  standalone: true,
  imports: [OptionalCardHeader, IonCard, IonCardContent],
  styles: [`
    /* the card stands where the frame stands */
    :host { display: contents; }
    ion-card-content { padding: 5px; }
    ion-card.banner { background: color-mix(in srgb, var(--ion-color-secondary) 12%, transparent); border-radius: 8px; padding: 12px; }
    /* an own background colour (ArticleConfig.background): a solid band; text inherits the chosen colour */
    ion-card.colored { --background: var(--article-bg); background: var(--article-bg); --color: var(--article-fg); color: var(--article-fg); border-radius: 8px; padding: 12px; }
    ion-card.colored ::ng-deep ion-card-title, ion-card.colored ::ng-deep ion-card-subtitle { --color: inherit; color: inherit; }
    ion-card.colored ::ng-deep ion-item { --background: transparent; --color: inherit; color: inherit; }
    ion-card.colored ::ng-deep a { color: inherit; }
    ion-card.colored { --article-columns-align: center; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }
  `],
  template: `
    <ion-card [class.banner]="isBanner() && !background()" [class.colored]="!!background()"
              [style.--article-bg]="background() || null" [style.--article-fg]="background() ? (lightText() ? '#ffffff' : '#1e293b') : null">
      <!-- a slideshow carries the title and subtitle on its images, like the header of la21staefa.ch -->
      @if (!inColumn()) {
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

  // computed
  protected onImages = computed(() => this.titleOnImages() || this.headerPlace() === 'slideshow');
  protected inColumn = computed(() => this.headerInColumn() || this.headerPlace() === 'column');
  protected isBanner = computed(() => this.section()?.properties.emphasis === 'banner');
  /** the article's own background colour ('' = none) and whether its text is white */
  protected background = computed(() => articleBackground(this.section()?.properties));
  protected lightText = computed(() => articleHasLightText(this.section()?.properties));
  protected title = computed(() => this.appStore.replacePlaceholders(this.section()?.title ?? ''));
  protected subTitle = computed(() => this.appStore.replacePlaceholders(this.section()?.subTitle ?? ''));
  protected intro = computed(() => {
    const intro = getSectionIntro(this.section());
    return { ...intro, text: this.appStore.replacePlaceholders(intro.text) };
  });
}
