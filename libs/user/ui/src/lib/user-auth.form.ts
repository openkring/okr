import { Component, computed, effect, input, model, output } from "@angular/core";
import { form } from "@angular/forms/signals";

import { CategoryListModel, UserModel } from "@okr/shared-models";
import { Chips } from "@okr/shared-ui";
import { validateVestTree } from "@okr/shared-util-angular";
import { coerceBoolean, getCategoryItemNames } from "@okr/shared-util-core";

import { flattenRoles, structureRoles, UserAuthFormModel, userAuthFormValidations, UserI18n } from "@okr/user-util";

@Component({
  selector: 'okr-user-auth-form',
  standalone: true,
  imports: [Chips],
  template: `
    @if (showForm()) {
      <form novalidate>
        <okr-chips chipName="role" [storedChips]="roles()" (storedChipsChange)="onFieldChange('roles', $event)" [allChips]="allRoleNames()" [readOnly]="isReadOnly()" />
      </form>
    }
  `
})
export class UserAuthForm {
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

  // fields
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
