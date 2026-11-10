import { Component, computed, input, model, Signal } from '@angular/core';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonNote, IonRow, IonSelect, IonSelectOption
} from '@ionic/angular';

import { LONG_NAME_LENGTH } from '@okr/shared-constants';
import { ArticleConfig } from '@okr/shared-models';
import { TextInput, TextInputI18n } from '@okr/shared-ui';

export type ArticleEmphasis = NonNullable<ArticleConfig['emphasis']>;
const EMPHASES: ArticleEmphasis[] = ['none', 'banner'];

interface KickerConfigI18n {
  kicker_title:        Signal<string>;
  kicker_subtitle:     Signal<string>;
  kicker_label:        Signal<string>;
  kicker_placeholder:  Signal<string>;
  kicker_helper:       Signal<string>;
  emphasis_label:      Signal<string>;
  emphasis_none:       Signal<string>;
  emphasis_banner:     Signal<string>;
  emphasis_helper:     Signal<string>;
}

/**
 * The small line above the title of a hero or an article (plain German only), and for an article
 * its emphasis (a normal block or a full-width banner).
 */
@Component({
  selector: 'okr-kicker-config',
  standalone: true,
  imports: [
    TextInput,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonGrid, IonRow, IonCol, IonSelect, IonSelectOption, IonNote
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().kicker_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().kicker_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" [sizeMd]="showEmphasis() ? '6' : '12'">
              <okr-text-input [i18n]="kickerI18n()" [value]="kicker() ?? ''" (valueChange)="kicker.set($event)"
                              [maxLength]="kickerLength" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>
            @if (showEmphasis()) {
              <ion-col size="12" size-md="6">
                <ion-select [label]="i18n().emphasis_label()" labelPlacement="stacked"
                            [value]="emphasis() ?? 'none'" [disabled]="readOnly()"
                            (ionChange)="emphasis.set($event.detail.value)">
                  @for (e of emphases; track e) {
                    <ion-select-option [value]="e">{{ emphasisLabels()[e] }}</ion-select-option>
                  }
                </ion-select>
                <ion-note>{{ i18n().emphasis_helper() }}</ion-note>
              </ion-col>
            }
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class KickerConfiguration {
  public kicker = model<string | undefined>('');
  public emphasis = model<ArticleEmphasis | undefined>('none');
  public readonly showEmphasis = input(false);
  public readonly readOnly = input(true);
  public readonly i18n = input.required<KickerConfigI18n>();

  protected readonly emphases = EMPHASES;
  protected readonly kickerLength = LONG_NAME_LENGTH;

  protected readonly emphasisLabels = computed<Record<ArticleEmphasis, string>>(() => ({
    none: this.i18n().emphasis_none(), banner: this.i18n().emphasis_banner(),
  }));

  protected readonly kickerI18n = computed(() => ({
    name: 'kicker', label: this.i18n().kicker_label(),
    placeholder: this.i18n().kicker_placeholder(), helper: this.i18n().kicker_helper(),
  } as TextInputI18n));
}
