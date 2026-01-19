import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_NOTES, DEFAULT_TAGS, LONG_NAME_LENGTH } from '@bk2/shared-constants';
import { CategoryListModel, RoleName, TaskModel, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, ErrorNoteComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';

import { taskValidations } from '@bk2/task-util';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'bk-task-form',
  standalone: true,
  imports: [
    vestForms,
    TranslatePipe, AsyncPipe,
    DateInputComponent, CategorySelectComponent, ChipsComponent, NotesInputComponent,
    TextInputComponent, ErrorNoteComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonLabel, IonItem
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
                <bk-text-input name="name" [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]="nameLength" [autofocus]="true" [readOnly]="isReadOnly()" [copyable]="true" /> 
                <bk-error-note [errors]="nameErrors()" />                                                                               
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-date-input name="dueDate" [storeDate]="dueDate()" (storeDateChange)="onFieldChange('dueDate', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-date-input name="completionDate" [storeDate]="completionDate()" (storeDateChange)="onFieldChange('completionDate', $event)" [readOnly]="isReadOnly()" [showHelper]=true />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <ion-item lines="none">
                  <ion-label>{{ '@input.state.label' | translate | async}}:</ion-label>
                  <bk-cat-select [category]="states()!" [selectedItemName]="state()" (selectedItemNameChange)="onFieldChange('state', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <ion-item lines="none">
                  <ion-label>{{ '@input.priority.label' | translate | async}}:</ion-label>
                  <bk-cat-select [category]="priorities()!" [selectedItemName]="priority()" (selectedItemNameChange)="onFieldChange('priority', $event)" [readOnly]="isReadOnly()" [withAll]="false" /> 
                </ion-item>
              </ion-col>
              <ion-col size="12" size-md="6">
                <ion-item lines="none">
                  <ion-label>{{ '@input.importance.label' | translate | async}}:</ion-label>
                  <bk-cat-select [category]="importances()!" [selectedItemName]="importance()" (selectedItemNameChange)="onFieldChange('importance', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
                </ion-item>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged') || hasRole('eventAdmin')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }
    
      @if(hasRole('admin')) {
        <bk-notes [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
`
})
export class TaskFormComponent {
  // inputs
  public readonly formData = model.required<TaskModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly states = input.required<CategoryListModel>();
  public readonly priorities = input.required<CategoryListModel>();
  public readonly importances = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = taskValidations;
  private readonly validationResult = computed(() => taskValidations(this.formData(), this.tenantId(), this.allTags()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected name = linkedSignal(() => this.formData().name);
  protected dueDate = linkedSignal(() => this.formData().dueDate);
  protected completionDate = linkedSignal(() => this.formData().completionDate);
  protected state = linkedSignal(() => this.formData().state);
  protected priority = linkedSignal(() => this.formData().priority);
  protected importance = linkedSignal(() => this.formData().importance);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);

  // passing constants to template
  protected nameLength = LONG_NAME_LENGTH;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    console.log('TaskForm.onFieldChange', fieldName, fieldValue);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: TaskModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('TaskForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('TaskForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}