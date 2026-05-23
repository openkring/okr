import { Component, Signal, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_KEY, DEFAULT_RES_REASON, DEFAULT_RES_STATE, DEFAULT_TIME } from '@bk2/shared-constants';
import { CategoryListModel, ReservationModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelect, Checkbox, CheckboxI18n, Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, TextInput, TextInputI18n, TimeInput, TimeInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, getAvatarName, hasRole } from '@bk2/shared-util-core';

import { reservationValidations } from '@bk2/relationship-reservation-util';
import { AvatarPipe } from '@bk2/avatar-ui';

export interface ReservationFormI18n {
  selectLabel: Signal<string>;
  newDesc: Signal<string>;
  bkey_label: Signal<string>;
  bkey_placeholder: Signal<string>;
  bkey_helper: Signal<string>;
  name_label: Signal<string>;
  name_placeholder: Signal<string>;
  name_helper: Signal<string>;
  participants_label: Signal<string>;
  participants_placeholder: Signal<string>;
  participants_helper: Signal<string>;
  area_label: Signal<string>;
  area_placeholder: Signal<string>;
  area_helper: Signal<string>;
  resref_label: Signal<string>;
  resref_placeholder: Signal<string>;
  resref_helper: Signal<string>;
  currency_label: Signal<string>;
  currency_placeholder: Signal<string>;
  currency_helper: Signal<string>;
  durationMinutes_label: Signal<string>;
  durationMinutes_placeholder: Signal<string>;
  durationMinutes_helper: Signal<string>;
  price_label: Signal<string>;
  price_placeholder: Signal<string>;
  price_helper: Signal<string>;
  description_label: Signal<string>;
  description_placeholder: Signal<string>;
  notes_label: Signal<string>;
  notes_placeholder: Signal<string>;
  startDate_label: Signal<string>;
  startDate_placeholder: Signal<string>;
  startDate_helper: Signal<string>;
  endDate_label: Signal<string>;
  endDate_placeholder: Signal<string>;
  endDate_helper: Signal<string>;
  startTime_label: Signal<string>;
  startTime_placeholder: Signal<string>;
  fullDay_label: Signal<string>;
  fullDay_helper: Signal<string>;
}

