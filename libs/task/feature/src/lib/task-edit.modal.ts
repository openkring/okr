import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';

import { LowercaseWordMask } from '@bk2/shared-config';
import { RoleName, TaskModel, TaskModelName } from '@bk2/shared-models';
import { AvatarSelectComponent, ChangeConfirmationComponent, HeaderComponent, StringsComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';

import { CommentsAccordionComponent } from '@bk2/comment-feature';

import { TaskFormComponent } from '@bk2/task-ui';
import { TaskEditStore } from './task-edit.store';
import { getTitleLabel } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-task-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, TaskFormComponent, CommentsAccordionComponent,
    AvatarSelectComponent, StringsComponent,
    IonContent, IonAccordionGroup
  ],
  providers: [TaskEditStore],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-task-form
        [formData]="formData()"
        [currentUser]="taskEditStore.currentUser()"
        [allTags]="tags()"
        [states]="states()"
        [priorities]="priorities()"
        [importances]="importances()"
        [readOnly]="isReadOnly()"
        (formDataChange)="onFormDataChange($event)"
      />

      <bk-avatar-select title="@task.field.author" [avatarUrl]="authorUrl()" [name]="authorName()" [readOnly]="isReadOnly()" />
      <bk-avatar-select title="@task.field.assignee" [avatarUrl]="assigneeUrl()" [name]="assigneeName()" [readOnly]="isReadOnly()" (selectClicked)="select()" />
      <bk-avatar-select title="@task.field.scope" [avatarUrl]="scopeUrl()" [name]="scopeName()" [readOnly]="isReadOnly()" (selectClicked)="select()" />    

      <bk-strings
        [strings]="calendars()"
        (stringsChange)="onFieldChange('calendars', $event)"
        [mask]="calendarMask" 
        [maxLength]="20"
        [readOnly]="readOnly()" 
        title="@input.calendarName.label"
        description="@input.calendarName.description"
        addLabel="@input.calendarName.addLabel" />    

      @if(hasRole('privileged') || hasRole('eventAdmin')) {
        <ion-accordion-group value="comments">
          <bk-comments-accordion [parentKey]="parentKey()" />
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class TaskEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly taskEditStore = inject(TaskEditStore);

  // inputs
  public task = input.required<TaskModel>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => structuredClone(this.task()));
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => getTitleLabel('task', this.task().bkey, this.isReadOnly()));
  protected readonly parentKey = computed(() => `${TaskModelName}.${this.task().bkey}`);
  protected calendars = linkedSignal(() => (this.formData().calendars ?? []) as string[]);
  protected states = computed(() => this.taskEditStore.appStore.getCategory('task_state'));
  protected priorities = computed(() => this.taskEditStore.appStore.getCategory('priority'));
  protected importances = computed(() => this.taskEditStore.appStore.getCategory('importance'));
  protected tags = computed(() => this.taskEditStore.tags());
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

  // passing constants to template
  protected calendarMask = LowercaseWordMask;

  constructor() {
    effect(() => {
      this.taskEditStore.setAuthor(this.task().author);
      this.taskEditStore.setAssignee(this.task().assignee);
      this.taskEditStore.setScope(this.task().scope);
    });
  }

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(structuredClone(this.task()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.formDirty.set(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormDataChange(formData: TaskModel): void {
    this.formData.set(formData);
  }

  protected select(): void {
    console.log('select clicked');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.taskEditStore.currentUser());
  }
}
