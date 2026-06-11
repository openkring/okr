import { Component, computed, effect, input, linkedSignal, model, output } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";

import { CategoryListModel, UserModel } from "@bk2/shared-models";
import { Checkbox, CheckboxI18n, Chips } from "@bk2/shared-ui";
import { coerceBoolean, getCategoryItemNames } from "@bk2/shared-util-core";

import { flattenRoles, UserAuthFormModel, userAuthFormValidations, UserI18n } from "@bk2/user-util";

@Component({
  selector: 'bk-user-auth-form',
  standalone: true,
  imports: [
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
  private readonly validationResult = computed(() => userAuthFormValidations(this.formData()));

  // fields
  protected useTouchId = linkedSignal(() => this.formData().useTouchId ?? false);
  protected useFaceId = linkedSignal(() => this.formData().useFaceId ?? false);
  protected roles = linkedSignal(() => flattenRoles(this.formData().roles ?? { 'registered': true }));
  protected allRoleNames = computed(() => getCategoryItemNames(this.allRoles()));

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
  }

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
