import { Component, computed, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TextInputComponent } from '@bk2/shared-ui';
import { TableGrid } from '@bk2/shared-models';
import { coerceBoolean } from '@bk2/shared-util-core';
import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-table-grid',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
    TextInputComponent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ title() | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
            <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="template" [value]="template()" (valueChange)="onFieldChange('template', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="gap" [value]="gap()" (valueChange)="onFieldChange('gap', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="backgroundColor" [value]="backgroundColor()" (valueChange)="onFieldChange('backgroundColor', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="padding" [value]="padding()" (valueChange)="onFieldChange('padding', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                </ion-row>
            </ion-grid>
        </ion-card-content>
      </ion-card>
    `
})
export class TableGridComponent {
  // inputs
  public formData = model.required<TableGrid>();
  public title = input('@content.section.type.table.grid.title');
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // linked signals (fields)
  protected template = linkedSignal(() => this.formData().template ?? 'auto auto');
  protected gap = linkedSignal(() => this.formData().gap ?? '1px');
  protected backgroundColor = linkedSignal(() => this.formData().backgroundColor ?? 'var(--ion-color-step-200)');
  protected padding = linkedSignal(() => this.formData().padding ?? '1px');

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
} 