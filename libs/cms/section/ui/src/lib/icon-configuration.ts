import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { IconConfig, Slot } from '@bk2/shared-models';
import { NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { DEFAULT_NAME } from '@bk2/shared-constants';

interface IconConfigI18n {
  icon_title:             Signal<string>;
  icon_subtitle:          Signal<string>;
  icon_label:             Signal<string>;
  icon_placeholder:       Signal<string>;
  icon_helper:            Signal<string>;
  icon_size_label:         Signal<string>;
  icon_size_placeholder:   Signal<string>;
  icon_size_helper:        Signal<string>;
  icon_slot_label:         Signal<string>;
}

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
          <ion-card-title>{{ i18n().icon_title() }}</ion-card-title>
          <ion-card-subtitle>{{ i18n().icon_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12"> <!-- todo: icon selector -->
              <bk-text-input [i18n]="iconNameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-number-input [i18n]="iconSizeI18n()" [value]="size()" (valueChange)="onFieldChange('size', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-string-select [i18n]="iconSlotI18n()" [selectedString]="slot()" (selectedStringChange)="onFieldChange('slot', $event)" [readOnly]="readOnly()" [stringList]="['start', 'end', 'icon-only']" />
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
  public intro = input<string>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<IconConfigI18n>();

  // fields
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);
  protected size = linkedSignal(() => this.formData().size ?? 'default');
  protected slot = linkedSignal(() => this.formData().slot ?? 'start');

  protected iconSizeI18n = computed(() => ({ name: 'iconSize', label: this.i18n().icon_size_label(), placeholder: this.i18n().icon_size_placeholder(), helper: this.i18n().icon_size_helper() } as NumberInputI18n));

  protected iconNameI18n = computed(() => ({
    name: 'iconName',
    label: this.i18n().icon_label(),
    placeholder: this.i18n().icon_placeholder(),
    helper: this.i18n().icon_helper(),
  } as TextInputI18n));
  protected iconSlotI18n = computed(() => ({ name: 'iconSlot', label: this.i18n().icon_slot_label() } as StringSelectI18n));

  protected onFieldChange(fieldName: string, $event: string | Slot | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
