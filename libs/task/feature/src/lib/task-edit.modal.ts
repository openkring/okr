import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';

import { LowercaseWordMask } from '@okr/shared-config';
import { CategoryListModel, TaskModel, TaskModelName, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header, StringList } from '@okr/shared-ui';
import { coerceBoolean, hasRole, newAvatarInfo, safeStructuredClone } from '@okr/shared-util-core';

import { CommentsAccordion } from '@okr/comment-feature';
import { TaskForm } from '@okr/task-ui';
import { AvatarSelect } from '@okr/avatar-ui';
import { dismissOverlay, navigateByUrl } from '@okr/shared-util-angular';

import { TaskStore } from './task.store';

@Component({
  selector: 'okr-task-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, TaskForm, CommentsAccordion,
    AvatarSelect, StringList,
    IonContent, IonAccordionGroup
  ],
  providers: [TaskStore],
  template: `
    <!-- the advanced-settings toggle lives in the toolbar, left of the close button -->
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true"
      actionIcon="toggle" [actionTitle]="store.i18n.form_advanced_label()"
      (actionClicked)="showAdvanced.set(!showAdvanced())" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <okr-task-form
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
          [(showAdvanced)]="showAdvanced"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (relatedClicked)="openRelated($event)"
        />
      }

      @if(showAdvanced()) {
        <okr-avatar-select
          name="assignee"
          [title]="store.i18n.assignee()"
          [note]="store.i18n.assignee_description()"
          [avatar]="assignee()"
          [readOnly]="isReadOnly()"
          (selectClicked)="selectPerson('assignee')"
        />

        <okr-avatar-select
          name="author"
          [title]="store.i18n.author()"
          [note]="store.i18n.author_description()"
          [avatar]="author()"
          [readOnly]="isReadOnly() || !canPickAuthor()"
          (selectClicked)="selectPerson('author')"
          />

        <okr-strings
          [strings]="calendars()"
          (stringsChange)="onFieldChange('calendars', $event)"
          [mask]="calendarMask"
          [maxLength]="20"
          [readOnly]="isReadOnly()"
          [title]="store.i18n.calendarName_label()"
          [description]="store.i18n.calendarName_description()"
          [add]="store.i18n.calendarName_addLabel()" />
      }

      <!-- Commenting is NOT part of editing the task: a viewer may always answer a
           Schadenmeldung, so the accordion is open and its add button enabled even in
           view mode ([readOnly]=false, independent of the form's own readOnly). -->
      <!-- a new task has no okey yet: comments would attach to the dangling key 'task.' -->
      @if(!isNew()) {
        <ion-accordion-group value="comments">
          <okr-comments-accordion [parentKey]="parentKey()" [readOnly]="false" />
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class TaskEditModal {
  private readonly modalController = inject(ModalController);
  private readonly router = inject(Router);
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
  protected isNew = computed(() => (this.task().okey ?? '').length === 0);
  // shared with the form; drives name, author + calendars here. A new task opens expanded: the
  // simplified view shows the name only as a title, so an empty new task could not be named.
  protected showAdvanced = linkedSignal(() => this.isNew());

  // derived
  protected headerTitle = computed(() => this.store.getTitleLabel(this.isReadOnly(), this.task().okey, ));
  protected readonly parentKey = computed(() => `${TaskModelName}.${this.task().okey}`);
  protected calendars = linkedSignal(() => (this.formData()?.calendars ?? []) as string[]);
  // no fallback to the current user: an empty author/assignee must look empty, since that is what is saved
  protected author = computed(() => this.formData()?.author);
  protected assignee = computed(() => this.formData()?.assignee);
  // The create rule denies setting an author other than yourself unless privileged (spec 1.72
  // §4); the author picker must not offer what the rules would reject. `hasRole('privileged', …)`
  // also covers admin (see auth.util.ts).
  protected canPickAuthor = computed(() => hasRole('privileged', this.currentUser()));
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  // passing constants to template
  protected calendarMask = LowercaseWordMask;

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');  
  }

  /** Leave the modal for the record this task was opened for (its `relatedKey` back-link). */
  protected async openRelated(url: string): Promise<void> {
    if (!url) return;
    await dismissOverlay(this.modalController);
    await navigateByUrl(this.router, url);
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
    const avatar = newAvatarInfo(person.okey, person.firstName, person.lastName, 'person', person.gender, '', '');
    this.formData.update((vm) => {
      if (!vm) return vm;
      return ({...vm, [type]: avatar });
    });      
    this.formDirty.set(true);
  }
}
