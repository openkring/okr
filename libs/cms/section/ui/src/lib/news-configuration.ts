import { Component, computed, input, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { LONG_NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { NEWS_CONFIG_SHAPE, NewsConfig } from '@okr/shared-models';
import { Checkbox, CheckboxI18n, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';

interface NewsConfigI18n {
  news_title:                 Signal<string>;
  news_subtitle:              Signal<string>;
  news_max_label:             Signal<string>;
  news_max_placeholder:       Signal<string>;
  news_max_helper:            Signal<string>;
  news_more_label:            Signal<string>;
  news_more_placeholder:      Signal<string>;
  news_more_helper:           Signal<string>;
  news_showMore_label:        Signal<string>;
  news_showMore_helper:       Signal<string>;
  news_blogPage_label:        Signal<string>;
  news_blogPage_placeholder:  Signal<string>;
  news_blogPage_helper:       Signal<string>;
  kicker_label:               Signal<string>;
  kicker_placeholder:         Signal<string>;
  kicker_helper:              Signal<string>;
}

/**
 * Configuration of a news section: the small line above the title, how many articles, the blog page
 * they come from, and the optional «more» button. The title itself is part of the common section config.
 */
@Component({
  selector: 'okr-news-config',
  standalone: true,
  imports: [
    TextInput, NumberInput, Checkbox,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonGrid, IonRow, IonCol
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().news_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().news_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <okr-text-input [i18n]="kickerI18n()" [value]="config().kicker ?? ''" (valueChange)="patch({ kicker: $event })"
                              [maxLength]="kickerLength" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-number-input [i18n]="maxItemsI18n()" [value]="config().maxItems" (valueChange)="patch({ maxItems: $event })"
                                [integer]="true" [min]="1" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-text-input [i18n]="blogPageKeyI18n()" [value]="config().blogPageKey" (valueChange)="patch({ blogPageKey: $event })"
                              [maxLength]="blogPageKeyLength" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="showMoreButtonI18n()" [checked]="config().showMoreButton"
                            (checkedChange)="patch({ showMoreButton: $event })" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            @if (config().showMoreButton) {
              <ion-col size="12">
                <okr-text-input [i18n]="moreUrlI18n()" [value]="config().moreUrl" (valueChange)="patch({ moreUrl: $event })"
                                [maxLength]="urlLength" [readOnly]="readOnly()" [showHelper]="true" inputMode="url" />
              </ion-col>
            }
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class NewsConfiguration {
  public formData = model.required<NewsConfig>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<NewsConfigI18n>();

  protected readonly kickerLength = LONG_NAME_LENGTH;
  protected readonly blogPageKeyLength = LONG_NAME_LENGTH;
  protected readonly urlLength = URL_LENGTH;

  /** older news sections lack fields: fall back to the shape's defaults */
  protected readonly config = computed<NewsConfig>(() => {
    const c = this.formData();
    return {
      ...c,
      moreUrl: c?.moreUrl ?? NEWS_CONFIG_SHAPE.moreUrl,
      showMoreButton: c?.showMoreButton ?? NEWS_CONFIG_SHAPE.showMoreButton,
      maxItems: c?.maxItems ?? NEWS_CONFIG_SHAPE.maxItems,
      blogPageKey: c?.blogPageKey ?? NEWS_CONFIG_SHAPE.blogPageKey,
    };
  });

  protected readonly kickerI18n = computed(() => ({
    name: 'kicker', label: this.i18n().kicker_label(),
    placeholder: this.i18n().kicker_placeholder(), helper: this.i18n().kicker_helper(),
  } as TextInputI18n));

  protected readonly maxItemsI18n = computed(() => ({
    name: 'maxItems', label: this.i18n().news_max_label(),
    placeholder: this.i18n().news_max_placeholder(), helper: this.i18n().news_max_helper(),
  } as NumberInputI18n));

  protected readonly blogPageKeyI18n = computed(() => ({
    name: 'blogPageKey', label: this.i18n().news_blogPage_label(),
    placeholder: this.i18n().news_blogPage_placeholder(), helper: this.i18n().news_blogPage_helper(),
  } as TextInputI18n));

  protected readonly showMoreButtonI18n = computed(() => ({
    name: 'showMoreButton', label: this.i18n().news_showMore_label(), helper: this.i18n().news_showMore_helper(),
  } as CheckboxI18n));

  protected readonly moreUrlI18n = computed(() => ({
    name: 'moreUrl', label: this.i18n().news_more_label(),
    placeholder: this.i18n().news_more_placeholder(), helper: this.i18n().news_more_helper(),
  } as TextInputI18n));

  protected patch(changes: Partial<NewsConfig>): void {
    this.formData.set({ ...this.config(), ...changes });
  }
}
