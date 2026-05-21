import { Component, computed, input, linkedSignal, model, output, Signal } from '@angular/core';
import { vestForms } from 'ngx-vest-forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { CategoryListModel, ResourceModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelect, Chips, Color, ErrorNote, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, PropertyList, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_CAR_TYPE, DEFAULT_GENDER, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PET_TYPE, DEFAULT_PRICE, DEFAULT_RBOAT_TYPE, DEFAULT_RBOAT_USAGE, DEFAULT_TAGS } from '@bk2/shared-constants';

import { resourceValidations, getKeyNr, getLockerNr } from '@bk2/resource-util';


export interface ResourceFormI18n {
  form_card_title: Signal<string>;
  bkey_label: Signal<string>;
  bkey_placeholder: Signal<string>;
  bkey_helper: Signal<string>;
  name_label: Signal<string>;
  name_placeholder: Signal<string>;
  name_helper: Signal<string>;
  load_label: Signal<string>;
  load_placeholder: Signal<string>;
  load_helper: Signal<string>;
  keyNr_label: Signal<string>;
  keyNr_placeholder: Signal<string>;
  keyNr_helper: Signal<string>;
  currentValue_label: Signal<string>;
  currentValue_placeholder: Signal<string>;
  currentValue_helper: Signal<string>;
  lockerNr_label: Signal<string>;
  lockerNr_placeholder: Signal<string>;
  lockerNr_helper: Signal<string>;
  description_label: Signal<string>;
  description_placeholder: Signal<string>;
  color_label: Signal<string>;
}

