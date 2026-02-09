import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';

import { ENV, LowercaseWordMask } from '@bk2/shared-config';
import { AvatarInfo, CategoryListModel, GroupModel, PersonModel, RoleName, TaskModel, TaskModelName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent, StringsComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole, isGroup, isPerson, newAvatarInfo, safeStructuredClone } from '@bk2/shared-util-core';

import { CommentsAccordionComponent } from '@bk2/comment-feature';

import { TaskFormComponent } from '@bk2/task-ui';
import { getTitleLabel } from '@bk2/shared-util-angular';
import { GroupSelectModalComponent, PersonSelectModalComponent } from '@bk2/shared-feature';
import { AvatarSelectComponent } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-task-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, TaskFormComponent, CommentsAccordionComponent,
    AvatarSelectComponent, StringsComponent,
    IonContent, IonAccordionGroup
  ],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-task-form
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
      <bk-avatar-select name="scope" [avatar]="scope()" [readOnly]="isReadOnly()" (selectClicked)="selectGroup()" />    

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
  private readonly env = inject(ENV);

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
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => safeStructuredClone(this.task()));
  protected showForm = signal(true);

  // derived signals
  protected defaultAvatar = computed(() => newAvatarInfo(this.currentUser()!.personKey, this.currentUser()!.firstName, this.currentUser()!.lastName, 'person', '', '', ''));  
  protected headerTitle = computed(() => getTitleLabel('task', this.task().bkey, this.isReadOnly()));
  protected readonly parentKey = computed(() => `${TaskModelName}.${this.task().bkey}`);
  protected calendars = linkedSignal(() => (this.formData()?.calendars ?? []) as string[]);
  protected author = linkedSignal(() => this.formData()?.author ?? this.defaultAvatar());
  protected assignee = linkedSignal(() => this.formData()?.assignee ?? this.defaultAvatar());
  protected scope = linkedSignal(() => this.formData()?.scope);

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
    const person = await this.selectPersonModal();
    if (!person) return;
    const avatar = newAvatarInfo(person.bkey, person.firstName, person.lastName, 'person', person.gender, '', '');
    this.formData.update((vm) => {
      if (!vm) return vm;
      return ({...vm, [type]: avatar });
    });      
    this.formDirty.set(true);
  }

  async selectPersonModal(): Promise<PersonModel | undefined> {
    const modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      if (isPerson(data, this.env.tenantId)) {
        return data;
      }
    }
    return undefined;
  }

  protected async selectGroup(): Promise<void> {
    const group = await this.selectGroupModal();
    if (!group) return;
    const avatar = newAvatarInfo(group.bkey, '', group.name, 'group', '', '', '');
    this.formData.update((vm) => {
      if (!vm) return vm;
      return ({...vm, scope: avatar });
    });      
    this.formDirty.set(true);
  }

  async selectGroupModal(): Promise<GroupModel | undefined> {
    const modal = await this.modalController.create({
      component: GroupSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      if (isGroup(data, this.env.tenantId)) {
        return data;
      }
    }
    return undefined;
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
