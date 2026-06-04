import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { TableGrid } from '@bk2/shared-models';
import { coerceBoolean } from '@bk2/shared-util-core';

interface TableGridConfigI18n {
  table_grid_template_label:               Signal<string>,
  table_grid_template_placeholder:         Signal<string>,
  table_grid_template_helper:              Signal<string>,
  table_grid_gap_label:                    Signal<string>,
  table_grid_gap_placeholder:              Signal<string>,
  table_grid_gap_helper:                   Signal<string>,
  table_grid_backgroundColor_label:        Signal<string>,
  table_grid_backgroundColor_placeholder:  Signal<string>,
  table_grid_backgroundColor_helper:       Signal<string>,
  table_grid_padding_label:                Signal<string>,
  table_grid_padding_placeholder:          Signal<string>,
  table_grid_padding_helper:               Signal<string>,
  table_grid_showTitleAs_label:            Signal<string>,
}

@Component({
  selector: 'bk-table-grid',
  standalone: true,
  imports: [
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
    TextInput, StringSelect
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
            <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="templateI18n()" [value]="template()" (valueChange)="onFieldChange('template', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-string-select [i18n]="showTitleAsI18n()" [selectedString]="showTitleAs()" (selectedStringChange)="onFieldChange('showTitleAs', $event)" [readOnly]="readOnly()" [stringList]="['title', 'legend', 'header', 'none']" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="gapI18n()" [value]="gap()" (valueChange)="onFieldChange('gap', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="backgroundColorI18n()" [value]="backgroundColor()" (valueChange)="onFieldChange('backgroundColor', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="paddingI18n()" [value]="padding()" (valueChange)="onFieldChange('padding', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                </ion-row>
            </ion-grid>
        </ion-card-content>
      </ion-card>
    `
})
export class TableGridConfiguration {
  // inputs
  public formData = model.required<TableGrid>();
  public title = input('@content.section.type.table.grid.title');
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public readonly i18n = input.required<TableGridConfigI18n>();

  // linked signals (fields)
  protected template = linkedSignal(() => this.formData().template ?? 'auto auto');
  protected gap = linkedSignal(() => this.formData().gap ?? '1px');
  protected backgroundColor = linkedSignal(() => this.formData().backgroundColor ?? 'var(--ion-color-step-200)');
  protected padding = linkedSignal(() => this.formData().padding ?? '1px');
  protected showTitleAs = linkedSignal(() => this.formData().showTitleAs ?? 'title');

  protected templateI18n = computed(() => ({
    name: 'template',
    label: this.i18n().table_grid_template_label(),
    placeholder: this.i18n().table_grid_template_placeholder(),
    helper: this.i18n().table_grid_template_helper(),
  } as TextInputI18n));

  protected gapI18n = computed(() => ({
    name: 'gap',
    label: this.i18n().table_grid_gap_label(),
    placeholder: this.i18n().table_grid_gap_placeholder(),
    helper: this.i18n().table_grid_gap_helper(),
  } as TextInputI18n));

  protected backgroundColorI18n = computed(() => ({
    name: 'backgroundColor',
    label: this.i18n().table_grid_backgroundColor_label(),
    placeholder: this.i18n().table_grid_backgroundColor_placeholder(),
    helper: this.i18n().table_grid_backgroundColor_helper(),
  } as TextInputI18n));

  protected paddingI18n = computed(() => ({
    name: 'padding',
    label: this.i18n().table_grid_padding_label(),
    placeholder: this.i18n().table_grid_padding_placeholder(),
    helper: this.i18n().table_grid_padding_helper(),
  } as TextInputI18n));
  protected showTitleAsI18n = computed(() => ({ name: 'showTitleAs', label: this.i18n().table_grid_showTitleAs_label() } as StringSelectI18n));

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
