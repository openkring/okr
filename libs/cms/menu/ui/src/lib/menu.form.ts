import { Component, computed, input, linkedSignal, model, output, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_MENU_ACTION, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ROLE, DEFAULT_TAGS, DEFAULT_URL, NAME_LENGTH } from '@bk2/shared-constants';
import { BaseProperty, CategoryListModel, MenuItemModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelect, Chips, ErrorNote, NotesInput, NotesInputI18n, StringList, TextInput, TextInputI18n, UrlInput, UrlInputI18n, IconInput } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';

import { MenuI18n, menuItemValidations } from '@bk2/cms-menu-util';

@Component({
  selector: 'bk-menu-item-form',
  standalone: true,
  imports: [
    vestForms, FormsModule,
    TextInput, UrlInput, CategorySelect, Chips, NotesInput, StringList, ErrorNote,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent,
    IconInput
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
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [autofocus]="true" [maxLength]="nameLength" [readOnly]="isReadOnly()" [showHelper]=true />
                <bk-error-note [errors]="nameErrors()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="types()!" [selectedItemName]="menuAction()" (selectedItemNameChange)="onFieldChange('action', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>

            @if(menuAction() === 'navigate' || menuAction() === 'browse' || menuAction() === 'call') {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-icon-input [i18n]="iconI18n()" [icon]="icon()" (iconChange)="onFieldChange('icon', $event)" (selectClicked)="iconSelectClicked.emit()" [readOnly]="isReadOnly()" />
                </ion-col>

                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="labelErrors()" />
                </ion-col>

                <ion-col size="12">
                  <bk-url [i18n]="urlI18n()"
                    [value]="url()" (valueChange)="onFieldChange('url', $event)"
                    [readOnly]="isReadOnly()"
                  />
                  <bk-error-note [errors]="urlErrors()" />
                </ion-col>
              </ion-row>
            }

            @if(menuAction() === 'sub') {
              <ion-row>
                <ion-col size="12">
                  <bk-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="labelErrors()" />
                </ion-col>
              </ion-row>
            }

            @if(menuAction() !== 'main') {
              <ion-row>
                <ion-col size="12">
                  <bk-cat-select [category]="roles()!" [selectedItemName]="roleNeeded()" (selectedItemNameChange)="onFieldChange('roleNeeded', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

<!--
      currently not needed
      @if(menuAction() === 'navigate' || menuAction() === 'browse' || menuAction() === 'call') {
        <bk-property-list [properties]="data()" (propertiesChange)="onFieldChange('data', $event)" />
      } -->

      <!-- sub-/context-menus -->
      @if(menuAction() === 'main' || menuAction() === 'context' || menuAction() === 'sub') {
        <bk-strings
          [strings]="menuItems()" (stringsChange)="onFieldChange('menuItems', $event)"
          [title]="i18n().submenus()"
          [add]="i18n().add_submenu()"
          [readOnly]="isReadOnly()"
        />
      }

      @if(hasRole('contentAdmin')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('contentAdmin')) {
        <bk-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
`
})
export class MenuForm {
  // inputs
  public readonly formData = model.required<MenuItemModel>();
  public readonly types = input.required<CategoryListModel>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly currentUser = input.required<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // i18n
  public readonly i18n = input.required<MenuI18n>();

  protected nameI18n = computed(() => ({
    name: 'name', label: this.i18n().name_label(), placeholder: this.i18n().name_placeholder(), helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected labelI18n = computed(() => ({
    name: 'label', label: this.i18n().label_label(), placeholder: this.i18n().label_placeholder(), helper: this.i18n().label_helper()
  } as TextInputI18n));

  protected iconI18n = computed(() => ({
    name: 'icon', label: this.i18n().icon_label(), placeholder: this.i18n().icon_placeholder(), helper: this.i18n().icon_helper()
  } as TextInputI18n));

  protected descriptionI18n = computed(() => ({
    name: 'description', label: this.i18n().description_label(), placeholder: this.i18n().description_placeholder()
  } as NotesInputI18n));

  protected urlI18n = computed(() => ({
    name: 'url',
    label: this.i18n().url_label(),
    placeholder: this.i18n().url_placeholder(),
    helper: this.i18n().url_helper(),
  } as UrlInputI18n));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public iconSelectClicked = output();

  // validation and errors
  protected readonly suite = menuItemValidations;
  private readonly validationResult = computed(() => menuItemValidations(this.formData(), this.tenantId(), this.allTags()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected iconErrors = computed(() => this.validationResult().getErrors('icon'));
  protected labelErrors = computed(() => this.validationResult().getErrors('label'));
  protected urlErrors = computed(() => this.validationResult().getErrors('url'));

  // fields
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);
  protected icon = linkedSignal(() => this.formData().icon ?? '');
  protected label = linkedSignal(() => this.formData().label ?? '');
  protected url = linkedSignal(() => this.formData().url ?? DEFAULT_URL);
  protected data = linkedSignal(() => this.formData().data ?? []);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected description = linkedSignal(() => this.formData().description ?? DEFAULT_NOTES);
  protected roleNeeded = linkedSignal(() => this.formData().roleNeeded ?? DEFAULT_ROLE);
  protected menuAction = linkedSignal(() => this.formData().action ?? DEFAULT_MENU_ACTION);
  protected menuItems = linkedSignal(() => this.formData().menuItems ?? []);

  // passing constants to template
  protected nameLength = NAME_LENGTH;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | BaseProperty[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: MenuItemModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('MenuItemForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('MenuItemForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
