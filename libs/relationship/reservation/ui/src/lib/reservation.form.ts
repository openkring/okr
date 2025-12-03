import { Component, computed, effect, input, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { RESERVATION_FORM_SHAPE, ReservationFormModel, reservationFormValidations } from '@bk2/relationship-reservation-util';
import { ChTimeMask } from '@bk2/shared-config';
import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_RES_REASON, DEFAULT_RES_STATE, DEFAULT_TIME, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-reservation-form',
  standalone: true,
  imports: [
    vestForms,
    TextInputComponent, DateInputComponent,
    NumberInputComponent, ChipsComponent, NotesInputComponent, CategorySelectComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">
  
    <ion-card>
      <ion-card-header>
        <ion-card-title>Zeitliche Angaben</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-date-input name="startDate" [storeDate]="startDate()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('startDate', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6"> 
              <bk-text-input name="startTime" [value]="startTime()" [maxLength]=5 [mask]="timeMask" [readOnly]="isReadOnly()" (changed)="onFieldChange('startTime', $event)" />                                        
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-date-input name="endDate" [storeDate]="endDate()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('endDate', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6"> 
              <bk-text-input name="endTime" [value]="endTime()" [maxLength]=5 [mask]="timeMask" [readOnly]="isReadOnly()" (changed)="onFieldChange('endTime', $event)" />                                        
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-header>
        <ion-card-title>Angaben zum Anlass</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6"> 
              <bk-cat-select [category]="reasons()" [selectedItemName]="reason()" [withAll]=false [readOnly]="isReadOnly()" (changed)="onFieldChange('reservationReason', $event)" />
            </ion-col>

            <ion-col size="12" size-md="6">
              <bk-text-input name="numberOfParticipants" [value]="numberOfParticipants()" [maxLength]=6  [readOnly]="isReadOnly()" (changed)="onFieldChange('numberOfParticipants', $event)" />                                        
            </ion-col>

            <ion-col size="12" size-md="6"> 
              <bk-text-input name="area" [value]="area()" [maxLength]=20 [readOnly]="isReadOnly()" (changed)="onFieldChange('area', $event)" />                                        
            </ion-col>

            <ion-col size="12" size-md="6"> 
              <bk-text-input name="reservationRef" [value]="reservationRef()" [maxLength]=30 [readOnly]="isReadOnly()" (changed)="onFieldChange('reservationRef', $event)" />                                        
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-header>
        <ion-card-title>Reservations-Prozess und Gebühren</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6"> 
              <bk-cat-select [category]="states()" [selectedItemName]="reservationState()" [withAll]=false [readOnly]="isReadOnly()" (changed)="onFieldChange('reservationState', $event)" />
            </ion-col>

            <ion-col size="12" size-md="6">
              <bk-number-input name="price" [value]="price()" [maxLength]=6 [readOnly]="isReadOnly()" (changed)="onFieldChange('price', $event)" />                                        
            </ion-col>

            <ion-col size="12" size-md="6">
              <bk-text-input name="currency" [value]="currency()" [maxLength]=20 [readOnly]="isReadOnly()" (changed)="onFieldChange('currency', $event)" />                                        
            </ion-col>

            <ion-col size="12" size-md="6"> 
              <bk-cat-select [category]="periodicities()" [selectedItemName]="periodicity()" [withAll]=false [readOnly]="isReadOnly()" (changed)="onFieldChange('periodicity', $event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />
    }
  
    @if(hasRole('admin')) {
      <bk-notes name="notes" [value]="notes()" [readOnly]="isReadOnly()" (changed)="onFieldChange('notes', $event)" />
    }
  </form>
  `
})
export class ReservationFormComponent {
  // inputs
  public formData = model.required<ReservationFormModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly allTags = input.required<string>();
  public readonly reasons = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly periodicities = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = reservationFormValidations;
  protected readonly shape = RESERVATION_FORM_SHAPE;
  private readonly validationResult = computed(() => reservationFormValidations(this.formData()));

  // fields
  protected reserverName = computed(() => this.formData().reserverName ?? DEFAULT_NAME); 
  protected reserverName2 = computed(() => this.formData().reserverName2 ?? DEFAULT_NAME); 
  protected reserverModelType = computed(() => this.formData().reserverModelType ?? 'person');
  protected reserverType = computed(() => this.formData().reserverType ?? DEFAULT_GENDER);
  protected resourceKey = computed(() => this.formData().resourceKey ?? DEFAULT_KEY);
  protected resourceName = computed(() => this.formData().resourceName ?? DEFAULT_NAME);
  protected startDate = computed(() => this.formData().startDate ?? DEFAULT_DATE);
  protected startTime = computed(() => this.formData().startTime ?? DEFAULT_TIME);
  protected endDate = computed(() => this.formData().endDate ?? DEFAULT_DATE);
  protected endTime = computed(() => this.formData().endTime ?? DEFAULT_TIME);
  protected numberOfParticipants = computed(() => this.formData().numberOfParticipants ?? '');
  protected area = computed(() => this.formData().area ?? '');
  protected reservationRef = computed(() => this.formData().reservationRef ?? '');
  protected reservationState = computed(() => this.formData().reservationState ?? DEFAULT_RES_STATE);
  protected reason = computed(() => this.formData().reservationReason ?? DEFAULT_RES_REASON);
  protected order = computed(() => this.formData().order ?? 0);
  protected price = computed(() => this.formData().price ?? 0);
  protected currency = computed(() => this.formData().currency ?? 'CHF');
  protected periodicity = computed(() => this.formData().periodicity ?? 'yearly');
  protected tags = computed(() => this.formData().tags ?? '');
  protected notes = computed(() => this.formData().notes ?? '');
  protected name = computed(() => this.formData().name ?? '');

  // passing constants to template
  protected timeMask = ChTimeMask;
  protected endFutureDate = END_FUTURE_DATE_STR;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }
  
  protected onFormChange(value: ReservationFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('ReservationForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('ReservationForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
