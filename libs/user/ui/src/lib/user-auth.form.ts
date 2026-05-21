import { Component, computed, input, linkedSignal, model, output, Signal } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { CategoryListModel, UserModel } from "@bk2/shared-models";
import { Checkbox, CheckboxI18n, Chips } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors, debugFormModel, getCategoryItemNames } from "@bk2/shared-util-core";

import { flattenRoles, UserAuthFormModel, userAuthFormValidations } from "@bk2/user-util";

export interface UserAuthFormI18n {
  auth_title: Signal<string>;
  auth_description: Signal<string>;
  useTouchId_label: Signal<string>;
  useTouchId_helper: Signal<string>;
  useFaceId_label: Signal<string>;
  useFaceId_helper: Signal<string>;
}

@Component({
  selector: 'bk-user-auth-form',
  standalone: true,
  imports: [
    vestForms,
    Checkbox, Chips,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonGrid, IonRow, IonCol, IonCardSubtitle
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  viewProviders: [vestFormsViewProviders],
  template: `
    @if (showForm()) {
      <form scVestForm
        [formValue]="formData()"
        (formValueChange)="onFormChange($event)"
        [suite]="suite" 
        (dirtyChange)="dirty.emit($event)"
        (validChange)="valid.emit($event)"
      >

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().auth_title() }}</ion-card-title>
            <ion-card-subtitle>{{ i18n().auth_description() }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-checkbox [i18n]="useTouchIdI18n()" [checked]="useTouchId()" (checkedChange)="onFieldChange('useTouchId', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-checkbox [i18n]="useFaceIdI18n()" [checked]="useFaceId()" (checkedChange)="onFieldChange('useFaceId', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
        <bk-chips chipName="role" [storedChips]="roles()" (storedChipsChange)="onFieldChange('roles', $event)" [allChips]="allRoleNames()" [readOnly]="isReadOnly()" />
      </form>
    }
  `
})
export class UserAuthForm {
  protected useTouchIdI18n = computed(() => ({ name: 'useTouchId', label: this.i18n().useTouchId_label(), helper: this.i18n().useTouchId_helper() } as CheckboxI18n));
  protected useFaceIdI18n  = computed(() => ({ name: 'useFaceId',  label: this.i18n().useFaceId_label(),  helper: this.i18n().useFaceId_helper()  } as CheckboxI18n));

  // inputs
  public readonly i18n = input.required<UserAuthFormI18n>();
  public formData = model.required<UserAuthFormModel>();
  public currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public allRoles = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = userAuthFormValidations;
  private readonly validationResult = computed(() => userAuthFormValidations(this.formData()));

  // fields
  protected useTouchId = linkedSignal(() => this.formData().useTouchId ?? false);
  protected useFaceId = linkedSignal(() => this.formData().useFaceId ?? false);
  protected roles = linkedSignal(() => flattenRoles(this.formData().roles ?? { 'registered': true }));
  protected allRoleNames = computed(() => getCategoryItemNames(this.allRoles()));

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: UserAuthFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('UserAuthForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('UserAuthForm.onFormChange', this.validationResult().errors, this.currentUser());
  }
}
