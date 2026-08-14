import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow, IonText } from '@ionic/angular/standalone';
import { DEFAULT_DATE, WORD_LENGTH } from '@okr/shared-constants';
import { ResponsibilityModel, RoleName, UserModel } from '@okr/shared-models';
import { ButtonCopy, ButtonCopyI18n, DateInput, DateInputI18n, ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { getAvatarName, hasRole } from '@okr/shared-util-core';

import { isDelegateActive, responsibilityValidations, ResponsibilityI18n } from '@okr/relationship-responsibility-util';
import { LowercaseWordMask } from '@okr/shared-config';

@Component({
  selector: 'okr-responsibility-form',
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
          <ion-card-title>{{ i18n().card_main() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
             <ion-col size="12" size-md="6">
                @if(isNew()) {
                  <okr-text-input [i18n]="okeyI18n()" [value]="okey()" (valueChange)="onFieldChange('okey', $event)" [maxLength]="maxWordLength" [mask]="mask" [showHelper]=true [readOnly]="false" />
                } @else {
                  <ion-item lines="none">
                    <ion-label>ID: {{ okey() }}</ion-label>
                    <okr-button-copy [i18n]="buttonCopyI18n()" [value]="okey()" />
                  </ion-item>
                }                                     
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [copyable]="true" [readOnly]="false" />
                <okr-error-note [errors]="nameErrors()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <ion-item lines="none">
                  <ion-label>{{ parentName() || i18n().no_parent() }}</ion-label>
                  <ion-button slot="end" fill="clear" (click)="selectParent.emit()">{{ i18n().select_action() }}</ion-button>
                </ion-item>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- Responsible -->
      <ion-card class="ion-no-padding">
        <ion-card-header>
          <ion-card-title>{{ i18n().card_person() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <ion-item lines="none">
                  <ion-label>{{ responsibleName() }}</ion-label>
                  <ion-button slot="end" fill="clear" (click)="selectResponsible.emit()">{{ i18n().select_action() }}</ion-button>
                </ion-item>
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-date-input [i18n]="validFromI18n()" [storeDate]="validFrom()" (storeDateChange)="onFieldChange('validFrom', $event)" [locale]="locale()" [readOnly]="false" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-date-input [i18n]="validToI18n()" [storeDate]="validTo()" (storeDateChange)="onFieldChange('validTo', $event)" [locale]="locale()" [readOnly]="false" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- Delegation -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().card_delegate() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <ion-item lines="none">
                  <ion-label>{{ delegateName() }}</ion-label>
                  <ion-button slot="end" fill="clear" (click)="selectDelegate.emit()">{{ i18n().select_action() }}</ion-button>
                  @if(formData().delegateAvatar) {
                    <ion-button slot="end" fill="clear" color="danger" (click)="clearDelegate.emit()">{{ i18n().remove() }}</ion-button>
                  }
                </ion-item>
              </ion-col>
              @if(formData().delegateAvatar) {
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="delegateValidFromI18n()" [storeDate]="delegateValidFrom()" (storeDateChange)="onFieldChange('delegateValidFrom', $event)" [locale]="locale()" [readOnly]="false" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="delegateValidToI18n()" [storeDate]="delegateValidTo()" (storeDateChange)="onFieldChange('delegateValidTo', $event)" [locale]="locale()" [readOnly]="false" />
                </ion-col>
                @if(delegateExpired()) {
                  <ion-row>
                    <ion-col>
                      <ion-item lines="none">
                        <ion-text color="medium">{{ i18n().delegate_expired() }}</ion-text>
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
  protected okeyI18n = computed(() => ({ name: 'okey', label: this.i18n().okey_label(), placeholder: this.i18n().okey_placeholder(), helper: this.i18n().okey_helper() } as TextInputI18n));
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
  protected okeyErrors = computed(() => this.validationResult().getErrors('okey'));

  // fields
  protected okey = linkedSignal(() => this.formData().okey ?? '');
  protected name = linkedSignal(() => this.formData().name ?? '');
  protected validFrom = linkedSignal(() => this.formData().validFrom ?? DEFAULT_DATE);
  protected validTo = linkedSignal(() => this.formData().validTo ?? DEFAULT_DATE);
  protected delegateValidFrom = linkedSignal(() => this.formData().delegateValidFrom ?? DEFAULT_DATE);
  protected delegateValidTo = linkedSignal(() => this.formData().delegateValidTo ?? DEFAULT_DATE);
  protected responsibleName = computed(() => getAvatarName(this.formData().responsibleAvatar) || this.i18n().responsible_unset());
  protected delegateName = computed(() => getAvatarName(this.formData().delegateAvatar) || this.i18n().delegate_unset());
  protected delegateExpired = computed(() => !isDelegateActive(this.formData()));

  // passing constants to template
  protected mask = LowercaseWordMask;
  protected readonly maxWordLength = WORD_LENGTH;

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
  }

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean | undefined): void {
    if (fieldName === 'okey') {
      fieldValue = (fieldValue as string).toLowerCase();
    }
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    this.dirty.emit(true);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
