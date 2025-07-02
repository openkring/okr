import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CategoryComponent, DateInputComponent, ErrorNoteComponent, TextInputComponent } from '@bk2/shared/ui';
import { UserModel } from '@bk2/shared/models';
import { debugFormErrors } from '@bk2/shared/util-core';
import { Importances, Priorities, TaskStates } from '@bk2/shared/categories';
import { LONG_NAME_LENGTH } from '@bk2/shared/constants';

import { TaskFormModel, taskFormModelShape, taskFormValidations } from '@bk2/task/util';

@Component({
  selector: 'bk-task-form',
  imports: [
    vestForms,
    DateInputComponent, CategoryComponent,
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
              <bk-text-input name="name" [value]="name()" [maxLength]="nameLength" [autofocus]="true" [copyable]="true" (changed)="onChange('name', $event)" /> 
              <bk-error-note [errors]="nameErrors()" />                                                                               
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-date-input name="dueDate" [storeDate]="dueDate()" [showHelper]=true (changed)="onChange('dueDate', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-date-input name="completionDate" [storeDate]="completionDate()" [showHelper]=true (changed)="onChange('completionDate', $event)" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat name="taskState" [value]="taskState()" [categories]="taskStates" (changed)="onChange('taskState', $event)" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat name="priority" [value]="priority()" [categories]="priorities" (changed)="onChange('priority', $event)"/>
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="importance" [value]="importance()" [categories]="importances" (changed)="onChange('importance', $event)" />
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
  public readonly taskTags = input.required<string>();
  
  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  protected readonly suite = taskFormValidations;
  protected readonly shape = taskFormModelShape;

  protected name = computed(() => this.vm().name);
  protected dueDate = computed(() => this.vm().dueDate);
  protected completionDate = computed(() => this.vm().completionDate);
  protected taskState = computed(() => this.vm().state);
  protected priority = computed(() => this.vm().priority);
  protected importance = computed(() => this.vm().importance);
  private readonly validationResult = computed(() => taskFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  protected taskStates = TaskStates;
  protected priorities = Priorities;
  protected importances = Importances;
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