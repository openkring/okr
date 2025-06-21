import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { AvatarSelectComponent, ChangeConfirmationComponent, ChipsComponent, HeaderComponent, StringsComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { TaskCollection, TaskModel } from '@bk2/shared/models';
import { LowercaseWordMask, RoleName } from '@bk2/shared/config';
import { debugFormModel, hasRole } from '@bk2/shared/util';

import { CommentsAccordionComponent } from '@bk2/comment/feature';

import { TaskFormComponent } from '@bk2/task/ui';
import { convertFormToTask, convertTaskToForm, TaskFormModel, taskFormValidations } from '@bk2/task/util';
import { TaskEditStore } from './task-edit.store';

@Component({
  selector: 'bk-task-edit-modal',
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, ChangeConfirmationComponent, TaskFormComponent, CommentsAccordionComponent,
    AvatarSelectComponent, ChipsComponent, StringsComponent,
    IonContent, IonAccordionGroup
  ],
  providers: [TaskEditStore],
  template: `
    <bk-header title="{{ '@task.operation.update.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-task-form [(vm)]="vm" 
        [currentUser]="taskEditStore.currentUser()" 
        [taskTags]="taskTags()" 
        (validChange)="formIsValid.set($event)" />

      <!-- <bk-editor [(content)]="notes" [readOnly]="false" /> -->

      <bk-avatar-select title="@task.field.author" [avatarUrl]="authorUrl()" [name]="authorName()" [readOnly]="true" />
      <bk-avatar-select title="@task.field.assignee" [avatarUrl]="assigneeUrl()" [name]="assigneeName()" (selectClicked)="select()" />
      <bk-avatar-select title="@task.field.scope" [avatarUrl]="scopeUrl()" [name]="scopeName()" (selectClicked)="select()" />    

      @if(hasRole('privileged')) {
        <bk-strings (changed)="onChange('calendars', $event)"
          [strings]="calendars()" 
          [mask]="calendarMask" 
          [maxLength]="20" 
          title="@input.calendarName.label"
          description="@input.calendarName.description"
          addLabel="@input.calendarName.addLabel" />    

        <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="taskTags()" (changed)="onChange('tags', $event)" />
      }
      @if(hasRole('privileged') || hasRole('eventAdmin')) {
        <ion-accordion-group value="comments">
          <bk-comments-accordion [collectionName]="collectionName" [parentKey]="key()" />
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class TaskEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly taskEditStore = inject(TaskEditStore);

  public task = input.required<TaskModel>();
  
  public vm = linkedSignal(() => convertTaskToForm(this.task()));
  protected key = computed(() => this.task().bkey);
  protected calendars = computed(() => this.vm().calendars);
  protected tags = computed(() => this.vm().tags);
  protected notes = linkedSignal(() => this.vm().notes);

  protected taskTags = computed(() => this.taskEditStore.tags());
  protected currentUser = computed(() => this.taskEditStore.currentUser());
  // author
  protected authorUrl = computed(() => this.taskEditStore.authorUrl() ?? '');
  protected authorName = computed(() => this.taskEditStore.authorName());

  // assignee
  protected assigneeUrl = computed(() => this.taskEditStore.assigneeUrl() ?? '');
  protected assigneeName = computed(() => this.taskEditStore.assigneeName());

  // scope
  protected scopeUrl = computed(() => this.taskEditStore.scopeUrl() ?? '');
  protected scopeName = computed(() => this.taskEditStore.scopeName());

  private readonly validationResult = computed(() => taskFormValidations(this.vm()));

  protected formIsValid = signal(false);
  protected collectionName = TaskCollection;
  protected calendarMask = LowercaseWordMask;

  constructor() {
    effect(() => {
      this.taskEditStore.setAuthor(this.task().author);
      this.taskEditStore.setAssignee(this.task().assignee);
      this.taskEditStore.setScope(this.task().scope);
    });
  }

  protected select(): void {
    console.log('select clicked');
  }

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToTask(this.task(), this.vm(), this.taskEditStore.tenantId()), 'confirm');
  }

  protected onChange(fieldName: string, $event: string | string[]): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormModel<TaskFormModel>('TaskFormModel', this.vm(), this.currentUser());
    this.formIsValid.set(this.validationResult().isValid());
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.taskEditStore.currentUser());
  }
}
