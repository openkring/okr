import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { ChTimeMask } from '@bk2/shared-config';
import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORDER, DEFAULT_PRICE, DEFAULT_RES_REASON, DEFAULT_RES_STATE, DEFAULT_RESOURCE_TYPE, DEFAULT_TAGS, DEFAULT_TIME, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { FullNamePipe } from '@bk2/shared-pipes';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, die, hasRole } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { ReservationNewFormModel, reservationNewFormModelShape, reservationNewFormValidations } from '@bk2/relationship-reservation-util';

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
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">
  
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
              <bk-date-input name="startDate" [storeDate]="startDate()" [locale]="locale()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('startDate', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6"> 
              <bk-text-input name="startTime" [value]="startTime()" [maxLength]=5 [mask]="timeMask" [readOnly]="readOnly()" (changed)="onChange('startTime', $event)" />                                        
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-date-input name="endDate" [storeDate]="endDate()" [locale]="locale()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('endDate', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6"> 
              <bk-text-input name="endTime" [value]="endTime()" [maxLength]=5 [mask]="timeMask" [readOnly]="readOnly()" (changed)="onChange('endTime', $event)" />                                        
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
              <bk-cat-select [category]="reasons()!" [selectedItemName]="reservationReason()" [withAll]="false" (changed)="onChange('reservationReason', $event)" />
            </ion-col>

            <ion-col size="12" size-md="6">
              <bk-text-input name="numberOfParticipants" [value]="numberOfParticipants()" [maxLength]=6  [readOnly]="readOnly()" (changed)="onChange('numberOfParticipants', $event)" />                                        
            </ion-col>

            <ion-col size="12" size-md="6"> 
              <bk-text-input name="area" [value]="area()" [maxLength]=20 [readOnly]="readOnly()" (changed)="onChange('area', $event)" />                                        
            </ion-col>

            <ion-col size="12" size-md="6"> 
              <bk-text-input name="reservationRef" [value]="reservationRef()" [maxLength]=30 [readOnly]="readOnly()" (changed)="onChange('reservationRef', $event)" />                                        
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
              <bk-cat-select [category]="states()!" [selectedItemName]="reservationState()" [withAll]="false" (changed)="onChange('reservationState', $event)" />
            </ion-col>

            <ion-col size="12" size-md="6">
              <bk-number-input name="price" [value]="price()" [maxLength]=6 [readOnly]="readOnly()" (changed)="onChange('price', $event)" />                                        
            </ion-col>

            <ion-col size="12" size-md="6">
              <bk-text-input name="currency" [value]="currency()" [maxLength]=20 [readOnly]="readOnly()" (changed)="onChange('currency', $event)" />                                        
            </ion-col>

            <ion-col size="12" size-md="6"> 
              <bk-cat-select [category]="periodicities()!" [selectedItemName]="periodicity()" [withAll]="false" (changed)="onChange('periodicity', $event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />
    }
  
    @if(hasRole('admin')) {
      <bk-notes name="notes" [value]="notes()" (changed)="onChange('notes', $event)" />
    }
  </form>
  `
})
export class ReservationNewFormComponent {
  private readonly reservationSelectorsService = inject(ReservationSelectorsService);
  private readonly appStore = inject(AppStore);

  public vm = model.required<ReservationNewFormModel>();

  protected readonly currentUser = computed(() => this.appStore.currentUser());
  protected readonly reasons = computed(() => this.appStore.getCategory('reservation_reason'));
  protected readonly states = computed(() => this.appStore.getCategory('reservation_state'));
  protected readonly periodicities = computed(() => this.appStore.getCategory('periodicity'));
  protected readonly allTags = computed(() => this.appStore.getTags('reservation'));

  public readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));
  protected reserverKey = computed(() => this.vm().reserverKey ?? DEFAULT_KEY);
  protected reserverName = computed(() => this.vm().reserverName ?? DEFAULT_NAME);
  protected reserverName2 = computed(() => this.vm().reserverName2 ?? DEFAULT_NAME);
  protected reserverModelType = computed(() => this.vm().reserverModelType ?? 'person');
  protected reserverType = computed(() => this.vm().reserverType ?? DEFAULT_GENDER);
  protected resourceKey = computed(() => this.vm().resourceKey ?? DEFAULT_KEY);
  protected resourceName = computed(() => this.vm().resourceName ?? DEFAULT_NAME);
  protected resourceType = computed(() => this.vm().resourceType ?? DEFAULT_RESOURCE_TYPE);
  protected startDate = computed(() => this.vm().startDate ?? DEFAULT_DATE);
  protected startTime = computed(() => this.vm().startTime ?? DEFAULT_TIME);
  protected endDate = computed(() => this.vm().endDate ?? DEFAULT_DATE);
  protected endTime = computed(() => this.vm().endTime ?? DEFAULT_TIME);
  protected numberOfParticipants = computed(() => this.vm().numberOfParticipants ?? '');
  protected area = computed(() => this.vm().area ?? '');
  protected reservationRef = computed(() => this.vm().reservationRef ?? '');
  protected reservationState = computed(() => this.vm().reservationState ?? DEFAULT_RES_STATE);
  protected reservationReason = computed(() => this.vm().reservationReason ?? DEFAULT_RES_REASON);
  protected order = computed(() => this.vm().order ?? DEFAULT_ORDER);
  protected price = computed(() => this.vm().price ?? DEFAULT_PRICE);
  protected currency = computed(() => this.vm().currency ?? DEFAULT_CURRENCY);
  protected periodicity = computed(() => this.vm().periodicity ?? 'yearly');
  protected tags = computed(() => this.vm().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.vm().notes ?? DEFAULT_NOTES);
  protected name = computed(() => this.vm().name ?? DEFAULT_NAME);
  protected locale = computed(() => this.appStore.appConfig().locale);

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  protected readonly suite = reservationNewFormValidations;
  protected readonly shape = reservationNewFormModelShape;
  private readonly validationResult = computed(() => reservationNewFormValidations(this.vm()));

  protected timeMask = ChTimeMask;
  protected endFutureDate = END_FUTURE_DATE_STR;

  protected onValueChange(value: ReservationNewFormModel): void {
    this.vm.update((_vm) => ({ ..._vm, ...value }));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('ReservationNewForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectReserver(): Promise<void> {
    if (this.reserverModelType() === 'person') {
      const _person = await this.reservationSelectorsService.selectPerson();
      if (_person) {
        this.vm.update((_vm) => ({
          ..._vm,
          reserverKey: _person.bkey,
          reserverName: _person.firstName,
          reserverName2: _person.lastName,
          reserverModelType: 'person',
          reserverType: _person.gender,
        }));
        debugFormErrors('ReservationNewForm (Person)', this.validationResult().errors, this.currentUser());
        this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
        this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
      }
    } else {
      die('ReservationNewFormComponent: selectReserver: only persons are supported as reservers.');
    }
  }

  protected async selectResource(): Promise<void> {
    const _resource = await this.reservationSelectorsService.selectResource();
    if (_resource) {
      this.vm.update((_vm) => ({
        ..._vm,
        resourceKey: _resource.bkey,
        resourceName: _resource.name,
        resourceModelType: 'resource',
        resourceType: _resource.type,
        resourceSubType: _resource.subType,
      }));
      debugFormErrors('ReservationNewForm (Resource)', this.validationResult().errors, this.currentUser());
      this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
      this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
    }
  }
}
