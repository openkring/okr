import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { TableStyle } from '@bk2/shared-models';

interface TableStyleConfigI18n {
  table_style_textAlign_label:         Signal<string>,
  table_style_textAlign_placeholder:   Signal<string>,
  table_style_textAlign_helper:        Signal<string>,
  table_style_backgroundColor_label:       Signal<string>,
  table_style_backgroundColor_placeholder: Signal<string>,
  table_style_backgroundColor_helper:      Signal<string>,
  table_style_fontSize_label:          Signal<string>,
  table_style_fontSize_placeholder:    Signal<string>,
  table_style_fontSize_helper:         Signal<string>,
  table_style_padding_label:           Signal<string>,
  table_style_padding_placeholder:     Signal<string>,
  table_style_padding_helper:          Signal<string>,
  table_style_textColor_label:         Signal<string>,
  table_style_textColor_placeholder:   Signal<string>,
  table_style_textColor_helper:        Signal<string>,
  table_style_border_label:            Signal<string>,
  table_style_border_placeholder:      Signal<string>,
  table_style_border_helper:           Signal<string>,
  table_style_fontWeight_label:        Signal<string>,
}

@Component({
  selector: 'bk-table-style',
  standalone: true,
  imports: [
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
    TextInput, StringSelect
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ cardTitle() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
            <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="textAlignI18n()" [value]="textAlign()" (valueChange)="onFieldChange('textAlign', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="backgroundColorI18n()" [value]="backgroundColor()" (valueChange)="onFieldChange('backgroundColor', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="fontSizeI18n()" [value]="fontSize()" (valueChange)="onFieldChange('fontSize', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-string-select [i18n]="fontWeightI18n()" [selectedString]="fontWeight()" (selectedStringChange)="onFieldChange('fontWeight', $event)" [readOnly]="readOnly()" [stringList]="['thin', 'light', 'normal', 'medium', 'bold', 'black']" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="paddingI18n()" [value]="padding()" (valueChange)="onFieldChange('padding', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="textColorI18n()" [value]="textColor()" (valueChange)="onFieldChange('textColor', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="borderI18n()" [value]="border()" (valueChange)="onFieldChange('border', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                </ion-row>
            </ion-grid>
        </ion-card-content>
      </ion-card>
    `
})
export class TableStyleConfiguration {
  // inputs
  public formData = model.required<TableStyle>();
  public name = input.required<'header' | 'body'>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<TableStyleConfigI18n>();

  // linked signals (fields)
  protected cardTitle = computed(() => `@content.section.type.table.${this.name()}.title`);
  protected textAlign = linkedSignal(() => this.formData().textAlign ?? 'left');
  protected fontSize = linkedSignal(() => this.formData().fontSize ?? '0.8rem');
  protected fontWeight = linkedSignal(() => this.formData().fontWeight ?? 'normal');
  protected backgroundColor = linkedSignal(() => this.formData().backgroundColor ?? 'var(--ion-color-step-200)');
  protected padding = linkedSignal(() => this.formData().padding ?? '5px');
  protected textColor = linkedSignal(() => this.formData().textColor ?? 'var(--ion-text-color)');
  protected border = linkedSignal(() => this.formData().border ?? '0.5px solid var(--ion-color-medium)');

  protected textAlignI18n = computed(() => ({
    name: 'textAlign',
    label: this.i18n().table_style_textAlign_label(),
    placeholder: this.i18n().table_style_textAlign_placeholder(),
    helper: this.i18n().table_style_textAlign_helper(),
  } as TextInputI18n));

  protected backgroundColorI18n = computed(() => ({
    name: 'backgroundColor',
    label: this.i18n().table_style_backgroundColor_label(),
    placeholder: this.i18n().table_style_backgroundColor_placeholder(),
    helper: this.i18n().table_style_backgroundColor_helper(),
  } as TextInputI18n));

  protected fontSizeI18n = computed(() => ({
    name: 'fontSize',
    label: this.i18n().table_style_fontSize_label(),
    placeholder: this.i18n().table_style_fontSize_placeholder(),
    helper: this.i18n().table_style_fontSize_helper(),
  } as TextInputI18n));

  protected paddingI18n = computed(() => ({
    name: 'padding',
    label: this.i18n().table_style_padding_label(),
    placeholder: this.i18n().table_style_padding_placeholder(),
    helper: this.i18n().table_style_padding_helper(),
  } as TextInputI18n));

  protected textColorI18n = computed(() => ({
    name: 'textColor',
    label: this.i18n().table_style_textColor_label(),
    placeholder: this.i18n().table_style_textColor_placeholder(),
    helper: this.i18n().table_style_textColor_helper(),
  } as TextInputI18n));

  protected borderI18n = computed(() => ({
    name: 'border',
    label: this.i18n().table_style_border_label(),
    placeholder: this.i18n().table_style_border_placeholder(),
    helper: this.i18n().table_style_border_helper(),
  } as TextInputI18n));
  protected fontWeightI18n = computed(() => ({ name: 'fontWeight', label: this.i18n().table_style_fontWeight_label() } as StringSelectI18n));

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
