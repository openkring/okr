import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';
import { AsyncPipe } from '@angular/common';

import { ChTimeMask } from '@bk2/shared-config';
import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_RES_REASON, DEFAULT_RES_STATE, DEFAULT_TIME, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { CategoryListModel, ReservationModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { TranslatePipe } from '@bk2/shared-i18n';
import { FullNamePipe } from '@bk2/shared-pipes';

import { reservationValidations } from '@bk2/relationship-reservation-util';
import { AvatarPipe } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-reservation-form',
  standalone: true,
  imports: [
    vestForms,
    AsyncPipe, TranslatePipe, AvatarPipe, FullNamePipe,
    TextInputComponent, DateInputComponent,
    NumberInputComponent, ChipsComponent, NotesInputComponent, CategorySelectComponent,
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
              <ion-row>
                <ion-col size="9">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ reserverAvatar() | avatar | async }}" alt="Avatar of Reserver" />
                    </ion-avatar>
                    <ion-label>{{ reserverName() | fullName:reserverName2() }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="3">
                  <ion-item lines="none">
                    <ion-button slot="start" fill="clear" (click)="selectReserver.emit(true)">{{ '@general.operation.select.label' | translate | async }}</ion-button>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label>{{ '@reservation.newDesc' | translate | async }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="9">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ resourceAvatar() | avatar | async }}" alt="Avatar Logo of Resource" />
                    </ion-avatar>
                    <ion-label>{{ resourceName() }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="3">
                  <ion-item lines="none">
                  <ion-button slot="start" fill="clear" (click)="selectResource.emit(true)">{{ '@general.operation.select.label' | translate | async }}</ion-button>
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
                <bk-date-input name="startDate" [storeDate]="startDate()" (storeDateChange)="onFieldChange('startDate', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6"> 
                <bk-text-input name="startTime" [value]="startTime()" (valueChange)="onFieldChange('startTime', $event)" [maxLength]=5 [mask]="timeMask" [readOnly]="isReadOnly()" />                                        
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-date-input name="endDate" [storeDate]="endDate()" (storeDateChange)="onFieldChange('endDate', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6"> 
                <bk-text-input name="endTime" [value]="endTime()" (valueChange)="onFieldChange('endTime', $event)" [maxLength]=5 [mask]="timeMask" [readOnly]="isReadOnly()" />                                        
              </ion-col>
            </ion-row>
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
              <ion-col size="12" size-md="6"> 
                <bk-cat-select [category]="reasons()" [selectedItemName]="reason()" (selectedItemNameChange)="onFieldChange('reason', $event)" [withAll]=false [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input name="numberOfParticipants" [value]="numberOfParticipants()" (valueChange)="onFieldChange('numberOfParticipants', $event)" [maxLength]=6  [readOnly]="isReadOnly()" />                                        
              </ion-col>

              <ion-col size="12" size-md="6"> 
                <bk-text-input name="area" [value]="area()" (valueChange)="onFieldChange('area', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />                                        
              </ion-col>

              <ion-col size="12" size-md="6"> 
                <bk-text-input name="reservationRef" [value]="reservationRef()" (valueChange)="onFieldChange('reservationRef', $event)" [maxLength]=30 [readOnly]="isReadOnly()" />                                        
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
              <ion-col size="12" size-md="6"> 
                <bk-cat-select [category]="states()" [selectedItemName]="reservationState()" (selectedItemNameChange)="onFieldChange('reservationState', $event)" [withAll]=false [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-number-input name="price" [value]="price()" (valueChange)="onFieldChange('price', $event)" [maxLength]=6 [readOnly]="isReadOnly()" />                                        
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input name="currency" [value]="currency()" (valueChange)="onFieldChange('currency', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />                                        
              </ion-col>

              <ion-col size="12" size-md="6"> 
                <bk-cat-select [category]="periodicities()" [selectedItemName]="periodicity()" (selectedItemNameChange)="onFieldChange('periodicity', $event)" [withAll]=false [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged') || hasRole('eventAdmin')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }
    
      @if(hasRole('admin')) {
        <bk-notes name="notes" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
  `
})
export class ReservationFormComponent {
  // inputs
  public formData = model.required<ReservationModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly reasons = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly periodicities = input.required<CategoryListModel>();
  public readonly isSelectable = input(false);
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public selectReserver = output<boolean>();
  public selectResource = output<boolean>();

  // validation and errors
  protected readonly suite = reservationValidations;
  private readonly validationResult = computed(() => reservationValidations(this.formData()));

  // fields
  protected reserverName = linkedSignal(() => this.formData().reserverName ?? DEFAULT_NAME); 
  protected reserverName2 = linkedSignal(() => this.formData().reserverName2 ?? DEFAULT_NAME); 
  protected reserverModelType = linkedSignal(() => this.formData().reserverModelType ?? 'person');
  protected reserverType = linkedSignal(() => this.formData().reserverType ?? DEFAULT_GENDER);
  protected reserverAvatar = computed(() => this.formData().reserverModelType + '.' + this.formData().reserverKey);
  protected resourceKey = linkedSignal(() => this.formData().resourceKey ?? DEFAULT_KEY);
  protected resourceName = linkedSignal(() => this.formData().resourceName ?? DEFAULT_NAME);
  protected resourceAvatar = computed(() => 'resource.' + this.formData().resourceType + ':' + this.formData().resourceKey);
  protected startDate = linkedSignal(() => this.formData().startDate ?? DEFAULT_DATE);
  protected startTime = linkedSignal(() => this.formData().startTime ?? DEFAULT_TIME);
  protected endDate = linkedSignal(() => this.formData().endDate ?? DEFAULT_DATE);
  protected endTime = linkedSignal(() => this.formData().endTime ?? DEFAULT_TIME);
  protected numberOfParticipants = linkedSignal(() => this.formData().numberOfParticipants ?? '');
  protected area = linkedSignal(() => this.formData().area ?? '');
  protected reservationRef = linkedSignal(() => this.formData().reservationRef ?? '');
  protected reservationState = linkedSignal(() => this.formData().reservationState ?? DEFAULT_RES_STATE);
  protected reason = linkedSignal(() => this.formData().reservationReason ?? DEFAULT_RES_REASON);
  protected order = linkedSignal(() => this.formData().order ?? 0);
  protected price = linkedSignal(() => this.formData().price ?? 0);
  protected currency = linkedSignal(() => this.formData().currency ?? 'CHF');
  protected periodicity = linkedSignal(() => this.formData().periodicity ?? 'yearly');
  protected tags = linkedSignal(() => this.formData().tags ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? '');
  protected name = linkedSignal(() => this.formData().name ?? '');

  // passing constants to template
  protected timeMask = ChTimeMask;
  protected endFutureDate = END_FUTURE_DATE_STR;

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

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
