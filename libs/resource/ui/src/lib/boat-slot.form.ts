import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { BOAT_SLOT_COLORS, BOAT_STRATEGY_TYPES, BoatSlotLabel, DEFAULT_SWISSLOS_PERCENT } from '@okr/shared-models';
import { Checkbox, CheckboxI18n, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { boatSlotValidations, ResourceI18n } from '@okr/resource-util';

/** Free slot of the Bootseinteilung grid: a planning note plus an optional background color. */
@Component({
  selector: 'okr-boat-slot-form',
  standalone: true,
  imports: [
    TextInput, StringSelect, Checkbox, NumberInput,
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
                  <!-- an occupied slot carries the boat's name; only a free slot names its planned boat -->
                  @if (boatName()) {
                    <okr-text-input [i18n]="boatNameI18n()" [value]="boatName()" [readOnly]="true" />
                  } @else {
                    <okr-text-input [i18n]="textI18n()" [value]="text()" (valueChange)="onFieldChange('text', $event)"
                      [autofocus]="true" [maxLength]="50" [readOnly]="isReadOnly()" />
                  }
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-string-select [i18n]="colorI18n()" [selectedString]="color()"
                    (selectedStringChange)="onFieldChange('color', $event)"
                    [stringList]="colors" [labels]="colorLabels()" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-checkbox [i18n]="strategyI18n()" [checked]="isStrategyRelevant()"
                    (checkedChange)="onBooleanChange('isStrategyRelevant', $event)"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              @if (isStrategyRelevant()) {
                <ion-row>
                  <ion-col size="12">
                    <okr-string-select [i18n]="typeI18n()" [selectedString]="strategyType()"
                      (selectedStringChange)="onFieldChange('strategyType', $event)"
                      [stringList]="strategyTypes" [labels]="strategyTypeLabels()" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12">
                    <okr-number-input [i18n]="priceI18n()" [value]="price()"
                      (valueChange)="onNumberChange('price', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
                <!-- funding applies to a purchase only; a sale brings money in -->
                @if (strategyType() === 'buy') {
                  <ion-row>
                    <ion-col size="12">
                      <okr-number-input [i18n]="swisslosI18n()" [value]="swisslos()" [max]="100"
                        (valueChange)="onNumberChange('swisslos', $event)" [readOnly]="isReadOnly()" />
                    </ion-col>
                  </ion-row>
                  <ion-row>
                    <ion-col size="12">
                      <okr-number-input [i18n]="donationsI18n()" [value]="donations()"
                        (valueChange)="onNumberChange('donations', $event)" [readOnly]="isReadOnly()" />
                    </ion-col>
                  </ion-row>
                }
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `
})
export class BoatSlotForm {
  // inputs
  public readonly i18n = input.required<ResourceI18n>();
  public formData = model.required<BoatSlotLabel>();
  public readonly readOnly = input(true);
  public readonly showForm = input(true);
  /** Set when the slot is occupied by a boat: its name replaces the editable text field. */
  public readonly boatName = input('');

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly colors = [...BOAT_SLOT_COLORS];
  protected readonly strategyTypes = [...BOAT_STRATEGY_TYPES] as string[];

  // signal form — wraps formData with Vest validation
  protected readonly slotForm = form(this.formData, (path) =>
    validateVestTree(path, boatSlotValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.slotForm().valid()));
  }

  // computed field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly text = computed(() => this.formData()?.text ?? '');
  protected readonly color = computed(() => this.formData()?.color ?? '');
  // legacy labels predate the strategy fields — coalesce, do not trust the stored shape
  protected readonly isStrategyRelevant = computed(() => this.formData()?.isStrategyRelevant === true);
  protected readonly strategyType = computed(() => this.formData()?.strategyType ?? 'buy');
  protected readonly price = computed(() => this.formData()?.price ?? 0);
  protected readonly swisslos = computed(() => this.formData()?.swisslos ?? DEFAULT_SWISSLOS_PERCENT);
  protected readonly donations = computed(() => this.formData()?.donations ?? 0);
  /** parallel to `strategyTypes`, same order as BOAT_STRATEGY_TYPES */
  protected readonly strategyTypeLabels = computed(() => [this.i18n().alloc_strategy_buy(), this.i18n().alloc_strategy_sell()]);
  /** parallel to `colors`, same order as BOAT_SLOT_COLORS */
  protected readonly colorLabels = computed(() => [
    this.i18n().alloc_color_success(), this.i18n().alloc_color_danger(), this.i18n().alloc_color_warning(),
    this.i18n().alloc_color_primary(), this.i18n().alloc_color_secondary(), this.i18n().alloc_color_tertiary(),
    this.i18n().alloc_color_light(), this.i18n().alloc_color_medium(), this.i18n().alloc_color_dark(),
    this.i18n().alloc_color_none(),
  ]);

  protected textI18n = computed(() => ({
    name: 'text',
    label: this.i18n().alloc_slot_text_label(),
    placeholder: this.i18n().alloc_slot_text_ph(),
    helper: this.i18n().alloc_slot_text_helper()
  } as TextInputI18n));

  protected boatNameI18n = computed(() => ({
    name: 'boatName',
    label: this.i18n().name_label(),
  } as TextInputI18n));

  protected colorI18n = computed(() => ({
    name: 'color',
    label: this.i18n().alloc_slot_color_label(),
    helper: this.i18n().alloc_slot_color_helper()
  } as StringSelectI18n));

  protected strategyI18n = computed(() => ({
    name: 'isStrategyRelevant',
    label: this.i18n().alloc_slot_strategy_label(),
    helper: this.i18n().alloc_slot_strategy_helper()
  } as CheckboxI18n));

  protected typeI18n = computed(() => ({
    name: 'strategyType',
    label: this.i18n().alloc_slot_type_label(),
    helper: this.i18n().alloc_slot_type_helper()
  } as StringSelectI18n));

  protected priceI18n = computed(() => ({
    name: 'price',
    label: this.i18n().alloc_slot_price_label(),
    placeholder: this.i18n().alloc_slot_price_ph(),
    helper: this.i18n().alloc_slot_price_helper()
  } as NumberInputI18n));

  protected swisslosI18n = computed(() => ({
    name: 'swisslos',
    label: this.i18n().alloc_slot_swisslos_label(),
    placeholder: this.i18n().alloc_slot_swisslos_ph(),
    helper: this.i18n().alloc_slot_swisslos_helper()
  } as NumberInputI18n));

  protected donationsI18n = computed(() => ({
    name: 'donations',
    label: this.i18n().alloc_slot_donations_label(),
    placeholder: this.i18n().alloc_slot_donations_ph(),
    helper: this.i18n().alloc_slot_donations_helper()
  } as NumberInputI18n));

  protected onFieldChange(fieldName: string, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onBooleanChange(fieldName: string, fieldValue: boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onNumberChange(fieldName: string, fieldValue: number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: Number(fieldValue) || 0 }));
  }
}
