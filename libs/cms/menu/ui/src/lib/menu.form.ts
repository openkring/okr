import { Component, computed, input, linkedSignal, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_MENU_ACTION, DEFAULT_ROLE, NAME_LENGTH } from '@bk2/shared-constants';
import { BaseProperty, CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, ErrorNoteComponent, NotesInputComponent, PropertyListComponent, StringsComponent, TextInputComponent, UrlInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { MenuItemFormModel, menuItemFormModelShape, menuItemFormValidation } from '@bk2/cms-menu-util';


@Component({
  selector: 'bk-menu-item-form',
  standalone: true,
  imports: [
    vestForms, FormsModule,
    TextInputComponent, UrlInputComponent, CategorySelectComponent, ChipsComponent, NotesInputComponent, 
    StringsComponent, PropertyListComponent, ErrorNoteComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite"
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">

    <ion-card>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-text-input name="name" [value]="name()" [autofocus]="true" [maxLength]="nameLength" [readOnly]="readOnly()" [showHelper]=true (changed)="onChange('name', $event)" />
              <bk-error-note [errors]="nameErrors()" />                                        
            </ion-col>

            <ion-col size="12" size-md="6"> 
              <bk-cat-select [category]="type()!" [selectedItemName]="menuAction()" [withAll]="false" [readOnly]="readOnly()" (changed)="onChange('action', $event)" />
            </ion-col>
          </ion-row>

          @if(menuAction() === 'navigate' || menuAction() === 'browse' || menuAction() === 'call') {
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input name="icon" [value]="icon()" [maxLength]="nameLength" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('icon', $event)" />
                <bk-error-note [errors]="iconErrors()" />                                        
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input name="label" [value]="label()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('label', $event)" />
                <bk-error-note [errors]="labelErrors()" />                                        
              </ion-col>

              <ion-col size="12">
                <bk-url name="url" [value]="url()" [showHelper]=true (changed)="onChange('url', $event)" [readOnly]="readOnly()"  placeholder="@input.url.placeholder2" helper="@input.url.helper2" />
                <bk-error-note [errors]="urlErrors()" />                                        
              </ion-col>
            </ion-row>
          } 

          @if(menuAction() === 'sub') {
            <ion-row>
                <ion-col size="12">
                  <bk-text-input name="label" [value]="label()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('label', $event)" />
                  <bk-error-note [errors]="labelErrors()" />                                        
                </ion-col>
              </ion-row>
          }

          @if(menuAction() !== 'main') {
              <ion-row>
              <ion-col size="12">
                <bk-cat-select [category]="roles()!" selectedItemName="registered" [withAll]="false" [readOnly]="readOnly()" (changed)="onChange('roleNeeded', $event)" />
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>

    @if(menuAction() === 'navigate' || menuAction() === 'browse' || menuAction() === 'call') {
      <bk-property-list [propertyList]="data()" (changed)="onChange('propertyList', $event)" />
    }

    @if(menuAction() === 'main' || menuAction() === 'context' || menuAction() === 'sub') {
      <bk-strings (changed)="onChange('menuItems', $event)"
        [strings]="menuItems()"
        title="@input.menuItems.title"
        addLabel="@input.menuItems.addLabel"
        [readOnly]="readOnly()"
      />
    }

    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />
    }

    @if(hasRole('admin')) {
      <bk-notes name="description" [value]="description()" [readOnly]="readOnly()" (changed)="onChange('description', $event)"/>
    }
  </form>
`
})
export class MenuItemFormComponent {
  public readonly vm = model.required<MenuItemFormModel>();
  public readonly type = input.required<CategoryListModel>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly currentUser = input.required<UserModel | undefined>();
  public readonly allTags = input.required<string>();
  public readonly readOnly = input(true);
  
  protected name = computed(() => this.vm().name ?? '');
  protected icon = computed(() => this.vm().icon ?? '');
  protected label = computed(() => this.vm().label ?? '');
  protected url = computed(() => this.vm().url ?? '');
  protected data = computed(() => this.vm().data ?? []);
  protected tags = computed(() => this.vm().tags ?? '');
  protected description = computed(() => this.vm().description ?? '');
  protected roleNeeded = computed(() => this.vm().roleNeeded ?? DEFAULT_ROLE);
  protected menuAction = computed(() => this.vm().action ?? DEFAULT_MENU_ACTION);
  protected menuItems = linkedSignal(() => this.vm().menuItems ?? []);

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = menuItemFormValidation;
  protected readonly shape = menuItemFormModelShape;
  private readonly validationResult = computed(() => menuItemFormValidation(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected iconErrors = computed(() => this.validationResult().getErrors('icon'));
  protected labelErrors = computed(() => this.validationResult().getErrors('label'));
  protected urlErrors = computed(() => this.validationResult().getErrors('url'));

  protected nameLength = NAME_LENGTH;

  protected onValueChange(value: MenuItemFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | BaseProperty[]): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('MenuItemForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}