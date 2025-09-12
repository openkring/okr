import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { ReservationFormModel, reservationFormModelShape, reservationFormValidations } from '@bk2/relationship-reservation-util';
import { PeriodicityTypes, ReservationReasons, ReservationStates } from '@bk2/shared-categories';
import { ChTimeMask } from '@bk2/shared-config';
import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { GenderType, ModelType, OrgType, Periodicity, ReservationReason, ReservationState, RoleName, UserModel } from '@bk2/shared-models';
import { CategoryComponent, ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, hasRole } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-reservation-form',
  standalone: true,
  imports: [
    vestForms,
    TextInputComponent, DateInputComponent,
    NumberInputComponent, ChipsComponent, NotesInputComponent, CategoryComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent
  ],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">
  
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
export class ReservationFormComponent {
  public vm = model.required<ReservationFormModel>();
  public currentUser = input<UserModel | undefined>();
  public reservationTags = input.required<string>();

  public readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser())); 
  protected reserverName = computed(() => this.vm().reserverName ?? ''); 
  protected reserverName2 = computed(() => this.vm().reserverName2 ?? ''); 
  protected reserverModelType = computed(() => this.vm().reserverModelType ?? ModelType.Person);
  protected reserverGender = computed(() => this.vm().reserverType as GenderType ?? GenderType.Male);
  protected reserverOrgType = computed(() => this.vm().reserverType as OrgType ?? OrgType.Association);
  protected resourceKey = computed(() => this.vm().resourceKey ?? '');
  protected resourceName = computed(() => this.vm().resourceName ?? '');
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
  
  protected readonly suite = reservationFormValidations;
  protected readonly shape = reservationFormModelShape;
  private readonly validationResult = computed(() => reservationFormValidations(this.vm()));
  
  protected modelType = ModelType;
  protected reservationStates = ReservationStates;
  protected reservationReasons = ReservationReasons;
  protected periodicities = PeriodicityTypes;
  protected timeMask = ChTimeMask;
  protected endFutureDate = END_FUTURE_DATE_STR;

  protected onValueChange(value: ReservationFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('ReservationForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
