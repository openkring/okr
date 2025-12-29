import { AsyncPipe } from "@angular/common";
import { Component, computed, input, linkedSignal, model, output } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { TranslatePipe } from "@bk2/shared-i18n";
import { CategoryListModel, UserModel } from "@bk2/shared-models";
import { CheckboxComponent, ChipsComponent } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors, debugFormModel, getCategoryItemNames } from "@bk2/shared-util-core";

import { flattenRoles, UserAuthFormModel, userAuthFormValidations } from "@bk2/user-util";

@Component({
  selector: 'bk-user-auth-form',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    vestForms,
    CheckboxComponent, ChipsComponent,
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
            <ion-card-title>{{ '@user.auth.title' | translate | async }}</ion-card-title>
            <ion-card-subtitle>{{ '@user.auth.description' | translate | async }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-checkbox name="useTouchId" [checked]="useTouchId()" (checkedChange)="onFieldChange('useTouchId', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-checkbox name="useFaceId" [checked]="useFaceId()" (checkedChange)="onFieldChange('useFaceId', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
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
export class UserAuthFormComponent {
  // inputs
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
