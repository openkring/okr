import { Component, computed, inject, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCol, IonGrid, IonRow } from '@ionic/angular';

import { IconConfig, Slot } from '@okr/shared-models';
import { ErrorNote, IconInput, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInputI18n } from '@okr/shared-ui';
import { DEFAULT_BUTTON_ICON_SIZE, SECTION_ICON_PICKER, SectionErrors, getFieldErrors } from '@okr/cms-section-util';
import { DEFAULT_NAME } from '@okr/shared-constants';

interface IconConfigI18n {
  icon_label:             Signal<string>;
  icon_placeholder:       Signal<string>;
  icon_helper:            Signal<string>;
  icon_size_label:         Signal<string>;
  icon_size_placeholder:   Signal<string>;
  icon_size_helper:        Signal<string>;
  icon_slot_label:         Signal<string>;
}

/**
 * The «Icon» segment of the button card: the icon (picked from the icon collection, or typed), its size and its slot.
 * Without an icon the size and the slot are irrelevant and hidden; the size defaults to DEFAULT_BUTTON_ICON_SIZE.
 */
@Component({
  selector: 'okr-icon-config',
  standalone: true,
  imports: [
    IconInput, NumberInput, StringSelect,
    IonGrid, IonRow, IonCol,
    ErrorNote
  ],
  template: `
    <ion-grid>
      <ion-row>
        <ion-col size="12">
          <okr-icon-input [i18n]="iconNameI18n()" [icon]="name()" (iconChange)="onFieldChange('name', $event)" (selectClicked)="selectIcon()" [readOnly]="readOnly()" />
          <okr-error-note [errors]="errorsFor('icon.name')" />
        </ion-col>
        @if (name()) {
          <ion-col size="12" size-md="6">
            <okr-number-input [i18n]="iconSizeI18n()" [value]="size()" (valueChange)="onFieldChange('size', $event)" [readOnly]="readOnly()" [showHelper]="true" />
            <okr-error-note [errors]="errorsFor('icon.size')" />
          </ion-col>
          <ion-col size="12" size-md="6">
            <okr-string-select [i18n]="iconSlotI18n()" [selectedString]="slot()" (selectedStringChange)="onFieldChange('slot', $event)" [readOnly]="readOnly()" [stringList]="['start', 'end', 'icon-only']" />
            <okr-error-note [errors]="errorsFor('icon.slot')" />
          </ion-col>
        }
      </ion-row>
    </ion-grid>
  `
})
export class IconConfiguration {
  /** provided by the section edit modal; without it the icon name is typed by hand */
  private readonly iconPicker = inject(SECTION_ICON_PICKER, { optional: true });

  // inputs
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});

  public formData = model.required<IconConfig>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<IconConfigI18n>();

  // fields
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);
  protected size = linkedSignal(() => this.formData().size ?? DEFAULT_BUTTON_ICON_SIZE);
  protected slot = linkedSignal(() => this.formData().slot ?? 'start');

  protected iconSizeI18n = computed(() => ({ name: 'iconSize', label: this.i18n().icon_size_label(), placeholder: this.i18n().icon_size_placeholder(), helper: this.i18n().icon_size_helper() } as NumberInputI18n));

  protected iconNameI18n = computed(() => ({
    name: 'iconName',
    label: this.i18n().icon_label(),
    placeholder: this.i18n().icon_placeholder(),
    helper: this.i18n().icon_helper(),
  } as TextInputI18n));
  protected iconSlotI18n = computed(() => ({ name: 'iconSlot', label: this.i18n().icon_slot_label() } as StringSelectI18n));

  protected async selectIcon(): Promise<void> {
    if (!this.iconPicker || this.readOnly()) return;
    const icon = await this.iconPicker.pick(this.name());
    if (icon) this.onFieldChange('name', icon);
  }

  protected onFieldChange(fieldName: string, $event: string | Slot | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
