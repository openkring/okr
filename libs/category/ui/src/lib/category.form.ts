import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { categoryListValidations } from '@bk2/category-util';
import { CategoryItemModel, CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategoryItemsComponent, CheckboxComponent, ChipsComponent, ErrorNoteComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';

@Component({
  selector: 'bk-category-list-form',
  standalone: true,
  imports: [
    vestForms,
    ChipsComponent, NotesInputComponent,
    TextInputComponent, ChipsComponent, ErrorNoteComponent, CategoryItemsComponent, CheckboxComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
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
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="name" [value]="name()" (valueChange)="onFieldChange('name', $event)"  [autofocus]="true" [copyable]="true" [readOnly]="isReadOnly()" /> 
                <bk-error-note [errors]="nameErrors()" />                                                                               
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input name="i18nBase" [value]="i18nBase()" (valueChange)="onFieldChange('i18nBase', $event)" [showHelper]="true" [readOnly]="isReadOnly()" /> 
                <bk-error-note [errors]="i18nBaseErrors()" />                                                                               
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="translateItems" [checked]="translateItems()" (checkedChange)="onFieldChange('translateItems', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-category-items [items]="items()" (changed)="onFieldChange('items', $event)" />

      @if(hasRole('privileged')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('admin')) {
        <bk-notes [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
`
})
export class CategoryListFormComponent {
  // inputs
  public formData = model.required<CategoryListModel>();
  public currentUser = input<UserModel>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public allTags = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = categoryListValidations;
  private readonly validationResult = computed(() => categoryListValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected i18nBaseErrors = computed(() => this.validationResult().getErrors('i18nBase'));

  // fields
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);
  protected i18nBase = linkedSignal(() => this.formData().i18nBase ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected items = linkedSignal(() => this.formData().items ?? []);
  protected translateItems = linkedSignal(() => this.formData().translateItems ?? false);

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | CategoryItemModel[] | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: CategoryListModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('CategoryListForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('CategoryListForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}