import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';
import { AsyncPipe } from '@angular/common';

import { CategoryComponent, ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared/ui';
import { GenderType, ModelType, OrgType, Periodicity, ReservationReason, ReservationState, ResourceType, UserModel } from '@bk2/shared/models';
import { ChTimeMask, END_FUTURE_DATE_STR, RoleName } from '@bk2/shared/config';
import { debugFormErrors, die, hasRole } from '@bk2/shared/util';
import { PeriodicityTypes, ReservationReasons, ReservationStates } from '@bk2/shared/categories';
import { AvatarPipe, FullNamePipe } from '@bk2/shared/pipes';
import { TranslatePipe } from '@bk2/shared/i18n';

import { ReservationNewFormModel, reservationNewFormModelShape, reservationNewFormValidations } from '@bk2/reservation/util';
import { ReservationSelectorsService } from './reservation-selectors.service';

@Component({
  selector: 'bk-reservation-new-form',
  imports: [
    vestForms,
    AvatarPipe, AsyncPipe, TranslatePipe,
    TextInputComponent, DateInputComponent, FullNamePipe,
    NumberInputComponent, ChipsComponent, NotesInputComponent, CategoryComponent,
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
                  <ion-img src="{{ modelType.Resource + '.' + resourceType() + ':' + resourceKey() | avatar | async }}" alt="Avatar Logo of Resource" />
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
              <bk-date-input name="startDate" [storeDate]="startDate()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('startDate', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6"> 
              <bk-text-input name="startTime" [value]="startTime()" [maxLength]=5 [mask]="timeMask" [readOnly]="readOnly()" (changed)="onChange('startTime', $event)" />                                        
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-date-input name="endDate" [storeDate]="endDate()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('endDate', $event)" />
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
              <bk-cat name="reservationReason" [value]="reservationReason()" [categories]="reservationReasons" (changed)="onChange('reservationReason', $event)" />
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
              <bk-cat name="reservationState" [value]="reservationState()" [categories]="reservationStates" (changed)="onChange('reservationState', $event)" />
            </ion-col>

            <ion-col size="12" size-md="6">
              <bk-number-input name="price" [value]="price()" [maxLength]=6 [readOnly]="readOnly()" (changed)="onChange('price', $event)" />                                        
            </ion-col>

            <ion-col size="12" size-md="6">
              <bk-text-input name="currency" [value]="currency()" [maxLength]=20 [readOnly]="readOnly()" (changed)="onChange('currency', $event)" />                                        
            </ion-col>

            <ion-col size="12" size-md="6"> 
                <bk-cat name="periodicity" [value]="periodicity()" [categories]="periodicities" (changed)="onChange('periodicity', $event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="reservationTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />
    }
  
    @if(hasRole('admin')) {
      <bk-notes name="notes" [value]="notes()" (changed)="onChange('notes', $event)" />
    }
  </form>
  `
})
export class ReservationNewFormComponent {
  private readonly reservationSelectorsService = inject(ReservationSelectorsService)

  public vm = model.required<ReservationNewFormModel>();
  public currentUser = input<UserModel | undefined>();

  public readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser())); 
  protected reserverKey = computed(() => this.vm().reserverKey ?? '');
  protected reserverName = computed(() => this.vm().reserverName ?? ''); 
  protected reserverName2 = computed(() => this.vm().reserverName2 ?? ''); 
  protected reserverModelType = computed(() => this.vm().reserverModelType ?? ModelType.Person);
  protected reserverGender = computed(() => this.vm().reserverType as GenderType ?? GenderType.Male);
  protected reserverOrgType = computed(() => this.vm().reserverType as OrgType ?? OrgType.Association);
  protected resourceKey = computed(() => this.vm().resourceKey ?? '');
  protected resourceName = computed(() => this.vm().resourceName ?? '');
  protected resourceType = computed(() => this.vm().resourceType as ResourceType ?? ResourceType.RowingBoat);
  protected startDate = computed(() => this.vm().startDate ?? '');
  protected startTime = computed(() => this.vm().startTime ?? '');
  protected endDate = computed(() => this.vm().endDate ?? '');
  protected endTime = computed(() => this.vm().endTime ?? '');
  protected numberOfParticipants = computed(() => this.vm().numberOfParticipants ?? '');
  protected area = computed(() => this.vm().area ?? '');
  protected reservationRef = computed(() => this.vm().reservationRef ?? '');
  protected reservationState = computed(() => this.vm().reservationState ?? ReservationState.Active);
  protected reservationReason = computed(() => this.vm().reservationReason ?? ReservationReason.SocialEvent);
  protected priority = computed(() => this.vm().priority ?? 0);
  protected price = computed(() => this.vm().price ?? 0);
  protected currency = computed(() => this.vm().currency ?? 'CHF');
  protected periodicity = computed(() => this.vm().periodicity ?? Periodicity.Yearly);
  protected tags = computed(() => this.vm().tags ?? '');
  protected notes = computed(() => this.vm().notes ?? '');
  protected name = computed(() => this.vm().name ?? '');

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = reservationNewFormValidations;
  protected readonly shape = reservationNewFormModelShape;
  private readonly validationResult = computed(() => reservationNewFormValidations(this.vm()));
  public reservationTags = input.required<string>();

  protected modelType = ModelType;
  protected reservationStates = ReservationStates;
  protected reservationReasons = ReservationReasons;
  protected periodicities = PeriodicityTypes;
  protected timeMask = ChTimeMask;
  protected endFutureDate = END_FUTURE_DATE_STR;

  protected onValueChange(value: ReservationNewFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
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
    if (this.reserverModelType() === ModelType.Person) {
      const _person = await this.reservationSelectorsService.selectPerson();
      if (_person) {
        this.vm.update((_vm) => ({
          ..._vm, 
          reserverKey: _person.bkey, 
          reserverName: _person.firstName,
          reserverName2: _person.lastName,
          reserverModelType: ModelType.Person,
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
        resourceModelType: ModelType.Resource,
        resourceType: _resource.type,
        resourceSubType: _resource.subType,
      }));
      debugFormErrors('ReservationNewForm (Resource)', this.validationResult().errors, this.currentUser());
      this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
      this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
    }
  }
}
