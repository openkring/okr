import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { IconConfig, Slot } from '@okr/shared-models';
import { ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { SectionErrors, getFieldErrors } from '@okr/cms-section-util';
import { DEFAULT_NAME } from '@okr/shared-constants';

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
  selector: 'okr-icon-config',
  standalone: true,
  imports: [
    TextInput, NumberInput, StringSelect,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonCardSubtitle,
    ErrorNote
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
              <okr-text-input [i18n]="iconNameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [readOnly]="readOnly()" />
              <okr-error-note [errors]="errorsFor('icon.name')" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-number-input [i18n]="iconSizeI18n()" [value]="size()" (valueChange)="onFieldChange('size', $event)" [readOnly]="readOnly()" />
              <okr-error-note [errors]="errorsFor('icon.size')" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-string-select [i18n]="iconSlotI18n()" [selectedString]="slot()" (selectedStringChange)="onFieldChange('slot', $event)" [readOnly]="readOnly()" [stringList]="['start', 'end', 'icon-only']" />
              <okr-error-note [errors]="errorsFor('icon.slot')" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class IconConfiguration {
  // inputs
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});

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

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
