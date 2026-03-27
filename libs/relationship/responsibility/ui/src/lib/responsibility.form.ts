import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow, IonText } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_DATE, WORD_LENGTH } from '@bk2/shared-constants';
import { ResponsibilityModel, RoleName, UserModel } from '@bk2/shared-models';
import { ButtonCopyComponent, DateInputComponent, ErrorNoteComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, debugFormModel, getAvatarName, hasRole } from '@bk2/shared-util-core';

import { isDelegateActive, responsibilityValidations } from '@bk2/relationship-responsibility-util';
import { LowercaseWordMask } from '@bk2/shared-config';

@Component({
  selector: 'bk-responsibility-form',
  standalone: true,
  imports: [
    vestForms,
    TextInputComponent, DateInputComponent, ButtonCopyComponent, ErrorNoteComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonItem, IonLabel, IonButton, IonText
  ],
  template: `
    <form scVestForm
      [formValue]="formData()"
      (formValueChange)="onFormChange($event)"
      [suite]="suite"
      (validChange)="valid.emit($event)"
    >

      <!-- Responsible -->
      <ion-card class="ion-no-padding">
        <ion-card-header>
          <ion-card-title>Verantwortlichkeit</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
             <ion-col size="12" size-md="6">
                @if(isNew()) {
                  <bk-text-input name="respId" [value]="bkey()" (valueChange)="onFieldChange('bkey', $event)" [maxLength]="maxWordLength" [mask]="mask" [showHelper]=true [readOnly]="false" />
                } @else {
                  <ion-item lines="none">
                    <ion-label>ID: {{ bkey() }}</ion-label>
                    <bk-button-copy [value]="bkey()" />
                  </ion-item>
                }                                     
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input name="name" [value]="name()" (valueChange)="onFieldChange('name', $event)" [copyable]="true" [readOnly]="false" />
                <bk-error-note [errors]="nameErrors()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <ion-item lines="none">
                  <ion-label>{{ parentName() || 'Kein Elternelement' }}</ion-label>
                  <ion-button slot="end" fill="clear" (click)="selectParent.emit()">Auswählen</ion-button>
                </ion-item>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- Responsible -->
      <ion-card class="ion-no-padding">
        <ion-card-header>
          <ion-card-title>Verantwortliche Person</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <ion-item lines="none">
                  <ion-label>{{ responsibleName() }}</ion-label>
                  <ion-button slot="end" fill="clear" (click)="selectResponsible.emit()">Auswählen</ion-button>
                </ion-item>
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-date-input name="validFrom" [storeDate]="validFrom()" (storeDateChange)="onFieldChange('validFrom', $event)" [locale]="locale()" [readOnly]="false" [showHelper]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-date-input name="validTo" [storeDate]="validTo()" (storeDateChange)="onFieldChange('validTo', $event)" [locale]="locale()" [readOnly]="false" [showHelper]=true />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- Delegation -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Stellvertretung</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <ion-item lines="none">
                  <ion-label>{{ delegateName() }}</ion-label>
                  <ion-button slot="end" fill="clear" (click)="selectDelegate.emit()">Auswählen</ion-button>
                  @if(formData().delegateAvatar) {
                    <ion-button slot="end" fill="clear" color="danger" (click)="clearDelegate.emit()">Entfernen</ion-button>
                  }
                </ion-item>
              </ion-col>
              @if(formData().delegateAvatar) {
                <ion-col size="12" size-md="6">
                  <bk-date-input name="delegateValidFrom" [storeDate]="delegateValidFrom()" (storeDateChange)="onFieldChange('delegateValidFrom', $event)" [locale]="locale()" [readOnly]="false" [showHelper]=true />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-date-input name="delegateValidTo" [storeDate]="delegateValidTo()" (storeDateChange)="onFieldChange('delegateValidTo', $event)" [locale]="locale()" [readOnly]="false" [showHelper]=true />
                </ion-col>
                @if(delegateExpired()) {
                  <ion-row>
                    <ion-col>
                      <ion-item lines="none">
                        <ion-text color="medium">Delegation abgelaufen</ion-text>
                      </ion-item>
                    </ion-col>
                  </ion-row>
                }
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class ResponsibilityForm {
  // inputs
  public formData = model.required<ResponsibilityModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public readonly isNew = input(false);
  public readonly locale = input.required<string>();

  // signals
  public readonly parentName = input('');

  public valid = output<boolean>();
  public dirty = output<boolean>();
  public selectParent = output<void>();
  public selectResponsible = output<void>();
  public selectDelegate = output<void>();
  public clearDelegate = output<void>();

  // validation and errors
  protected readonly suite = responsibilityValidations;
  private readonly validationResult = computed(() => responsibilityValidations(this.formData(), this.tenantId()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected bkeyErrors = computed(() => this.validationResult().getErrors('bkey'));

  // fields
  protected bkey = linkedSignal(() => this.formData().bkey ?? '');
  protected name = linkedSignal(() => this.formData().name ?? '');
  protected validFrom = linkedSignal(() => this.formData().validFrom ?? DEFAULT_DATE);
  protected validTo = linkedSignal(() => this.formData().validTo ?? DEFAULT_DATE);
  protected delegateValidFrom = linkedSignal(() => this.formData().delegateValidFrom ?? DEFAULT_DATE);
  protected delegateValidTo = linkedSignal(() => this.formData().delegateValidTo ?? DEFAULT_DATE);
  protected responsibleName = computed(() => getAvatarName(this.formData().responsibleAvatar) || 'Verantwortlicher unbestimmt');
  protected delegateName = computed(() => getAvatarName(this.formData().delegateAvatar) || 'Stellvertreter unbestimmt');
  protected delegateExpired = computed(() => !isDelegateActive(this.formData()));

  // passing constants to template
  protected mask = LowercaseWordMask;
  protected readonly maxWordLength = WORD_LENGTH;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean | undefined): void {
    if (fieldName === 'bkey') {
      fieldValue = (fieldValue as string).toLowerCase();
    }
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    this.dirty.emit(true);
  }

  protected onFormChange(value: ResponsibilityModel): void {
    this.formData.update((vm) => ({ ...vm, ...value }));
    debugFormModel('ResponsibilityForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('ResponsibilityForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
