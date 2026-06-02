import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CategoryListModel, AccountModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelect, ErrorNote, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';

import { AccountI18n, accountValidations } from '@bk2/finance-account-util';

export type { AccountI18n };

@Component({
  selector: 'bk-account-form',
  standalone: true,
  imports: [
    vestForms,
    CategorySelect, TextInput, NotesInput, ErrorNote,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form scVestForm
        [formValue]="formData()"
        [suite]="suite"
        (dirtyChange)="dirty.emit($event)"
        (validChange)="valid.emit($event)"
        (formValueChange)="onFormChange($event)">

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @if(hasRole('admin')) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="idI18n()" [value]="id()" (valueChange)="onFieldChange('id', $event)" [autofocus]="true" [copyable]="true" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="idErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [copyable]="true" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="nameErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="parentIdI18n()" [value]="parentId()" (valueChange)="onFieldChange('parentId', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        @if(hasRole('admin')) {
          <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `
})
export class AccountForm {
  public readonly formData = model.required<AccountModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input(true);
  public readonly types = input.required<CategoryListModel>();
  public readonly tenantId = input.required<string>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<AccountI18n>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected bkeyI18n = computed(() => ({
    name: 'bkey', label: this.i18n().bkey_label(), placeholder: this.i18n().bkey_placeholder(), helper: this.i18n().bkey_helper()
  } as TextInputI18n));

  protected idI18n = computed(() => ({
    name: 'id', label: this.i18n().id_label(), placeholder: this.i18n().id_placeholder(), helper: this.i18n().id_helper()
  } as TextInputI18n));

  protected nameI18n = computed(() => ({
    name: 'name', label: this.i18n().name_label(), placeholder: this.i18n().name_placeholder(), helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected labelI18n = computed(() => ({
    name: 'label', label: this.i18n().label_label(), placeholder: this.i18n().label_placeholder(), helper: this.i18n().label_helper()
  } as TextInputI18n));

  protected parentIdI18n = computed(() => ({
    name: 'parentId', label: this.i18n().parentId_label(), placeholder: this.i18n().parentId_placeholder(), helper: this.i18n().parentId_helper()
  } as TextInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));

  public dirty = output<boolean>();
  public valid = output<boolean>();

  protected readonly suite = accountValidations;
  private readonly validationResult = computed(() => accountValidations(this.formData(), this.tenantId(), ''));
  protected idErrors = computed(() => this.validationResult().getErrors('id'));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  protected id = linkedSignal(() => this.formData().id ?? '');
  protected name = linkedSignal(() => this.formData().name ?? '');
  protected type = linkedSignal(() => this.formData().type ?? '');
  protected label = linkedSignal(() => this.formData().label ?? '');
  protected parentId = linkedSignal(() => this.formData().parentKey ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? '');
  protected bkey = computed(() => this.formData().bkey ?? '');

  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: AccountModel): void {
    this.formData.update((vm) => ({ ...vm, ...value }));
    debugFormModel('AccountForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('AccountForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
