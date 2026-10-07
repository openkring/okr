import { Component, computed, effect, input, model, output } from "@angular/core";
import { form } from "@angular/forms/signals";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";

import { CategoryListModel, UserModel } from "@okr/shared-models";
import { Checkbox, CheckboxI18n, Chips, ErrorNote } from "@okr/shared-ui";
import { validateVestTree, vestErrors } from "@okr/shared-util-angular";
import { coerceBoolean, getCategoryItemNames } from "@okr/shared-util-core";

import { flattenRoles, structureRoles, UserAuthFormModel, userAuthFormValidations, UserI18n } from "@okr/user-util";

@Component({
  selector: 'okr-user-auth-form',
  standalone: true,
  imports: [
    ErrorNote,
    Checkbox, Chips,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonGrid, IonRow, IonCol, IonCardSubtitle
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().auth_title() }}</ion-card-title>
            <ion-card-subtitle>{{ i18n().auth_description() }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="useTouchIdI18n()" [checked]="useTouchId()" (checkedChange)="onFieldChange('useTouchId', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="useTouchIdErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="useFaceIdI18n()" [checked]="useFaceId()" (checkedChange)="onFieldChange('useFaceId', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="useFaceIdErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
        <okr-chips chipName="role" [storedChips]="roles()" (storedChipsChange)="onFieldChange('roles', $event)" [allChips]="allRoleNames()" [readOnly]="isReadOnly()" />
      </form>
    }
  `
})
export class UserAuthForm {
  protected useTouchIdI18n = computed(() => ({ name: 'useTouchId', label: this.i18n().useTouchId_label(), helper: this.i18n().useTouchId_helper() } as CheckboxI18n));
  protected useFaceIdI18n  = computed(() => ({ name: 'useFaceId',  label: this.i18n().useFaceId_label(),  helper: this.i18n().useFaceId_helper()  } as CheckboxI18n));

  // inputs
  public readonly i18n = input.required<UserI18n>();
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly authForm = form(this.formData, (path) => validateVestTree(path, userAuthFormValidations as any));

  // per-field errors for the notes under each field
  private readonly validationResult = vestErrors(this.authForm);

  protected useFaceIdErrors = computed(() => this.validationResult().getErrors('useFaceId'));
  protected useTouchIdErrors = computed(() => this.validationResult().getErrors('useTouchId'));
  // fields
  protected readonly useTouchId = computed(() => this.formData().useTouchId ?? false);
  protected readonly useFaceId = computed(() => this.formData().useFaceId ?? false);
  protected readonly roles = computed(() => flattenRoles(this.formData().roles ?? { 'registered': true }));
  protected allRoleNames = computed(() => getCategoryItemNames(this.allRoles()));

  constructor() {
    effect(() => this.valid.emit(this.authForm().valid()));
  }

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    // the chips component emits a comma-separated string; roles are stored as a Roles object
    const value = fieldName === 'roles' ? structureRoles(fieldValue as string) : fieldValue;
    this.formData.update((vm) => ({ ...vm, [fieldName]: value }));
  }
}