@Component({
  selector: 'bk-reservation-form',
  standalone: true,
  imports: [
    vestForms,
    AvatarPipe,
    TextInput, NumberInput, Chips, NotesInput, CategorySelect, DateInput, Checkbox, TimeInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonAvatar, IonImg, IonLabel, IonButton
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

      @if(isSelectable()) {
        <ion-card>
          <ion-card-content>
            <ion-grid>
              @if(hasRole('admin')) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="9">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ reserverAvatarKey() | avatar }}" alt="Avatar of Reserver" />
                    </ion-avatar>
                    <ion-label>{{ reserverName() }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="3">
                  <ion-item lines="none">
                    <ion-button slot="start" fill="clear" (click)="selectReserver.emit(true)">{{ i18n().selectLabel() }}</ion-button>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().newDesc() }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="9">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ resourceAvatarKey() | avatar }}" alt="Avatar Logo of Resource" />
                    </ion-avatar>
                    <ion-label>{{ resourceName() }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="3">
                  <ion-item lines="none">
                  <ion-button slot="start" fill="clear" (click)="selectResource.emit(true)">{{ i18n().selectLabel() }}</ion-button>
                  </ion-item>
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      }

      <ion-card>
        <ion-card-header>
          <ion-card-title>Zeitliche Angaben</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="fullDayI18n()" [checked]="fullDay()" (checkedChange)="onFullDayChange($event)" [showHelper]="true" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            @if(!fullDay()) {
              <ion-row>
                <ion-col size="12" size-md="6" size-lg="4">
                  <bk-date-input [i18n]="startDateI18n()" [storeDate]="startDate()" (storeDateChange)="onFieldChange('startDate', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6" size-lg="4">
                  <bk-time-input [i18n]="startTimeI18n()" [value]="startTime()" (valueChange)="onFieldChange('startTime', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6" size-lg="4">
                  <bk-number-input [i18n]="durationMinutesI18n()" [value]="durationMinutes()" (valueChange)="onFieldChange('durationMinutes', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            } @else {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-date-input [i18n]="startDateI18n()" [storeDate]="startDate()" (storeDateChange)="onFieldChange('startDate', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-date-input [i18n]="endDateI18n()" [storeDate]="endDate()" (storeDateChange)="onFieldChange('endDate', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Angaben zum Anlass</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [autofocus]="true" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="reasons()" [selectedItemName]="reason()" (selectedItemNameChange)="onFieldChange('reason', $event)" [withAll]=false [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="participantsI18n()" [value]="participants()" (valueChange)="onFieldChange('participants', $event)" [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="areaI18n()" [value]="area()" (valueChange)="onFieldChange('area', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="resrefI18n()" [value]="ref()" (valueChange)="onFieldChange('ref', $event)" [maxLength]=30 [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Reservations-Prozess und Gebühren</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <bk-cat-select [category]="states()" [selectedItemName]="state()" (selectedItemNameChange)="onFieldChange('state', $event)" [withAll]=false [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-number-input [i18n]="priceI18n()" [value]="amount()" (valueChange)="onFieldChange('amount', $event)" [maxLength]=6 [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="currencyI18n()" [value]="currency()" (valueChange)="onFieldChange('currency', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />
              </ion-col>

            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)" [readOnly]="isReadOnly()" />

      @if(hasRole('privileged') || hasRole('eventAdmin')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('admin')) {
        <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
  `
})
export class ReservationForm {
  // inputs
  public readonly i18n = input.required<ReservationFormI18n>();
  public formData = model.required<ReservationModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly reasons = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly periodicities = input.required<CategoryListModel>();
  public readonly locale = input.required<string>();
  public readonly isSelectable = input(false);
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public selectReserver = output<boolean>();
  public selectResource = output<boolean>();

  // computed i18n field objects
  protected bkeyI18n = computed(() => ({ name: 'bkey', label: this.i18n().bkey_label(), placeholder: this.i18n().bkey_placeholder(), helper: this.i18n().bkey_helper() } as TextInputI18n));
  protected nameI18n = computed(() => ({ name: 'name', label: this.i18n().name_label(), placeholder: this.i18n().name_placeholder(), helper: this.i18n().name_helper() } as TextInputI18n));
  protected participantsI18n = computed(() => ({ name: 'participants', label: this.i18n().participants_label(), placeholder: this.i18n().participants_placeholder(), helper: this.i18n().participants_helper() } as TextInputI18n));
  protected areaI18n = computed(() => ({ name: 'area', label: this.i18n().area_label(), placeholder: this.i18n().area_placeholder(), helper: this.i18n().area_helper() } as TextInputI18n));
  protected resrefI18n = computed(() => ({ name: 'resref', label: this.i18n().resref_label(), placeholder: this.i18n().resref_placeholder(), helper: this.i18n().resref_helper() } as TextInputI18n));
  protected currencyI18n = computed(() => ({ name: 'currency', label: this.i18n().currency_label(), placeholder: this.i18n().currency_placeholder(), helper: this.i18n().currency_helper() } as TextInputI18n));
  protected durationMinutesI18n = computed(() => ({ name: 'durationMinutes', label: this.i18n().durationMinutes_label(), placeholder: this.i18n().durationMinutes_placeholder(), helper: this.i18n().durationMinutes_helper() } as NumberInputI18n));
  protected priceI18n = computed(() => ({ name: 'price', label: this.i18n().price_label(), placeholder: this.i18n().price_placeholder(), helper: this.i18n().price_helper() } as NumberInputI18n));
  protected descriptionI18n = computed(() => ({ name: 'description', label: this.i18n().description_label(), placeholder: this.i18n().description_placeholder() } as NotesInputI18n));
  protected notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));
  protected startDateI18n = computed(() => ({ name: 'startDate', label: this.i18n().startDate_label(), placeholder: this.i18n().startDate_placeholder(), helper: this.i18n().startDate_helper() } as DateInputI18n));
  protected endDateI18n = computed(() => ({ name: 'endDate', label: this.i18n().endDate_label(), placeholder: this.i18n().endDate_placeholder(), helper: this.i18n().endDate_helper() } as DateInputI18n));
  protected startTimeI18n = computed(() => ({ name: 'startTime', label: this.i18n().startTime_label(), placeholder: this.i18n().startTime_placeholder() } as TimeInputI18n));
  protected fullDayI18n   = computed(() => ({ name: 'fullDay', label: this.i18n().fullDay_label(), helper: this.i18n().fullDay_helper() } as CheckboxI18n));

  // validation and errors
  protected readonly suite = reservationValidations;
  private readonly validationResult = computed(() => reservationValidations(this.formData(), this.tenantId(), this.allTags()));

  // fields
  protected reserverAvatar = linkedSignal(() => this.formData().reserver);
  protected reserverName = computed(() => getAvatarName(this.reserverAvatar(), this.currentUser()?.nameDisplay));
  protected reserverModelType = computed(() => this.reserverAvatar()?.modelType as string ?? 'person');
  protected reserverKey = computed(() => this.reserverAvatar()?.key ?? DEFAULT_KEY);
  protected reserverAvatarKey = computed(() => `${this.reserverModelType()}.${this.reserverKey()}`);

  protected resourceAvatar = linkedSignal(() => this.formData().resource);
  protected resourceName = computed(() => getAvatarName(this.resourceAvatar()));
  protected resourceType = computed(() => this.resourceAvatar()?.type ?? '');
  protected resourceKey = computed(() => this.resourceAvatar()?.key ?? DEFAULT_KEY);
  protected resourceAvatarKey = computed(() => `resource.${this.resourceType()}:${this.resourceKey()}`);

  protected startDate = linkedSignal(() => this.formData().startDate ?? DEFAULT_DATE);
  protected startTime = linkedSignal(() => this.formData().startTime ?? DEFAULT_TIME);
  protected durationMinutes = linkedSignal(() => this.formData().durationMinutes ?? 60);
  protected endDate = linkedSignal(() => this.formData().endDate ?? this.startDate());
  protected fullDay = linkedSignal(() => this.formData().fullDay ?? false);

  protected participants = linkedSignal(() => this.formData().participants ?? '');
  protected area = linkedSignal(() => this.formData().area ?? '');
  protected ref = linkedSignal(() => this.formData().ref ?? '');
  protected state = linkedSignal(() => this.formData().state ?? DEFAULT_RES_STATE);
  protected reason = linkedSignal(() => this.formData().reason ?? DEFAULT_RES_REASON);
  protected order = linkedSignal(() => this.formData().order ?? 0);
  protected price = linkedSignal(() => this.formData().price);
  protected amount = linkedSignal(() => this.price()?.amount ?? 0);
  protected currency = linkedSignal(() => this.price()?.currency ?? DEFAULT_CURRENCY);
  protected tags = linkedSignal(() => this.formData().tags ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? '');
  protected name = linkedSignal(() => this.formData().name ?? '');
  protected description = linkedSignal(() => this.formData().description ?? '');
  protected bkey = computed(() => this.formData().bkey ?? '');

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: ReservationModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('ReservationForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('ReservationForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFullDayChange(isFullDay: boolean): void {
    if (isFullDay) {
      this.formData.update(vm => ({
        ...vm,
        fullDay: true,
        durationMinutes: 1440,
        startTime: ''
      }));
    } else {
      this.formData.update(vm => ({
        ...vm,
        fullDay: false,
        endDate: vm.startDate
      }));
    }
    this.dirty.emit(true);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
