import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow, IonText } from '@ionic/angular/standalone';
import { DEFAULT_DATE, WORD_LENGTH } from '@bk2/shared-constants';
import { ResponsibilityModel, RoleName, UserModel } from '@bk2/shared-models';
import { ButtonCopy, ButtonCopyI18n, DateInput, DateInputI18n, ErrorNote, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { getAvatarName, hasRole } from '@bk2/shared-util-core';

import { isDelegateActive, responsibilityValidations, ResponsibilityI18n } from '@bk2/relationship-responsibility-util';
import { LowercaseWordMask } from '@bk2/shared-config';

@Component({
  selector: 'bk-responsibility-form',
  standalone: true,
  imports: [
    TextInput, DateInput, ButtonCopy, ErrorNote,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonItem, IonLabel, IonButton, IonText
  ],
  template: `
    <form novalidate>

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
                  <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" (valueChange)="onFieldChange('bkey', $event)" [maxLength]="maxWordLength" [mask]="mask" [showHelper]=true [readOnly]="false" />
                } @else {
                  <ion-item lines="none">
                    <ion-label>ID: {{ bkey() }}</ion-label>
                    <bk-button-copy [i18n]="buttonCopyI18n()" [value]="bkey()" />
                  </ion-item>
                }                                     
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [copyable]="true" [readOnly]="false" />
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
                <bk-date-input [i18n]="validFromI18n()" [storeDate]="validFrom()" (storeDateChange)="onFieldChange('validFrom', $event)" [locale]="locale()" [readOnly]="false" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-date-input [i18n]="validToI18n()" [storeDate]="validTo()" (storeDateChange)="onFieldChange('validTo', $event)" [locale]="locale()" [readOnly]="false" />
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
                  <bk-date-input [i18n]="delegateValidFromI18n()" [storeDate]="delegateValidFrom()" (storeDateChange)="onFieldChange('delegateValidFrom', $event)" [locale]="locale()" [readOnly]="false" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-date-input [i18n]="delegateValidToI18n()" [storeDate]="delegateValidTo()" (storeDateChange)="onFieldChange('delegateValidTo', $event)" [locale]="locale()" [readOnly]="false" />
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
  // i18n
  public readonly i18n = input.required<ResponsibilityI18n>();
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf() } as ButtonCopyI18n));
  protected bkeyI18n = computed(() => ({ name: 'bkey', label: this.i18n().bkey_label(), placeholder: this.i18n().bkey_placeholder(), helper: this.i18n().bkey_helper() } as TextInputI18n));
  protected nameI18n = computed(() => ({ name: 'name', label: this.i18n().name_label(), placeholder: this.i18n().name_placeholder(), helper: this.i18n().name_helper() } as TextInputI18n));
  protected validFromI18n = computed(() => ({ name: 'validFrom', label: this.i18n().validFrom_label(), placeholder: this.i18n().validFrom_placeholder(), helper: this.i18n().validFrom_helper() } as DateInputI18n));
  protected validToI18n = computed(() => ({ name: 'validTo', label: this.i18n().validTo_label(), placeholder: this.i18n().validTo_placeholder(), helper: this.i18n().validTo_helper() } as DateInputI18n));
  protected delegateValidFromI18n = computed(() => ({ name: 'delegateValidFrom', label: this.i18n().delegateValidFrom_label(), placeholder: this.i18n().delegateValidFrom_placeholder(), helper: this.i18n().delegateValidFrom_helper() } as DateInputI18n));
  protected delegateValidToI18n = computed(() => ({ name: 'delegateValidTo', label: this.i18n().delegateValidTo_label(), placeholder: this.i18n().delegateValidTo_placeholder(), helper: this.i18n().delegateValidTo_helper() } as DateInputI18n));

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

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
  }

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean | undefined): void {
    if (fieldName === 'bkey') {
      fieldValue = (fieldValue as string).toLowerCase();
    }
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    this.dirty.emit(true);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
