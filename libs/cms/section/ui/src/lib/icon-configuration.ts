import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { IconConfig, Slot } from '@bk2/shared-models';
import { NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { DEFAULT_NAME } from '@bk2/shared-constants';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

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
  private readonly i18nService = inject(I18nService);

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

  protected readonly fieldI18n = this.i18nService.translateAll({
    icon_label:             PFX + 'icon.label',
    icon_placeholder:       PFX + 'icon.placeholder',
    icon_helper:            PFX + 'icon.helper',
    iconSize_label:         PFX + 'iconSize.label',
    iconSize_placeholder:   PFX + 'iconSize.placeholder',
    iconSize_helper:        PFX + 'iconSize.helper',
    iconSlot_label:         PFX + 'iconSlot.label',
  });

  protected iconSizeI18n = computed(() => ({ name: 'iconSize', label: this.fieldI18n.iconSize_label(), placeholder: this.fieldI18n.iconSize_placeholder(), helper: this.fieldI18n.iconSize_helper() } as NumberInputI18n));

  protected iconNameI18n = computed(() => ({
    name: 'iconName',
    label: this.fieldI18n.icon_label(),
    placeholder: this.fieldI18n.icon_placeholder(),
    helper: this.fieldI18n.icon_helper(),
  } as TextInputI18n));
  protected iconSlotI18n = computed(() => ({ name: 'iconSlot', label: this.fieldI18n.iconSlot_label() } as StringSelectI18n));

  protected onFieldChange(fieldName: string, $event: string | Slot | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
