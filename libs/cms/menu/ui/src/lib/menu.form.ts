import { Component, computed, effect, input, linkedSignal, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_MENU_ACTION, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ROLE, DEFAULT_TAGS, DEFAULT_URL, NAME_LENGTH } from '@bk2/shared-constants';
import { BaseProperty, CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, ErrorNoteComponent, NotesInputComponent, PropertyListComponent, StringsComponent, TextInputComponent, UrlInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { MENU_ITEM_FORM_SHAPE, MenuItemFormModel, menuItemFormValidation } from '@bk2/cms-menu-util';


@Component({
  selector: 'bk-menu-item-form',
  standalone: true,
  imports: [
    vestForms, FormsModule,
    TextInputComponent, UrlInputComponent, CategorySelectComponent, ChipsComponent, NotesInputComponent, 
    StringsComponent, PropertyListComponent, ErrorNoteComponent,
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
            <ion-col size="12" size-md="6">
              <bk-text-input name="name" [value]="name()" [autofocus]="true" [maxLength]="nameLength" [readOnly]="isReadOnly()" [showHelper]=true (changed)="onFieldChange('name', $event)" />
              <bk-error-note [errors]="nameErrors()" />                                        
            </ion-col>

            <ion-col size="12" size-md="6"> 
              <bk-cat-select [category]="type()!" [selectedItemName]="menuAction()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('action', $event)" />
            </ion-col>
          </ion-row>

          @if(menuAction() === 'navigate' || menuAction() === 'browse' || menuAction() === 'call') {
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input name="icon" [value]="icon()" [maxLength]="nameLength" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('icon', $event)" />
                <bk-error-note [errors]="iconErrors()" />                                        
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input name="label" [value]="label()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('label', $event)" />
                <bk-error-note [errors]="labelErrors()" />                                        
              </ion-col>

              <ion-col size="12">
                <bk-url name="url" [value]="url()" [showHelper]=true (changed)="onFieldChange('url', $event)" [readOnly]="isReadOnly()"  placeholder="@input.url.placeholder2" helper="@input.url.helper2" />
                <bk-error-note [errors]="urlErrors()" />                                        
              </ion-col>
            </ion-row>
          } 

          @if(menuAction() === 'sub') {
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="label" [value]="label()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('label', $event)" />
                <bk-error-note [errors]="labelErrors()" />                                        
              </ion-col>
            </ion-row>
          }

          @if(menuAction() !== 'main') {
            <ion-row>
              <ion-col size="12">
                <bk-cat-select [category]="roles()!" selectedItemName="registered" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('roleNeeded', $event)" />
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>

    @if(menuAction() === 'navigate' || menuAction() === 'browse' || menuAction() === 'call') {
      <bk-property-list [propertyList]="data()" (changed)="onFieldChange('propertyList', $event)" />
    }

    @if(menuAction() === 'main' || menuAction() === 'context' || menuAction() === 'sub') {
      <bk-strings (changed)="onFieldChange('menuItems', $event)"
        [strings]="menuItems()"
        title="@input.menuItems.title"
        addLabel="@input.menuItems.addLabel"
        [readOnly]="isReadOnly()"
      />
    }

    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />
    }

    @if(hasRole('admin')) {
      <bk-notes name="description" [value]="description()" [readOnly]="isReadOnly()" (changed)="onFieldChange('description', $event)"/>
    }
  </form>
`
})
export class MenuItemFormComponent {
  // inputs
  public readonly formData = model.required<MenuItemFormModel>()
  public readonly type = input.required<CategoryListModel>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly currentUser = input.required<UserModel | undefined>();
  public readonly allTags = input.required<string>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = menuItemFormValidation;
  protected readonly shape = MENU_ITEM_FORM_SHAPE;
  private readonly validationResult = computed(() => menuItemFormValidation(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected iconErrors = computed(() => this.validationResult().getErrors('icon'));
  protected labelErrors = computed(() => this.validationResult().getErrors('label'));
  protected urlErrors = computed(() => this.validationResult().getErrors('url'));

  // fields
  protected name = computed(() => this.formData().name ?? DEFAULT_NAME);
  protected icon = computed(() => this.formData().icon ?? '');
  protected label = computed(() => this.formData().label ?? '');
  protected url = computed(() => this.formData().url ?? DEFAULT_URL);
  protected data = computed(() => this.formData().data ?? []);
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected description = computed(() => this.formData().description ?? DEFAULT_NOTES);
  protected roleNeeded = computed(() => this.formData().roleNeeded ?? DEFAULT_ROLE);
  protected menuAction = computed(() => this.formData().action ?? DEFAULT_MENU_ACTION);
  protected menuItems = linkedSignal(() => this.formData().menuItems ?? []);

  // passing constants to template
  protected nameLength = NAME_LENGTH;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: MenuItemFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('MenuItemForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, $event: string | string[] | number | BaseProperty[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('MenuItemForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}