import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { ChTimeMask } from '@bk2/shared-config';
import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORDER, DEFAULT_PRICE, DEFAULT_RES_REASON, DEFAULT_RES_STATE, DEFAULT_RESOURCE_TYPE, DEFAULT_TAGS, DEFAULT_TIME, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName } from '@bk2/shared-models';
import { FullNamePipe } from '@bk2/shared-pipes';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, die, hasRole } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { RESERVATION_NEW_FORM_SHAPE, ReservationNewFormModel, reservationNewFormValidations } from '@bk2/relationship-reservation-util';

import { ReservationSelectorsService } from './reservation-selectors.service';

@Component({
  selector: 'bk-reservation-new-form',
  standalone: true,
  imports: [
    vestForms,
    AvatarPipe, AsyncPipe, TranslatePipe,
    TextInputComponent, DateInputComponent, FullNamePipe,
    NumberInputComponent, ChipsComponent, NotesInputComponent, CategorySelectComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonButton, IonImg, IonAvatar, IonLabel
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
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="9">
              <ion-item lines="none">
                <ion-avatar slot="start">
                  <ion-img src="{{ reserverModelType() + '.' + reserverKey() | avatar | async }}" alt="Avatar of Reserver" />
                </ion-avatar>
                <ion-label>{{ reserverName() | fullName:reserverName2() }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3">
              <ion-item lines="none">
                <ion-button slot="start" fill="clear" (click)="selectReserver()">{{ '@general.operation.select.label' | translate | async }}</ion-button>
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
                  <ion-img src="{{ 'resource.' + resourceType() + ':' + resourceKey() | avatar | async }}" alt="Avatar Logo of Resource" />
                </ion-avatar>
                <ion-label>{{ resourceName() }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3">
              <ion-item lines="none">
              <ion-button slot="start" fill="clear" (click)="selectResource()">{{ '@general.operation.select.label' | translate | async }}</ion-button>
              </ion-item>
            </ion-col>
          </ion-row>        
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-header>
        <ion-card-title>Zeitliche Angaben</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-date-input name="startDate" [storeDate]="startDate()" [locale]="locale()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('startDate', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6"> 
              <bk-text-input name="startTime" [value]="startTime()" [maxLength]=5 [mask]="timeMask" [readOnly]="isReadOnly()" (changed)="onFieldChange('startTime', $event)" />                                        
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-date-input name="endDate" [storeDate]="endDate()" [locale]="locale()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('endDate', $event)" />
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
              <bk-cat-select [category]="reasons()!" [selectedItemName]="reservationReason()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('reservationReason', $event)" />
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
              <bk-cat-select [category]="states()!" [selectedItemName]="reservationState()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('reservationState', $event)" />
            </ion-col>

            <ion-col size="12" size-md="6">
              <bk-number-input name="price" [value]="price()" [maxLength]=6 [readOnly]="isReadOnly()" (changed)="onFieldChange('price', $event)" />                                        
            </ion-col>

            <ion-col size="12" size-md="6">
              <bk-text-input name="currency" [value]="currency()" [maxLength]=20 [readOnly]="isReadOnly()" (changed)="onFieldChange('currency', $event)" />                                        
            </ion-col>

            <ion-col size="12" size-md="6"> 
              <bk-cat-select [category]="periodicities()!" [selectedItemName]="periodicity()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('periodicity', $event)" />
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
export class ReservationNewFormComponent {
  private readonly reservationSelectorsService = inject(ReservationSelectorsService);
  private readonly appStore = inject(AppStore);

  // inputs
  public formData = model.required<ReservationNewFormModel>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = reservationNewFormValidations;
  protected readonly shape = RESERVATION_NEW_FORM_SHAPE;
  private readonly validationResult = computed(() => reservationNewFormValidations(this.formData()));

  // fields
  protected readonly currentUser = computed(() => this.appStore.currentUser());
  protected readonly reasons = computed(() => this.appStore.getCategory('reservation_reason'));
  protected readonly states = computed(() => this.appStore.getCategory('reservation_state'));
  protected readonly periodicities = computed(() => this.appStore.getCategory('periodicity'));
  protected readonly allTags = computed(() => this.appStore.getTags('reservation'));

  protected reserverKey = computed(() => this.formData().reserverKey ?? DEFAULT_KEY);
  protected reserverName = computed(() => this.formData().reserverName ?? DEFAULT_NAME);
  protected reserverName2 = computed(() => this.formData().reserverName2 ?? DEFAULT_NAME);
  protected reserverModelType = computed(() => this.formData().reserverModelType ?? 'person');
  protected reserverType = computed(() => this.formData().reserverType ?? DEFAULT_GENDER);

  protected resourceKey = computed(() => this.formData().resourceKey ?? DEFAULT_KEY);
  protected resourceName = computed(() => this.formData().resourceName ?? DEFAULT_NAME);
  protected resourceType = computed(() => this.formData().resourceType ?? DEFAULT_RESOURCE_TYPE);

  protected startDate = computed(() => this.formData().startDate ?? DEFAULT_DATE);
  protected startTime = computed(() => this.formData().startTime ?? DEFAULT_TIME);
  protected endDate = computed(() => this.formData().endDate ?? DEFAULT_DATE);
  protected endTime = computed(() => this.formData().endTime ?? DEFAULT_TIME);
  protected numberOfParticipants = computed(() => this.formData().numberOfParticipants ?? '');
  protected area = computed(() => this.formData().area ?? '');
  protected reservationRef = computed(() => this.formData().reservationRef ?? '');
  protected reservationState = computed(() => this.formData().reservationState ?? DEFAULT_RES_STATE);
  protected reservationReason = computed(() => this.formData().reservationReason ?? DEFAULT_RES_REASON);
  protected order = computed(() => this.formData().order ?? DEFAULT_ORDER);
  protected price = computed(() => this.formData().price ?? DEFAULT_PRICE);
  protected currency = computed(() => this.formData().currency ?? DEFAULT_CURRENCY);
  protected periodicity = computed(() => this.formData().periodicity ?? 'yearly');
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.formData().notes ?? DEFAULT_NOTES);
  protected name = computed(() => this.formData().name ?? DEFAULT_NAME);
  protected locale = computed(() => this.appStore.appConfig().locale);

  // passing constants to template
  protected timeMask = ChTimeMask;
  protected endFutureDate = END_FUTURE_DATE_STR;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: ReservationNewFormModel): void {
    this.formData.update((vm) => ({ ...vm, ...value }));
    debugFormErrors('ReservationNewForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('ReservationNewForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectReserver(): Promise<void> {
    if (this.reserverModelType() === 'person') {
      const person = await this.reservationSelectorsService.selectPerson();
      if (person) {
        this.formData.update((vm) => ({
          ...vm,
          reserverKey: person.bkey,
          reserverName: person.firstName,
          reserverName2: person.lastName,
          reserverModelType: 'person',
          reserverType: person.gender,
        }));
        debugFormErrors('ReservationNewForm.selectReserver', this.validationResult().errors, this.currentUser());
      }
    } else {
      die('ReservationNewFormComponent: selectReserver: only persons are supported as reservers.');
    }
  }

  protected async selectResource(): Promise<void> {
    const resource = await this.reservationSelectorsService.selectResource();
    if (resource) {
      this.formData.update((vm) => ({
        ...vm,
        resourceKey: resource.bkey,
        resourceName: resource.name,
        resourceModelType: 'resource',
        resourceType: resource.type,
        resourceSubType: resource.subType,
      }));
      debugFormErrors('ReservationNewForm.selectResource', this.validationResult().errors, this.currentUser());
    }
  }
}
