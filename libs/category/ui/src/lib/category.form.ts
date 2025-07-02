import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CategoryItemsComponent, CheckboxComponent, ChipsComponent, ErrorNoteComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared/ui';
import { CategoryItemModel, UserModel, RoleName } from '@bk2/shared/models';
import { hasRole } from '@bk2/shared/util-core';
import { CategoryListFormModel, categoryListFormModelShape, categoryListFormValidations } from '@bk2/category/util';

@Component({
  selector: 'bk-category-list-form',
  imports: [
    vestForms,
    ChipsComponent, NotesInputComponent,
    TextInputComponent, ChipsComponent, ErrorNoteComponent, CategoryItemsComponent, CheckboxComponent,
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
            <ion-col size="12">
              <bk-text-input name="name" [value]="name()" [autofocus]="true" [copyable]="true" (changed)="onChange('name', $event)" /> 
              <bk-error-note [errors]="nameErrors()" />                                                                               
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-text-input name="i18nBase" [value]="i18nBase()" [showHelper]="true" (changed)="onChange('i18nBase', $event)" /> 
              <bk-error-note [errors]="i18nBaseErrors()" />                                                                               
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="translateItems" [isChecked]="translateItems()" [showHelper]="true" (changed)="onChange('translateItems', $event)"/>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <bk-category-items [items]="items()" (changed)="onChange('items', $event)" />

    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="categoryTags()" (changed)="onChange('tags', $event)" />
    }

    @if(hasRole('admin')) {
      <bk-notes [value]="notes()" (changed)="onChange('notes', $event)" />
    }
  </form>
`
})
export class CategoryListFormComponent {
  public vm = model.required<CategoryListFormModel>();
  public currentUser = input<UserModel | undefined>();
  public categoryTags = input.required<string>();
  
  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  protected readonly suite = categoryListFormValidations;
  protected readonly shape = categoryListFormModelShape;

  protected name = computed(() => this.vm().name ?? '');
  protected i18nBase = computed(() => this.vm().i18nBase ?? '');
  protected notes = computed(() => this.vm().notes ?? '');
  protected tags = computed(() => this.vm().tags ?? '');
  protected items = computed(() => this.vm().items ?? []);
  protected translateItems = computed(() => this.vm().translateItems ?? false);

  private readonly validationResult = computed(() => categoryListFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected i18nBaseErrors = computed(() => this.validationResult().getErrors('i18nBase'));
    
  protected onValueChange(value: CategoryListFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | CategoryItemModel[] | boolean): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    console.log(this.validationResult().errors)
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}