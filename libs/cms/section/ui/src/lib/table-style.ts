import { Component, computed, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TextInputComponent } from '@bk2/shared-ui';
import { TableStyle } from '@bk2/shared-models';
import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-table-style',
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
          <ion-card-title>{{ cardTitle() | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
            <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="textAlign" [value]="textAlign()" (valueChange)="onFieldChange('textAlign', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="backgroundColor" [value]="backgroundColor()" (valueChange)="onFieldChange('backgroundColor', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="fontSize" [value]="fontSize()" (valueChange)="onFieldChange('fontSize', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="fontWeight" [value]="fontWeight()" (valueChange)="onFieldChange('fontWeight', $event)" [showHelper]="true" [readOnly]="readOnly()" />
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
export class TableStyleComponent {
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

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
} 