import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CategoryListModel, AccountModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ErrorNoteComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';

import { accountValidations } from '@bk2/finance-account-util';

@Component({
  selector: 'bk-account-form',
  standalone: true,
  imports: [
    vestForms,
    CategorySelectComponent, TextInputComponent, NotesInputComponent, ErrorNoteComponent,
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
                    <bk-text-input name="bkey" [value]="bkey()" label="bkey" [readOnly]="true" [copyable]="true" />
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-text-input name="id" [value]="id()" (valueChange)="onFieldChange('id', $event)" [autofocus]="true" [copyable]="true" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="idErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input name="name" [value]="name()" (valueChange)="onFieldChange('name', $event)" [copyable]="true" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="nameErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input name="label" [value]="label()" (valueChange)="onFieldChange('label', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input name="parentId" [value]="parentId()" (valueChange)="onFieldChange('parentId', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        @if(hasRole('admin')) {
          <bk-notes name="notes" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
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
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

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
  protected parentId = linkedSignal(() => this.formData().parentId ?? '');
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
