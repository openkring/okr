import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { TableStyle } from '@bk2/shared-models';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

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
  private readonly i18nService = inject(I18nService);

  // inputs
  public formData = model.required<TableStyle>();
  public name = input.required<'header' | 'body'>();
  public readonly readOnly = input(true);

  // linked signals (fields)
  protected cardTitle = computed(() => `@content.section.type.table.${this.name()}.title`);
  protected textAlign = linkedSignal(() => this.formData().textAlign ?? 'left');
  protected fontSize = linkedSignal(() => this.formData().fontSize ?? '0.8rem');
  protected fontWeight = linkedSignal(() => this.formData().fontWeight ?? 'normal');
  protected backgroundColor = linkedSignal(() => this.formData().backgroundColor ?? 'var(--ion-color-step-200)');
  protected padding = linkedSignal(() => this.formData().padding ?? '5px');
  protected textColor = linkedSignal(() => this.formData().textColor ?? 'var(--ion-text-color)');
  protected border = linkedSignal(() => this.formData().border ?? '0.5px solid var(--ion-color-medium)');

  protected readonly fieldI18n = this.i18nService.translateAll({
    textAlign_label:         PFX + 'textAlign.label',
    textAlign_placeholder:   PFX + 'textAlign.placeholder',
    textAlign_helper:        PFX + 'textAlign.helper',
    backgroundColor_label:       PFX + 'backgroundColor.label',
    backgroundColor_placeholder: PFX + 'backgroundColor.placeholder',
    backgroundColor_helper:      PFX + 'backgroundColor.helper',
    fontSize_label:          PFX + 'fontSize.label',
    fontSize_placeholder:    PFX + 'fontSize.placeholder',
    fontSize_helper:         PFX + 'fontSize.helper',
    padding_label:           PFX + 'padding.label',
    padding_placeholder:     PFX + 'padding.placeholder',
    padding_helper:          PFX + 'padding.helper',
    textColor_label:         PFX + 'textColor.label',
    textColor_placeholder:   PFX + 'textColor.placeholder',
    textColor_helper:        PFX + 'textColor.helper',
    border_label:            PFX + 'border.label',
    border_placeholder:      PFX + 'border.placeholder',
    border_helper:           PFX + 'border.helper',
    fontWeight_label:        PFX + 'fontWeight.label',
  });

  protected textAlignI18n = computed(() => ({
    name: 'textAlign',
    label: this.fieldI18n.textAlign_label(),
    placeholder: this.fieldI18n.textAlign_placeholder(),
    helper: this.fieldI18n.textAlign_helper(),
  } as TextInputI18n));

  protected backgroundColorI18n = computed(() => ({
    name: 'backgroundColor',
    label: this.fieldI18n.backgroundColor_label(),
    placeholder: this.fieldI18n.backgroundColor_placeholder(),
    helper: this.fieldI18n.backgroundColor_helper(),
  } as TextInputI18n));

  protected fontSizeI18n = computed(() => ({
    name: 'fontSize',
    label: this.fieldI18n.fontSize_label(),
    placeholder: this.fieldI18n.fontSize_placeholder(),
    helper: this.fieldI18n.fontSize_helper(),
  } as TextInputI18n));

  protected paddingI18n = computed(() => ({
    name: 'padding',
    label: this.fieldI18n.padding_label(),
    placeholder: this.fieldI18n.padding_placeholder(),
    helper: this.fieldI18n.padding_helper(),
  } as TextInputI18n));

  protected textColorI18n = computed(() => ({
    name: 'textColor',
    label: this.fieldI18n.textColor_label(),
    placeholder: this.fieldI18n.textColor_placeholder(),
    helper: this.fieldI18n.textColor_helper(),
  } as TextInputI18n));

  protected borderI18n = computed(() => ({
    name: 'border',
    label: this.fieldI18n.border_label(),
    placeholder: this.fieldI18n.border_placeholder(),
    helper: this.fieldI18n.border_helper(),
  } as TextInputI18n));
  protected fontWeightI18n = computed(() => ({ name: 'fontWeight', label: this.fieldI18n.fontWeight_label() } as StringSelectI18n));

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
