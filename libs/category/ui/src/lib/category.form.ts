import { Component, computed, effect, input, model, output, Signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { CategoryI18n, categoryListValidations } from '@okr/category-util';
import { CategoryItemModel, CategoryListModel, ColorIonic, RoleName, UserModel } from '@okr/shared-models';
import { CategoryItems, Checkbox, CheckboxI18n, Chips, ErrorNote, TextareaInput, TextareaInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, debugFormModel, hasRole } from '@okr/shared-util-core';
import { DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DESCRIPTION_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';

@Component({
  selector: 'okr-category-list-form',
  standalone: true,
  imports: [
    Chips, TextareaInput, TextInput, ErrorNote, CategoryItems, Checkbox,
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
                  <okr-text-input [i18n]="okeyI18n()" [value]="okey()" [readOnly]="true" [copyable]="true" />
                </ion-col>
              }
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"  [autofocus]="true" [copyable]="true" [maxLength]="shortNameLength" [readOnly]="identityReadOnly()" />
                <okr-error-note [errors]="nameErrors()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="i18nScopeI18n()" [value]="i18nScope()" (valueChange)="onFieldChange('i18n', $event)" [showHelper]="true" [maxLength]="nameLength" [readOnly]="identityReadOnly()" />
                <okr-error-note [errors]="i18nScopeErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-checkbox [i18n]="translateItemsI18n()" [checked]="translateItems()" (checkedChange)="onFieldChange('translateItems', $event)" [showHelper]="true" [readOnly]="identityReadOnly()" />
                <okr-error-note [errors]="translateItemsErrors()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <okr-category-items
        [items]="items()"
        [hasAbbreviation]="hasAbbreviation()"
        [hasPrice]="hasPrice()"
        [protectedNames]="protectedNames()"
        (changed)="onFieldChange('items', $event)"
      />
      <okr-error-note [errors]="itemsErrors()" [params]="{ name: missingProtected().join(', ') }" />
      @for (warning of removalWarnings(); track warning) {
        <okr-error-note [errors]="[warningKey(warning)]" [color]="warningColor" />
      }

      @if(hasRole('privileged')) {
        <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('admin')) {
        <okr-textarea-input variant="card" [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [maxLength]="descriptionLength" [readOnly]="isReadOnly()" [errors]="notesErrors()" />
      }
    </form>
  }
`
})
export class CategoryListForm {
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly shortNameLength = SHORT_NAME_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly nameLength = NAME_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
  // inputs
  public readonly i18n = input.required<CategoryI18n>();
  public formData = model.required<CategoryListModel>();
  public currentUser = input<UserModel>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public hasAbbreviation = input<boolean>(false);
  public allTags = input.required<string>();
  public tenants = input.required<string>();
  public readOnly = input(true);
  /** items that code looks up by name: no remove icon */
  public protectedNames = input<readonly string[]>([]);
  /** protected items the list lacks; the form is not valid until they are added back */
  public missingProtected = input<readonly string[]>([]);
  /** removed items that a switched-on block still offers (warning only, never blocks) */
  public removalWarnings = input<readonly string[]>([]);
  /** shared lists and copies of system lists: name, i18n scope and translateItems stay as they are */
  public lockedIdentity = input(false);
  protected readonly warningColor = ColorIonic.Warning;
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // The suite needs tenants and tags, which validateVestTree does not pass — so the bridge
  // calls it through a closure that adds them.
  private readonly suiteWithContext = (model: CategoryListModel) =>
    categoryListValidations(model, this.tenants(), this.allTags(), this.missingProtected());
  protected readonly categoryForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));

  constructor() {
    effect(() => this.valid.emit(this.categoryForm().valid()));
  }

  // per-field errors for the notes under each field
  private readonly validationResult = vestErrors(this.categoryForm);
  protected translateItemsErrors = computed(() => this.validationResult().getErrors('translateItems'));
  protected notesErrors = computed(() => this.validationResult().getErrors('notes'));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected itemsErrors = computed(() => this.validationResult().getErrors('items'));
  protected i18nScopeErrors = computed(() => this.validationResult().getErrors('i18n'));

  protected warningKey(itemName: string): string {
    return `@category/feature.items.warning.${itemName}`;
  }
  protected readonly identityReadOnly = computed(() => this.isReadOnly() || this.lockedIdentity());

  // fields
  protected name = computed(() => this.formData().name ?? DEFAULT_NAME);
  protected i18nScope = computed(() => this.formData().i18n ?? '');
  protected notes = computed(() => this.formData().notes ?? DEFAULT_NOTES);
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected items = computed(() => this.formData().items ?? []);
  protected translateItems = computed(() => this.formData().translateItems ?? false);
  protected okey = computed(() => this.formData().okey ?? '');
  /** membership categories are price lists (the fee schedule reads them); any list that already carries a price stays editable */
  protected hasPrice = computed(() => this.name().startsWith('mcat') || this.items().some(item => (item.price ?? 0) > 0));

  protected okeyI18n = computed(() => ({
    name: 'okey',
    label: this.i18n().okey_label(),
    placeholder: this.i18n().okey_placeholder(),
    helper: this.i18n().okey_helper()
  } as TextInputI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected i18nScopeI18n = computed(() => ({
    name: 'i18n',
    label: this.i18n().i18nScope_label(),
    placeholder: this.i18n().i18nScope_placeholder(),
    helper: this.i18n().i18nScope_helper()
  } as TextInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes',
    label: this.i18n().notes_label(),
    placeholder: this.i18n().notes_placeholder()
  } as TextareaInputI18n));

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
