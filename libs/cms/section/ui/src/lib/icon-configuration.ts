import { Component, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { IconConfig, Slot } from '@bk2/shared-models';
import { NumberInput, StringSelect, TextInput } from '@bk2/shared-ui';
import { DEFAULT_NAME } from '@bk2/shared-constants';

@Component({
  selector: 'bk-icon-config',
  standalone: true,
  imports: [
    TextInput, NumberInput, StringSelect,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonCardSubtitle
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `  

    <ion-card>
      <ion-card-header>
          <ion-card-title>{{ title() }}</ion-card-title>
          <ion-card-subtitle>{{ subTitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12"> <!-- todo: icon selector -->
              <bk-text-input name="iconName" [value]="name()" (valueChange)="onFieldChange('name', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-number-input name="iconSize"  [value]="size()" (valueChange)="onFieldChange('size', $event)" [readOnly]="readOnly()" />           
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-string-select name="iconSlot"  [selectedString]="slot()" (selectedStringChange)="onFieldChange('slot', $event)" [readOnly]="readOnly()" [stringList] = "['start', 'end', 'icon-only']" />           
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class IconConfiguration {
  // inputs
  public formData = model.required<IconConfig>();
  public title = input('@content.section.type.button.icon.title');
  public subTitle = input('@content.section.type.button.icon.subtitle');
  public intro = input<string>();
  public readonly readOnly = input(true);

  // fields
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);
  protected size = linkedSignal(() => this.formData().size ?? 'default');
  protected slot = linkedSignal(() => this.formData().slot ?? 'start');

  protected onFieldChange(fieldName: string, $event: string | Slot | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
