import { Component, computed, input, model, output, signal } from '@angular/core';
import { vestForms } from 'ngx-vest-forms';

import { FieldDescription, UserModel } from '@bk2/shared/models';
import { UserFormModel, userFormModelShape, userFormValidations } from '@bk2/user/util';
import { UserModelFormComponent } from './user-model.form';
import { UserDisplayFormComponent } from './user-display.form';
import { UserAuthFormComponent } from './user-auth.form';
import { UserPrivacyFormComponent } from './user-privacy.form';
import { UserNotificationFormComponent } from './user-notification.form';
import { debugFormErrors } from '@bk2/shared/util';
import { ChipsComponent } from '@bk2/shared/ui';

@Component({
  selector: 'bk-user-form',
  imports: [
    vestForms,
    UserModelFormComponent, UserDisplayFormComponent, UserAuthFormComponent, UserPrivacyFormComponent, UserNotificationFormComponent,
    ChipsComponent
  ],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">

    @if(vm(); as vm) {
      <bk-user-model [vm]="vm" (changedField)="onFieldChange($event)" />
      <bk-user-display [vm]="vm" [userTags]="userTags()" (changedField)="onFieldChange($event)" />
    }

    <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="userTags()" chipName="tag" (changed)="onFieldChange({ name: 'tags', value: $event, label: '' })" />

    <!--
    <bk-user-auth [vm]="vm()" (changedField)="onFieldChange($event)" />
    <bk-user-privacy [vm]="vm()" (changedField)="onFieldChange($event)" />
    <bk-user-notification [vm]="vm()" (changedField)="onFieldChange($event)" />
-->
  </form>
  `
})
export class UserFormComponent {
  public vm = model.required<UserFormModel>();
  public currentUser = input<UserModel | undefined>();
  public userTags = input.required<string>();

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  protected tags = computed(() => this.vm().tags);

  protected readonly suite = userFormValidations;
  protected readonly shape = userFormModelShape;
  private readonly validationResult = computed(() => userFormValidations(this.vm()));
  
  protected onValueChange(value: UserFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onFieldChange(field: FieldDescription): void {
    this.vm.update((_vm) => ({..._vm, [field.name]: field.value}));
    debugFormErrors('UserForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
}
