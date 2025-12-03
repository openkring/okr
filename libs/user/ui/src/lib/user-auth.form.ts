import { AsyncPipe } from "@angular/common";
import { Component, computed, effect, input, model, output } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { TranslatePipe } from "@bk2/shared-i18n";
import { CategoryListModel, UserModel } from "@bk2/shared-models";
import { CheckboxComponent, ChipsComponent } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors, getCategoryItemNames } from "@bk2/shared-util-core";

import { flattenRoles, USER_AUTH_FORM_SHAPE, UserAuthFormModel, userAuthFormValidations } from "@bk2/user-util";

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
    <form scVestForm
      [formShape]="shape"
      [formValue]="formData()"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (formValueChange)="onFormChange($event)">
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@user.auth.title' | translate | async }}</ion-card-title>
          <ion-card-subtitle>{{ '@user.auth.description' | translate | async }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="useTouchId" [isChecked]="useTouchId()" [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('useTouchId', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="useFaceId" [isChecked]="useFaceId()" [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('useFaceId', $event)" />
              </ion-col>
            </ion-row>
            <ion-row>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <bk-chips chipName="role" [storedChips]="roles()" [allChips]="allRoleNames()" [readOnly]="isReadOnly()" (changed)="onFieldChange('roles', $event)" />
    </form>
  `
})
export class UserAuthFormComponent {
  // inputs
  public formData = model.required<UserAuthFormModel>();
  public currentUser = input<UserModel | undefined>();
  public allRoles = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = userAuthFormValidations;
  protected readonly shape = USER_AUTH_FORM_SHAPE;
  private readonly validationResult = computed(() => userAuthFormValidations(this.formData()));

  // fields
  protected useTouchId = computed(() => this.formData().useTouchId ?? false);
  protected useFaceId = computed(() => this.formData().useFaceId ?? false);
  protected roles = computed(() => flattenRoles(this.formData().roles ?? { 'registered': true }));
  protected allRoleNames = computed(() => getCategoryItemNames(this.allRoles()));

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: UserAuthFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('UserAuthForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('UserAuthForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }
}
