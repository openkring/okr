import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CATEGORY_LIST_FORM_SHAPE, CategoryListFormModel, categoryListFormValidations } from '@bk2/category-util';
import { CategoryItemModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategoryItemsComponent, CheckboxComponent, ChipsComponent, ErrorNoteComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';
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
  <form scVestForm 
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">

    <ion-card>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <bk-text-input name="name" [value]="name()" [autofocus]="true" [copyable]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('name', $event)" /> 
              <bk-error-note [errors]="nameErrors()" />                                                                               
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-text-input name="i18nBase" [value]="i18nBase()" [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('i18nBase', $event)" /> 
              <bk-error-note [errors]="i18nBaseErrors()" />                                                                               
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="translateItems" [isChecked]="translateItems()" [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('translateItems', $event)"/>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <bk-category-items [items]="items()" (changed)="onFieldChange('items', $event)" />

    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="categoryTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />
    }

    @if(hasRole('admin')) {
      <bk-notes [value]="notes()" [readOnly]="isReadOnly()" (changed)="onFieldChange('notes', $event)" />
    }
  </form>
`
})
export class CategoryListFormComponent {
  public formData = model.required<CategoryListFormModel>();
  public currentUser = input<UserModel | undefined>();
  public categoryTags = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = categoryListFormValidations;
  protected readonly shape = CATEGORY_LIST_FORM_SHAPE;
  private readonly validationResult = computed(() => categoryListFormValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected i18nBaseErrors = computed(() => this.validationResult().getErrors('i18nBase'));

  // fields
  protected name = computed(() => this.formData().name ?? DEFAULT_NAME);
  protected i18nBase = computed(() => this.formData().i18nBase ?? '');
  protected notes = computed(() => this.formData().notes ?? DEFAULT_NOTES);
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected items = computed(() => this.formData().items ?? []);
  protected translateItems = computed(() => this.formData().translateItems ?? false);

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: CategoryListFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('CategoryForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | CategoryItemModel[] | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('CategoryForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}