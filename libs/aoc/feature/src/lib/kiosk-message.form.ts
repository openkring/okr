import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { Checkbox, CheckboxI18n, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { AOC_I18N_KEYS, AocI18n, KIOSK_COUNTDOWN_MAX, KIOSK_COUNTDOWN_MIN, KioskMessageFormData, kioskMessageValidations } from '@okr/aoc-util';
import { I18nService } from '@okr/shared-i18n';

/**
 * The message an admin pops on a kiosk device, plus an optional countdown after which the
 * device closes it by itself.
 */
@Component({
  selector: 'okr-kiosk-message-form',
  standalone: true,
  imports: [
    NotesInput, Checkbox, NumberInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-notes-input [i18n]="messageI18n()" [value]="message()"
                    (valueChange)="onFieldChange('message', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="countdownEnabledI18n()" [checked]="withCountdown()"
                    (checkedChange)="onFieldChange('withCountdown', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                @if (withCountdown()) {
                  <ion-col size="12" size-md="6">
                    <okr-number-input [i18n]="countdownI18n()" [value]="countdown()"
                      (valueChange)="onFieldChange('countdown', $event)"
                      [min]="min" [max]="max" [readOnly]="isReadOnly()" />
                  </ion-col>
                }
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `
})
export class KioskMessageForm {
  // inputs
  public formData = model.required<KioskMessageFormData>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  protected readonly kioskMessageForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, kioskMessageValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.kioskMessageForm().valid()));
  }

  private readonly i18n = inject(I18nService).translateAll(AOC_I18N_KEYS) as AocI18n;

  protected readonly min = KIOSK_COUNTDOWN_MIN;
  protected readonly max = KIOSK_COUNTDOWN_MAX;
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly message = computed(() => this.formData()?.message ?? '');
  protected readonly withCountdown = computed(() => this.formData()?.withCountdown === true);
  protected readonly countdown = computed(() => this.formData()?.countdown ?? KIOSK_COUNTDOWN_MIN);

  protected messageI18n = computed(() => ({
    name: 'message', label: this.i18n.kiosk_message_label(), placeholder: this.i18n.kiosk_message_placeholder()
  } as NotesInputI18n));

  protected countdownEnabledI18n = computed(() => ({
    name: 'withCountdown', label: this.i18n.kiosk_countdown_label(), helper: ''
  } as CheckboxI18n));

  protected countdownI18n = computed(() => ({
    name: 'countdown', label: this.i18n.kiosk_countdown_seconds(), placeholder: '10', helper: ''
  } as NumberInputI18n));

  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
