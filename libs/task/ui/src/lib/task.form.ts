import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { LONG_NAME_LENGTH } from '@bk2/shared-constants';
import { CategoryListModel, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, DateInputComponent, ErrorNoteComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors } from '@bk2/shared-util-core';

import { TaskFormModel, taskFormModelShape, taskFormValidations } from '@bk2/task-util';

@Component({
  selector: 'bk-task-form',
  standalone: true,
  imports: [
    vestForms,
    DateInputComponent, CategorySelectComponent,
    TextInputComponent, ErrorNoteComponent,
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
              <bk-text-input name="name" [value]="name()" [maxLength]="nameLength" [autofocus]="true" [readOnly]="readOnly()" [copyable]="true" (changed)="onChange('name', $event)" /> 
              <bk-error-note [errors]="nameErrors()" />                                                                               
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-date-input name="dueDate" [storeDate]="dueDate()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('dueDate', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-date-input name="completionDate" [storeDate]="completionDate()" [readOnly]="readOnly()" [showHelper]=true (changed)="onChange('completionDate', $event)" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="states()!" selectedItemName="state()" [readOnly]="readOnly()" [withAll]="false" (changed)="onChange('taskState', $event)" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="priorities()!" selectedItemName="priority()" [readOnly]="readOnly()" [withAll]="false" (changed)="onChange('priority', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="importances()!" selectedItemName="importance()" [readOnly]="readOnly()" [withAll]="false" (changed)="onChange('importance', $event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  </form>
`
})
export class TaskFormComponent {
  public vm = model.required<TaskFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly states = input.required<CategoryListModel>();
  public readonly priorities = input.required<CategoryListModel>();
  public readonly importances = input.required<CategoryListModel>();
  public readOnly = input.required<boolean>();
  
  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  protected readonly suite = taskFormValidations;
  protected readonly shape = taskFormModelShape;

  protected name = computed(() => this.vm().name);
  protected dueDate = computed(() => this.vm().dueDate);
  protected completionDate = computed(() => this.vm().completionDate);
  protected state = computed(() => this.vm().state);
  protected priority = computed(() => this.vm().priority);
  protected importance = computed(() => this.vm().importance);
  private readonly validationResult = computed(() => taskFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  protected nameLength = LONG_NAME_LENGTH;

  protected onValueChange(value: TaskFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('TaskForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
}