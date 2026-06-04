import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';

import { LowercaseWordMask } from '@bk2/shared-config';
import { CategoryListModel, PersonModel, RoleName, TaskModel, TaskModelName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header, StringList } from '@bk2/shared-ui';
import { coerceBoolean, hasRole, newAvatarInfo, safeStructuredClone } from '@bk2/shared-util-core';

import { CommentsAccordion } from '@bk2/comment-feature';
import { TaskForm } from '@bk2/task-ui';
import { AvatarSelect } from '@bk2/avatar-ui';

import { TaskStore } from './task.store';

@Component({
  selector: 'bk-task-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, TaskForm, CommentsAccordion,
    AvatarSelect, StringList,
    IonContent, IonAccordionGroup
  ],
  providers: [TaskStore],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-task-form
          [i18n]="store.i18n"
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [showForm]="showForm()"
          [allTags]="tags()"
          [tenantId]="tenantId()"
          [states]="states()"
          [priorities]="priorities()"
          [importances]="importances()"
          [readOnly]="isReadOnly()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }

      <bk-avatar-select name="assignee" [avatar]="assignee()" [readOnly]="isReadOnly()" (selectClicked)="selectPerson('assignee')" />
      <bk-avatar-select name="author" [avatar]="author()" [readOnly]="isReadOnly()" (selectClicked)="selectPerson('author')" />

      <bk-strings
        [strings]="calendars()"
        (stringsChange)="onFieldChange('calendars', $event)"
        [mask]="calendarMask"
        [maxLength]="20"
        [readOnly]="readOnly()"
        [title]="store.i18n.calendarName_label()"
        [description]="store.i18n.calendarName_description()"
        [add]="store.i18n.calendarName_addLabel()" />

      @if(hasRole('privileged') || hasRole('eventAdmin')) {
        <ion-accordion-group value="comments">
          <bk-comments-accordion [parentKey]="parentKey()" />
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class TaskEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(TaskStore);

  // inputs
  public task = input.required<TaskModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly tags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly states = input.required<CategoryListModel>();
  public readonly priorities = input.required<CategoryListModel>();
  public readonly importances = input.required<CategoryListModel>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.task()));
  protected showForm = signal(true);

  // derived
  protected defaultAvatar = computed(() => newAvatarInfo(this.currentUser()!.personKey, this.currentUser()!.firstName, this.currentUser()!.lastName, 'person', '', '', ''));
  protected headerTitle = computed(() => this.store.getTitleLabel(this.isReadOnly(), this.task().bkey, ));
  protected readonly parentKey = computed(() => `${TaskModelName}.${this.task().bkey}`);
  protected calendars = linkedSignal(() => (this.formData()?.calendars ?? []) as string[]);
  protected author = linkedSignal(() => this.formData()?.author ?? this.defaultAvatar());
  protected assignee = linkedSignal(() => this.formData()?.assignee ?? this.defaultAvatar());
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  // passing constants to template
  protected calendarMask = LowercaseWordMask;

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.task()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.formDirty.set(true);
    this.formData.update((vm: TaskModel | undefined) => {
      if (!vm) return vm;
      return { ...vm, [fieldName]: fieldValue };
    });      
  }

  protected onFormDataChange(formData: TaskModel): void {
    this.formData.set(formData);
  }

  protected async selectPerson(type: 'author' | 'assignee'): Promise<void> {
    const person = await this.store.selectPerson();
    if (!person) return;
    const avatar = newAvatarInfo(person.bkey, person.firstName, person.lastName, 'person', person.gender, '', '');
    this.formData.update((vm) => {
      if (!vm) return vm;
      return ({...vm, [type]: avatar });
    });      
    this.formDirty.set(true);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
