import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_NOTES, DEFAULT_TAGS, LONG_NAME_LENGTH } from '@bk2/shared-constants';
import { CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, ErrorNoteComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { TASK_FORM_SHAPE, TaskFormModel, taskFormValidations } from '@bk2/task-util';

@Component({
  selector: 'bk-task-form',
  standalone: true,
  imports: [
    vestForms,
    DateInputComponent, CategorySelectComponent, ChipsComponent, NotesInputComponent,
    TextInputComponent, ErrorNoteComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
],
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
              <bk-text-input name="name" [value]="name()" [maxLength]="nameLength" [autofocus]="true" [readOnly]="isReadOnly()" [copyable]="true" (changed)="onFieldChange('name', $event)" /> 
              <bk-error-note [errors]="nameErrors()" />                                                                               
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-date-input name="dueDate" [storeDate]="dueDate()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('dueDate', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-date-input name="completionDate" [storeDate]="completionDate()" [readOnly]="isReadOnly()" [showHelper]=true (changed)="onFieldChange('completionDate', $event)" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="states()!" selectedItemName="state()" [readOnly]="isReadOnly()" [withAll]="false" (changed)="onFieldChange('taskState', $event)" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="priorities()!" selectedItemName="priority()" [readOnly]="isReadOnly()" [withAll]="false" (changed)="onFieldChange('priority', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="importances()!" selectedItemName="importance()" [readOnly]="isReadOnly()" [withAll]="false" (changed)="onFieldChange('importance', $event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />
    }
  
    @if(hasRole('admin')) {
      <bk-notes [value]="notes()" [readOnly]="isReadOnly()" (changed)="onFieldChange('notes', $event)" />
    }
  </form>
`
})
export class TaskFormComponent {
  // inputs
  public formData = model.required<TaskFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly allTags = input.required<string>();
  public readonly states = input.required<CategoryListModel>();
  public readonly priorities = input.required<CategoryListModel>();
  public readonly importances = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = taskFormValidations;
  protected readonly shape = TASK_FORM_SHAPE;
  private readonly validationResult = computed(() => taskFormValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected name = computed(() => this.formData().name);
  protected dueDate = computed(() => this.formData().dueDate);
  protected completionDate = computed(() => this.formData().completionDate);
  protected state = computed(() => this.formData().state);
  protected priority = computed(() => this.formData().priority);
  protected importance = computed(() => this.formData().importance);
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.formData().notes ?? DEFAULT_NOTES);

  // passing constants to template
  protected nameLength = LONG_NAME_LENGTH;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: TaskFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('TaskForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('ResourceForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}