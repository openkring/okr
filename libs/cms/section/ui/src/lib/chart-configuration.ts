import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, input, linkedSignal, model, signal, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonItem, IonNote, IonRow, IonTextarea } from '@ionic/angular/standalone';

import { StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { ChartOption, CHART_TYPES, getChartTitle, getChartType, parseChartOption, setChartTitle, setChartType, stringifyChartOption } from '@bk2/cms-section-util';

interface ChartConfigI18n {
  chart_title:                  Signal<string>;
  chart_subtitle:               Signal<string>;
  chart_type_label:             Signal<string>;
  chart_titleText_label:        Signal<string>;
  chart_titleText_placeholder:  Signal<string>;
  chart_titleText_helper:       Signal<string>;
  chart_options_label:          Signal<string>;
  chart_options_helper:         Signal<string>;
  chart_options_error:          Signal<string>;
}

@Component({
  selector: 'bk-chart-config',
  standalone: true,
  imports: [
    FormsModule,
    TextInput, StringSelect,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonCardSubtitle, IonGrid, IonRow, IonCol, IonItem, IonTextarea, IonNote
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-textarea { font-family: monospace; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().chart_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().chart_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        @if(intro(); as intro) {
          @if(intro.length > 0) {
            <small><div [innerHTML]="intro"></div></small>
          }
        }

        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-string-select [i18n]="typeI18n()" [selectedString]="chartType()" (selectedStringChange)="onTypeChange($event)" [readOnly]="readOnly()" [stringList]="chartTypes" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input [i18n]="titleTextI18n()" [value]="titleText()" (valueChange)="onTitleChange($event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <ion-item lines="none">
                <ion-textarea
                  [label]="i18n().chart_options_label()"
                  labelPlacement="stacked"
                  fill="outline"
                  [rows]="12"
                  [autoGrow]="true"
                  [readonly]="readOnly()"
                  [ngModel]="draft()"
                  (ngModelChange)="draft.set($event)"
                  (ionBlur)="commitJson()"
                />
              </ion-item>
              <ion-item lines="none">
                @if(jsonError()) {
                  <ion-note color="danger">{{ i18n().chart_options_error() }}</ion-note>
                } @else {
                  <ion-note>{{ i18n().chart_options_helper() }}</ion-note>
                }
              </ion-item>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ChartConfiguration {
  // inputs
  public formData = model.required<ChartOption>();
  public intro = input<string>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<ChartConfigI18n>();

  // passing constants to the template
  protected chartTypes = CHART_TYPES;

  // fields (linked to formData; reseed when convenience controls change it)
  protected chartType = linkedSignal(() => getChartType(this.formData()));
  protected titleText = linkedSignal(() => getChartTitle(this.formData()));
  /** Raw JSON text in the editor; reseeded from formData, committed on blur. */
  protected draft = linkedSignal(() => stringifyChartOption(this.formData()));
  protected jsonError = signal(false);

  protected typeI18n = computed(() => ({ name: 'type', label: this.i18n().chart_type_label() } as StringSelectI18n));
  protected titleTextI18n = computed(() => ({
    name: 'titleText',
    label: this.i18n().chart_titleText_label(),
    placeholder: this.i18n().chart_titleText_placeholder(),
    helper: this.i18n().chart_titleText_helper(),
  } as TextInputI18n));

  protected onTypeChange(type: string): void {
    this.formData.set(setChartType(this.formData(), type));
  }

  protected onTitleChange(text: string): void {
    this.formData.set(setChartTitle(this.formData(), text));
  }

  protected commitJson(): void {
    const text = this.draft();
    const parsed = parseChartOption(text);
    if (parsed) {
      this.jsonError.set(false);
      this.formData.set(parsed);
    } else {
      this.jsonError.set(text.trim().length > 0);
    }
  }
}
