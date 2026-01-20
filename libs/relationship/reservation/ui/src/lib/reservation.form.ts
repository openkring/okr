import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';
import { AsyncPipe } from '@angular/common';

import { DEFAULT_CURRENCY, DEFAULT_KEY, DEFAULT_RES_REASON, DEFAULT_RES_STATE } from '@bk2/shared-constants';
import { CategoryListModel, ReservationModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, getAvatarName, hasRole } from '@bk2/shared-util-core';
import { TranslatePipe } from '@bk2/shared-i18n';

import { reservationValidations } from '@bk2/relationship-reservation-util';
import { AvatarPipe } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-reservation-form',
  standalone: true,
  imports: [
    vestForms,
    AsyncPipe, TranslatePipe, AvatarPipe,
    TextInputComponent,
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
                      <ion-img src="{{ reserverAvatarKey() | avatar }}" alt="Avatar of Reserver" />
                    </ion-avatar>
                    <ion-label>{{ reserverName() }}</ion-label>
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
                      <ion-img src="{{ resourceAvatarKey() | avatar }}" alt="Avatar Logo of Resource" />
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
          <ion-card-title>Angaben zum Anlass</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6"> 
                <bk-cat-select [category]="reasons()" [selectedItemName]="reason()" (selectedItemNameChange)="onFieldChange('reason', $event)" [withAll]=false [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input name="participants" [value]="participants()" (valueChange)="onFieldChange('participants', $event)"  [readOnly]="isReadOnly()" />                                        
              </ion-col>

              <ion-col size="12" size-md="6"> 
                <bk-text-input name="area" [value]="area()" (valueChange)="onFieldChange('area', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />                                        
              </ion-col>

              <ion-col size="12" size-md="6"> 
                <bk-text-input name="resref" [value]="ref()" (valueChange)="onFieldChange('ref', $event)" [maxLength]=30 [readOnly]="isReadOnly()" />                                        
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
                <bk-number-input name="price" [value]="amount()" (valueChange)="onFieldChange('amount', $event)" [maxLength]=6 [readOnly]="isReadOnly()" />                                        
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input name="currency" [value]="currency()" (valueChange)="onFieldChange('currency', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />                                        
              </ion-col>

            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-notes name="description" [value]="description()" (valueChange)="onFieldChange('description', $event)" [readOnly]="isReadOnly()" />

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
  public readonly tenantId = input.required<string>();
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
