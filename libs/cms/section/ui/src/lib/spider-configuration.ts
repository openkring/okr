import { Component, computed, input, linkedSignal, model, signal, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonItem, IonNote, IonRow, IonTextarea } from '@ionic/angular/standalone';

import { SpiderAxis, SpiderConfig, SpiderSeries } from '@okr/shared-models';
import { Checkbox, CheckboxI18n, NumberInput, NumberInputI18n } from '@okr/shared-ui';
import { parseSpiderList, stringifySpiderList, withSpiderDefaults } from '@okr/cms-section-util';

interface SpiderConfigI18n {
  spider_title:               Signal<string>;
  spider_subtitle:            Signal<string>;
  spider_axes_label:          Signal<string>;
  spider_axes_helper:         Signal<string>;
  spider_axes_error:          Signal<string>;
  spider_series_label:        Signal<string>;
  spider_series_helper:       Signal<string>;
  spider_series_error:        Signal<string>;
  spider_areaOpacity_label:   Signal<string>;
  spider_showLegend_label:    Signal<string>;
  spider_showLegend_helper:   Signal<string>;
}

@Component({
  selector: 'okr-spider-config',
  standalone: true,
  imports: [
    FormsModule,
    NumberInput, Checkbox,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonCardSubtitle, IonGrid, IonRow, IonCol, IonItem, IonTextarea, IonNote
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-textarea { font-family: monospace; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().spider_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().spider_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        @if(intro(); as intro) {
          @if(intro.length > 0) {
            <small><div [innerHTML]="intro"></div></small>
          }
        }

        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <ion-item lines="none">
                <ion-textarea
                  [label]="i18n().spider_axes_label()"
                  labelPlacement="stacked"
                  fill="outline"
                  [rows]="8"
                  [autoGrow]="true"
                  [readonly]="readOnly()"
                  [ngModel]="axesDraft()"
                  (ngModelChange)="axesDraft.set($event)"
                  (ionBlur)="commitAxes()"
                />
              </ion-item>
              <ion-item lines="none">
                @if(axesError()) {
                  <ion-note color="danger">{{ i18n().spider_axes_error() }}</ion-note>
                } @else {
                  <ion-note>{{ i18n().spider_axes_helper() }}</ion-note>
                }
              </ion-item>
            </ion-col>
            <ion-col size="12">
              <ion-item lines="none">
                <ion-textarea
                  [label]="i18n().spider_series_label()"
                  labelPlacement="stacked"
                  fill="outline"
                  [rows]="8"
                  [autoGrow]="true"
                  [readonly]="readOnly()"
                  [ngModel]="seriesDraft()"
                  (ngModelChange)="seriesDraft.set($event)"
                  (ionBlur)="commitSeries()"
                />
              </ion-item>
              <ion-item lines="none">
                @if(seriesError()) {
                  <ion-note color="danger">{{ i18n().spider_series_error() }}</ion-note>
                } @else {
                  <ion-note>{{ i18n().spider_series_helper() }}</ion-note>
                }
              </ion-item>
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-number-input [i18n]="areaOpacityI18n()" [value]="config().areaOpacity" (valueChange)="onFieldChange('areaOpacity', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="showLegendI18n()" [checked]="config().showLegend" (checkedChange)="onLegendChange($event)" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class SpiderConfiguration {
  // inputs
  public formData = model.required<SpiderConfig>();
  public intro = input<string>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<SpiderConfigI18n>();

  /** Legacy sections lack the newer fields — never bind the raw properties. */
  protected config = computed(() => withSpiderDefaults(this.formData()));
  /** Raw JSON text in the editor; reseeded from formData, committed on blur. */
  protected axesDraft = linkedSignal(() => stringifySpiderList(this.config().axes));
  protected seriesDraft = linkedSignal(() => stringifySpiderList(this.config().series));
  protected axesError = signal(false);
  protected seriesError = signal(false);

  protected areaOpacityI18n = computed(() => ({ name: 'areaOpacity', label: this.i18n().spider_areaOpacity_label() } as NumberInputI18n));
  protected showLegendI18n = computed(() => ({
    name: 'showLegend',
    label: this.i18n().spider_showLegend_label(),
    helper: this.i18n().spider_showLegend_helper(),
  } as CheckboxI18n));

  protected onFieldChange(fieldName: keyof SpiderConfig, fieldValue: number): void {
    this.formData.set({ ...this.config(), [fieldName]: fieldValue });
  }

  protected onLegendChange(showLegend: boolean): void {
    this.formData.set({ ...this.config(), showLegend });
  }

  protected commitAxes(): void {
    const axes = this.commit<SpiderAxis>(this.axesDraft(), this.axesError);
    if (axes) this.formData.set({ ...this.config(), axes });
  }

  protected commitSeries(): void {
    const series = this.commit<SpiderSeries>(this.seriesDraft(), this.seriesError);
    if (series) this.formData.set({ ...this.config(), series });
  }

  /** Parses one of the JSON editors; an empty editor means an empty list, invalid JSON is kept. */
  private commit<T>(text: string, error: { set: (value: boolean) => void }): T[] | undefined {
    if (text.trim().length === 0) {
      error.set(false);
      return [];
    }
    const list = parseSpiderList<T>(text);
    error.set(!list);
    return list;
  }
}