@Component({
  selector: 'bk-resource-form',
  standalone: true,
  imports: [
    vestForms,
    Chips, NotesInput, PropertyList, TextInput, NumberInput, ErrorNote, CategorySelect, Color,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form scVestForm
        [formValue]="formData()"
        (formValueChange)="onFormChange($event)"
        [suite]="suite"
        (dirtyChange)="dirty.emit($event)"
        (validChange)="valid.emit($event)"
      >

        @switch(resourceType()) {
          <!-- ***************************************** ROWING BOAT ***************************************** -->
          @case('rboat') {
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ i18n().form_card_title() }}</ion-card-title>
              </ion-card-header>
              <ion-card-content class="ion-no-padding">
                <ion-grid>
                  @if(hasRole('admin')) {
                    <ion-row>
                      <ion-col size="12" size-md="6">
                        <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                      </ion-col>
                    </ion-row>
                  }
                  <ion-row>
                    <ion-col size="12">
                      <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="nameErrors()" />
                    </ion-col>
                    <ion-col size="12">
                      <bk-cat-select [category]="subTypes()!" [selectedItemName]="subType()" (selectedItemNameChange)="onFieldChange('subType', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12">
                      <bk-cat-select [category]="usages()!" [selectedItemName]="usage()" (selectedItemNameChange)="onFieldChange('usage', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <bk-text-input [i18n]="loadI18n()" [value]="load()" (valueChange)="onFieldChange('load', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="loadErrors()" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <bk-number-input [i18n]="currentValueI18n()" [value]="currentValue()" (valueChange)="onFieldChange('currentValue', $event)" [maxLength]=10 [showHelper]=true [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="currentValueErrors()" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <bk-color [label]="colorLabel()" [hexColor]="hexColor()" (hexColorChange)="onFieldChange('color', $event)" [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="hexColorErrors()" />
                    </ion-col>
                  </ion-row>
                </ion-grid>
              </ion-card-content>
            </ion-card>
          }

          <!-- *****************************************  BOAT ***************************************** -->
          @case('boat') {
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ i18n().form_card_title() }}</ion-card-title>
              </ion-card-header>
              <ion-card-content class="ion-no-padding">
                <ion-grid>
                  @if(hasRole('admin')) {
                    <ion-row>
                      <ion-col size="12" size-md="6">
                        <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                      </ion-col>
                    </ion-row>
                  }
                  <ion-row>
                    <ion-col size="12">
                      <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="nameErrors()" />
                    </ion-col>
<!--                   tbd. boat subtype and category
                    <ion-col size="12">
                      <bk-cat-select [category]="subTypes()!" [selectedItemName]="subType()" (selectedItemNameChange)="onFieldChange('subType', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                    </ion-col> -->
                    <ion-col size="12" size-md="6">
                      <bk-text-input [i18n]="loadI18n()" [value]="load()" (valueChange)="onFieldChange('load', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="loadErrors()" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <bk-number-input [i18n]="currentValueI18n()" [value]="currentValue()" (valueChange)="onFieldChange('currentValue', $event)" [maxLength]=10 [showHelper]=true [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="currentValueErrors()" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <bk-color [label]="colorLabel()" [hexColor]="hexColor()" (hexColorChange)="onFieldChange('color', $event)" [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="hexColorErrors()" />
                    </ion-col>
                  </ion-row>
                </ion-grid>
              </ion-card-content>
            </ion-card>
          }

          <!-- ***************************************** CAR ***************************************** -->
          @case('car') {
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ i18n().form_card_title() }}</ion-card-title>
              </ion-card-header>
              <ion-card-content class="ion-no-padding">
                <ion-grid>
                  @if(hasRole('admin')) {
                    <ion-row>
                      <ion-col size="12" size-md="6">
                        <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                      </ion-col>
                    </ion-row>
                  }
                  <ion-row>
                    <ion-col size="12">
                      <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]=30 [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="nameErrors()" />
                    </ion-col>
                    <ion-col size="12">
                      <bk-cat-select [category]="subTypes()!" [selectedItemName]="subType()" (selectedItemNameChange)="onFieldChange('subType', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <bk-text-input [i18n]="loadI18n()" [value]="load()" (valueChange)="onFieldChange('load', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="loadErrors()" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <bk-number-input [i18n]="currentValueI18n()" [value]="currentValue()" (valueChange)="onFieldChange('currentValue', $event)" [maxLength]=10 [showHelper]=true [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="currentValueErrors()" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <bk-color [label]="colorLabel()" [hexColor]="hexColor()" (hexColorChange)="onFieldChange('color', $event)" [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="hexColorErrors()" />
                    </ion-col>
                  </ion-row>
                </ion-grid>
              </ion-card-content>
            </ion-card>
          }

          <!-- ***************************************** LOCKER ***************************************** -->
          @case('locker') {
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ i18n().form_card_title() }}</ion-card-title>
              </ion-card-header>
              <ion-card-content class="ion-no-padding">
                <ion-grid>
                  @if(hasRole('admin')) {
                    <ion-row>
                      <ion-col size="12" size-md="6">
                        <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                      </ion-col>
                    </ion-row>
                  }
                  <ion-row>
                    <ion-col size="12" size-md="6">
                      <bk-number-input [i18n]="lockerNrI18n()" [value]="lockerNr()" (valueChange)="onFieldChange('lockerNr', $event)" [maxLength]=3 [showHelper]=true [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="lockerNrErrors()" />
                    </ion-col>

                    <ion-col size="12" size-md="6">
                      <bk-number-input [i18n]="keyNrNumI18n()" [value]="keyNr()" (valueChange)="onFieldChange('keyNr', $event)" [maxLength]=5 [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="keyNrErrors()" />
                    </ion-col>
                    <ion-col size="12">
                      <bk-cat-select [category]="subTypes()!" [selectedItemName]="subType()" (selectedItemNameChange)="onFieldChange('subType', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                    </ion-col>
                  </ion-row>
                </ion-grid>
              </ion-card-content>
            </ion-card>
          }

          <!-- ***************************************** KEY ***************************************** -->
          @case('key') {
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ i18n().form_card_title() }}</ion-card-title>
              </ion-card-header>
              <ion-card-content class="ion-no-padding">
                <ion-grid>
                  @if(hasRole('admin')) {
                    <ion-row>
                      <ion-col size="12" size-md="6">
                        <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                      </ion-col>
                    </ion-row>
                  }
                  <ion-row>
                    <ion-col size="12">
                      <bk-text-input [i18n]="keyNrTextI18n()" [value]="keyNr() + ''" (valueChange)="onFieldChange('keyNr', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="keyNrErrors()" />
                    </ion-col>
                  </ion-row>
                </ion-grid>
              </ion-card-content>
            </ion-card>
          }

          <!-- ***************************************** PET ***************************************** -->
          @case('pet') {
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ i18n().form_card_title() }}</ion-card-title>
              </ion-card-header>
              <ion-card-content class="ion-no-padding">
                <ion-grid>
                  @if(hasRole('admin')) {
                    <ion-row>
                      <ion-col size="12" size-md="6">
                        <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                      </ion-col>
                    </ion-row>
                  }
                  <ion-row>
                    <ion-col size="12">
                      <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]=30 [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="nameErrors()" />
                    </ion-col>
                  <ion-col size="12">
                      <bk-cat-select [category]="subTypes()!" [selectedItemName]="subType()" (selectedItemNameChange)="onFieldChange('subType', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <bk-color [label]="colorLabel()" [hexColor]="hexColor()" (hexColorChange)="onFieldChange('hexColor', $event)" [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="hexColorErrors()" />
                    </ion-col>
                  </ion-row>
                </ion-grid>
              </ion-card-content>
            </ion-card>
          }

          <!-- ***************************************** REAL ESTATE ***************************************** -->
          @case('realestate') {
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ i18n().form_card_title() }}</ion-card-title>
              </ion-card-header>
              <ion-card-content class="ion-no-padding">
                <ion-grid>
                  @if(hasRole('admin')) {
                    <ion-row>
                      <ion-col size="12" size-md="6">
                        <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                      </ion-col>
                    </ion-row>
                  }
                  <ion-row>
                    <ion-col size="12">
                      <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]=30 [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="nameErrors()" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <bk-number-input [i18n]="currentValueI18n()" [value]="currentValue()" (valueChange)="onFieldChange('currentValue', $event)" [maxLength]=10 [showHelper]=true [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="currentValueErrors()" />
                    </ion-col>
                  </ion-row>
                </ion-grid>
              </ion-card-content>
            </ion-card>
          }

          <!-- ***************************************** OTHER RESOURCE ***************************************** -->
          @default {
          <ion-card>
              <ion-card-header>
                <ion-card-title>{{ i18n().form_card_title() }}</ion-card-title>
              </ion-card-header>
              <ion-card-content class="ion-no-padding">
                <ion-grid>
                  @if(hasRole('admin')) {
                    <ion-row>
                      <ion-col size="12" size-md="6">
                        <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                      </ion-col>
                    </ion-row>
                  }
                  <ion-row >
                    <ion-col size="12">
                      <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]=30 [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="nameErrors()" />
                    </ion-col>

                    <ion-col size="12" size-md="6">
                      <bk-text-input [i18n]="loadI18n()" [value]="load()" (valueChange)="onFieldChange('load', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="loadErrors()" />
                    </ion-col>

                    <ion-col size="12" size-md="6">
                      <bk-number-input [i18n]="currentValueI18n()" [value]="currentValue()" (valueChange)="onFieldChange('currentValue', $event)" [maxLength]=10 [showHelper]=true [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="currentValueErrors()" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <bk-color [label]="colorLabel()" [hexColor]="hexColor()" (hexColorChange)="onFieldChange('hexColor', $event)" [readOnly]="isReadOnly()" />
                      <bk-error-note [errors]="hexColorErrors()" />
                    </ion-col>
                  </ion-row>
                </ion-grid>
              </ion-card-content>
            </ion-card>
          }
        }

        <bk-property-list [(properties)]="data" name="resourceData" />

        @if(hasRole('privileged') || hasRole('resourceAdmin')) {
          <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
        }

        @if(hasRole('admin')) {
          <bk-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)" [readOnly]="isReadOnly()" />
        }
    </form>
  }
  `
})
export class ResourceForm {
  // inputs
  public readonly i18n = input.required<ResourceFormI18n>();
  public formData = model.required<ResourceModel>();
  public currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly subTypes = input<CategoryListModel | undefined>();
  public readonly usages = input<CategoryListModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = resourceValidations;
  private readonly validationResult = computed(() => resourceValidations(this.formData(), this.tenantId(), this.allTags()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected loadErrors = computed(() => this.validationResult().getErrors('load'));
  protected currentValueErrors = computed(() => this.validationResult().getErrors('currentValue'));
  protected hexColorErrors = computed(() => this.validationResult().getErrors('hexColor'));
  protected boatNameErrors = computed(() => this.validationResult().getErrors('boatName'));
  protected keyNrErrors = computed(() => this.validationResult().getErrors('keyNr'));
  protected lockerNrErrors = computed(() => this.validationResult().getErrors('lockerNr'));
  protected errors = computed(() => this.validationResult().getErrors());

  // fields
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);
  protected resourceType = linkedSignal(() => this.formData().type ?? '');
  protected subType = linkedSignal(() => this.formData().subType ?? this.getDefaultType(this.formData().type ?? ''));
  protected usage = linkedSignal(() => this.formData().usage ?? DEFAULT_RBOAT_USAGE);
  protected load = linkedSignal(() => this.formData().load ?? '');
  protected currentValue = linkedSignal(() => this.formData().currentValue ?? DEFAULT_PRICE);
  protected hexColor = linkedSignal(() => this.formData().color ?? '');
  protected keyNr = linkedSignal(() => getKeyNr(this.formData()) ?? 0);
  protected lockerNr = linkedSignal(() => getLockerNr(this.formData()) ?? 0);
  protected data = linkedSignal(() => this.formData().data ?? []);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected description = linkedSignal(() => this.formData().description ?? DEFAULT_NOTES);
  protected bkey = computed(() => this.formData().bkey ?? DEFAULT_NAME);

  protected bkeyI18n = computed(() => ({
    name: 'bkey',
    label: this.i18n().bkey_label(),
    placeholder: this.i18n().bkey_placeholder(),
    helper: this.i18n().bkey_helper()
  } as TextInputI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected loadI18n = computed(() => ({
    name: 'load',
    label: this.i18n().load_label(),
    placeholder: this.i18n().load_placeholder(),
    helper: this.i18n().load_helper()
  } as TextInputI18n));

  protected keyNrTextI18n = computed(() => ({
    name: 'keyNr',
    label: this.i18n().keyNr_label(),
    placeholder: this.i18n().keyNr_placeholder(),
    helper: this.i18n().keyNr_helper()
  } as TextInputI18n));

  protected currentValueI18n = computed(() => ({
    name: 'currentValue',
    label: this.i18n().currentValue_label(),
    placeholder: this.i18n().currentValue_placeholder(),
    helper: this.i18n().currentValue_helper()
  } as NumberInputI18n));

  protected lockerNrI18n = computed(() => ({
    name: 'lockerNr',
    label: this.i18n().lockerNr_label(),
    placeholder: this.i18n().lockerNr_placeholder(),
    helper: this.i18n().lockerNr_helper()
  } as NumberInputI18n));

  protected keyNrNumI18n = computed(() => ({
    name: 'keyNr',
    label: this.i18n().keyNr_label(),
    placeholder: this.i18n().keyNr_placeholder(),
    helper: this.i18n().keyNr_helper()
  } as NumberInputI18n));

  protected descriptionI18n = computed(() => ({
    name: 'description', label: this.i18n().description_label(), placeholder: this.i18n().description_placeholder()
  } as NotesInputI18n));
  protected colorLabel = computed(() => this.i18n().color_label());

  /******************************* actions *************************************** */
  private getDefaultType(type: string): string {
    switch (type) {
      case 'rboat': return DEFAULT_RBOAT_TYPE;
      case 'car':  return DEFAULT_CAR_TYPE;
      case 'locker': return DEFAULT_GENDER;
      case 'pet': return DEFAULT_PET_TYPE;
      // tbd: define other defaults: boat, realestate, locker,
      default: return DEFAULT_NAME;
    }
  }

  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: ResourceModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('ResourceForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('ResourceForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
