import { Component, computed, effect, input, linkedSignal, model, output, Signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { CategoryI18n, categoryListValidations } from '@bk2/category-util';
import { CategoryItemModel, CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategoryItems, Checkbox, CheckboxI18n, Chips, ErrorNote, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { validateVestTree } from '@bk2/shared-util-angular';
import { DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';

@Component({
  selector: 'bk-category-list-form',
  standalone: true,
  imports: [
    Chips, NotesInput, TextInput, ErrorNote, CategoryItems, Checkbox,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form novalidate>

      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              @if(hasRole('admin')) {
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                </ion-col>
              }
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"  [autofocus]="true" [copyable]="true" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="nameErrors()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="i18nBaseI18n()" [value]="i18nBase()" (valueChange)="onFieldChange('i18nBase', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="i18nBaseErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="translateItemsI18n()" [checked]="translateItems()" (checkedChange)="onFieldChange('translateItems', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-category-items
        [items]="items()"
        [hasAbbreviation]="hasAbbreviation()"
        (changed)="onFieldChange('items', $event)"
      />

      @if(hasRole('privileged')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('admin')) {
        <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
`
})
export class CategoryListForm {
  // inputs
  public readonly i18n = input.required<CategoryI18n>();
  public formData = model.required<CategoryListModel>();
  public currentUser = input<UserModel>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public hasAbbreviation = input<boolean>(false);
  public allTags = input.required<string>();
  public tenants = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  protected readonly categoryForm = form(this.formData, (path) =>
    validateVestTree(path, categoryListValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.categoryForm().valid()));
  }

  // validation and errors
  private readonly validationResult = computed(() => categoryListValidations(this.formData(), this.tenants(), this.allTags()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected i18nBaseErrors = computed(() => this.validationResult().getErrors('i18nBase'));

  // fields
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);
  protected i18nBase = linkedSignal(() => this.formData().i18n ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected items = linkedSignal(() => this.formData().items ?? []);
  protected translateItems = linkedSignal(() => this.formData().translateItems ?? false);
  protected bkey = computed(() => this.formData().bkey ?? '');

  protected bkeyI18n = computed(() => ({
    name: 'bkey',
    label: this.i18n().bkey_label(),
    placeholder: this.i18n().bkey_placeholder(),
    helper: this.i18n().bkey_helper()
  } as TextInputI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected i18nBaseI18n = computed(() => ({
    name: 'i18nBase',
    label: this.i18n().i18nBase_label(),
    placeholder: this.i18n().i18nBase_placeholder(),
    helper: this.i18n().i18nBase_helper()
  } as TextInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes',
    label: this.i18n().notes_label(),
    placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));

  protected translateItemsI18n = computed(() => ({
    name: 'translateItems',
    label: this.i18n().items_label(),
    helper: this.i18n().items_description()
  } as CheckboxI18n));

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | CategoryItemModel[] | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormModel('CategoryListForm.onFieldChange', this.formData(), this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
