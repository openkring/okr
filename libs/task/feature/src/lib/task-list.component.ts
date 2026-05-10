import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTextarea, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { PersonModel, RoleName, TaskModel } from '@bk2/shared-models';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error, QuickEntryService } from '@bk2/shared-util-angular';
import { convertDateFormatToString, DateFormat, getAvatarInfo, getCategoryIcon, hasRole } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';
import { TaskStore } from './task.store';

/**
 * Task items can be marked as done/completed by checking the checkbox.
 * isCompleted() is computed from the completion date (if it is set, the task is completed).
 * Task items can be manually archived with 'delete' button.
 * Quick entry accepts tag:[tag:] @assignedPerson //dueDate.
 * A notification is sent to the assigned person.
 * Later, a cloud function will automatically archive all completed task items after one day.
 * There is a list to see the current task items and one to see the archived ones (sorted by completion date).
 * Completed task items are added to the diary at the same date as the completion date.
 */
@Component({
  selector: 'bk-task-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, PrettyDatePipe, AvatarPipe,
    EmptyListComponent, ListFilterComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonList, IonAvatar, IonImg, IonTextarea, IonChip, IonPopover
  ],
  providers: [TaskStore],
  styles: [`
      ion-avatar { width: 30px; height: 30px; border: 2px solid white; transition: transform 0.2s ease; }
      ion-textarea { margin-top: 10px;}
      .name { min-width: 70% !important;}
      .tags { padding-right: 10px; }
    `],
  template: `
    <ion-header>
      <!-- title and actions -->
      <ion-toolbar [color]="color()">
        @if(showMenuButton()) {
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        }
        <ion-title>{{ selectedTasksCount()}}/{{tasksCount()}} {{ '@task.plural' | translate | async }}</ion-title>
        @if(canChange()) {
          <ion-buttons slot="end">
            <ion-button id="c-tasks">
              <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="c-tasks" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <bk-menu [menuName]="contextMenuName()" [forceVisible]="groupAdmin()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>

      <!-- quick entry -->
      @if(canChange()) {
        <ion-item lines="none">
          <ion-textarea #bkQuickEntry
            (keyup.enter)="quickEntry(bkQuickEntry)"
            (ionInput)="onQuickEntryInput(bkQuickEntry)"
            label = "{{'@input.taskQuickEntry.label' | translate | async }}"
            labelPlacement = "floating"
            placeholder = "{{'@input.taskQuickEntry.placeholder' | translate | async }}"
            [counter]="true"
            fill="outline"
            [maxlength]="1000"
            inputmode="text"
            type="text"
            [autoGrow]="true"
          >
          </ion-textarea>
          <ion-icon slot="end" src="{{'cancel' | svgIcon }}" (click)="clear(bkQuickEntry)" />
        </ion-item>
      }

      <!-- search and filters -->
      <bk-list-filter
        (searchTermChanged)="onSearchtermChange($event)"
        (tagChanged)="onTagSelected($event)" [tags]="tags()"
        (typeChanged)="onPrioritySelected($event)" [types]="priorities()"
        (stateChanged)="onStateSelected($event)" [states]="states()"
      />
    </ion-header>

  <!-- list data -->
  <ion-content #content>
      @if(selectedTasksCount() === 0) {
        <bk-empty-list message="@task.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(task of filteredTasks(); track $index) {
            <ion-item>
              <ion-icon src="{{ getIcon(task) | svgIcon }}"  (click)="toggleCompleted(task)" />
              @if(task.assignee !== undefined) {
                <ion-avatar>
                  <ion-img src="{{ task.assignee.modelType + '.' + task.assignee.key | avatar }}" alt="Avatar of the assigned person" />
                </ion-avatar>
              }
              <div class="tags ion-hide-md-down">
                @for (tag of task.tags.split(','); track tag) {
                  @if(tag.length > 0) {
                    <ion-chip color="primary">
                      <ion-label>{{ tag }}</ion-label>
                    </ion-chip>
                  }
                }
              </div>
              <ion-label class="name" (click)="showActions(task)">{{ task.name }}</ion-label>
              @if(task.dueDate.length > 0) {
                <ion-label class="ion-hide-md-down ion-text-end">
                  {{ task.dueDate | prettyDate }}
                </ion-label>
              }

                <!-- 
              keine gute Darstellung für Importance und Priority gefunden
              <ion-label class="ion-hide-md-down ion-text-end">
                 P:{{task.priority}} I:{{task.importance}}
                 P<ion-icon slot="start" src="{{getPriorityIcon(task) | svgIcon }}" />
              </ion-label> 
              <ion-label class="ion-hide-md-down ion-text-end">
                I<ion-icon slot="start" src="{{getImportanceIcon(task) | svgIcon }}" /> 
              </ion-label> 
              -->
            </ion-item>
          }
        </ion-list>
      }
  </ion-content>
    `
})
export class TaskListComponent {
  protected store = inject(TaskStore);
  private actionSheetController = inject(ActionSheetController);
  private readonly modalController = inject(ModalController);
  private readonly quickEntryService = inject(QuickEntryService);
  private selectedQuickEntryPerson = signal<PersonModel | null>(null);
  private isSettingQuickEntryValue = false;

  public listId = input.required<string>(); // all, my, calendarId
  public contextMenuName = input.required<string>();
  public color = input('secondary');
  public showMenuButton = input(true);
  public groupAdmin = input(false);

  // derived signals
  protected filteredTasks = computed(() => this.store.filteredTasks() ?? []);
  protected tasksCount = computed(() => this.store.tasksCount());
  protected selectedTasksCount = computed(() => this.filteredTasks().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.tags());
  protected priorities = computed(() => this.store.appStore.getCategory('priority'));
  protected importances = computed(() => this.store.appStore.getCategory('importance'));
  protected states = computed(() => this.store.appStore.getCategory('task_state'));
  protected currentUser = computed(() => this.store.appStore.currentUser());

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => {
      this.store.setCalendarName(this.listId());
    });
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  protected onPrioritySelected(priority: string): void {
    this.store.setSelectedPriority(priority);
  }

  protected onStateSelected(state: string): void {
    this.store.setSelectedState(state);
  }

  /******************************* getters *************************************** */
  public getIcon(task: TaskModel): string {
    return task.completionDate.length > 0 ? 'checkbox-circle' : 'circle';
  }

  protected getImportanceIcon(task: TaskModel): string {
    return getCategoryIcon(this.importances(), task.importance);
  }

  protected getPriorityIcon(task: TaskModel): string {
    return getCategoryIcon(this.priorities(), task.priority);
  }
  /******************************* actions *************************************** */
  /**
   * This is the quick entry. It just takes the name of the task and adds it to the list.
   * @param taskName 
   */
  protected async quickEntry(bkQuickEntry: IonTextarea): Promise<void> {
    const task = new TaskModel(this.store.tenantId());
    const rawValue = bkQuickEntry.value?.trim() ?? '';
    const tagMatch = rawValue.match(/:(\S+)/);
    task.tags = tagMatch ? tagMatch[1] : '';
    const dateMatch = rawValue.match(/\b(\d{2}\.\d{2}\.\d{4})(?:,\d{4})?\b/);
    if (dateMatch) {
      task.dueDate = convertDateFormatToString(dateMatch[1], DateFormat.ViewDate, DateFormat.StoreDate, false);
    }
    task.name = rawValue
      .replace(/@[^\s@]+(?:\s+[^\s@]+)?/g, '')
      .replace(/\b\d{2}\.\d{2}\.\d{4}(?:,\d{4})?\b/g, '')
      .replace(/:\S+/g, '')
      .replace(/\s+/g, ' ').trim();
    task.author = getAvatarInfo(this.store.currentUser(), 'user');
    const person = this.selectedQuickEntryPerson();
    if (person) {
      task.assignee = getAvatarInfo(person, 'person');
      this.selectedQuickEntryPerson.set(null);
    }
    await this.store.quickEntry(task);
    bkQuickEntry.value = '';
  }

  protected async onQuickEntryInput(textarea: IonTextarea): Promise<void> {
    if (this.isSettingQuickEntryValue) return;
    const value = textarea.value ?? '';
    const trigger = this.quickEntryService.detectTrigger(value);
    if (!trigger) return;
    this.isSettingQuickEntryValue = true;
    try {
      if (trigger === 'person') {
        const { PersonSelectModalComponent } = await import('@bk2/shared-feature');
        const modal = await this.modalController.create({
          component: PersonSelectModalComponent,
          cssClass: 'list-modal',
          componentProps: {
            selectedTag: '',
            currentUser: this.currentUser(),
          },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<PersonModel>();
        if (role === 'confirm' && data) {
          this.selectedQuickEntryPerson.set(data);
          textarea.value = this.quickEntryService.replaceToken(value, '@', `@${data.firstName} ${data.lastName}`);
        } else {
          textarea.value = value.slice(0, -1);
        }
      } else if (trigger === 'date') {
        const { DateTimeSelectModalComponent } = await import('@bk2/shared-ui');
        const modal = await this.modalController.create({
          component: DateTimeSelectModalComponent,
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<string>();
        if (role === 'confirm' && data) {
          const datePart = data.substring(0, 10);
          const viewDate = convertDateFormatToString(datePart, DateFormat.IsoDate, DateFormat.ViewDate);
          const timePart = data.length >= 16 ? data.substring(11, 16) : '00:00';
          const token = timePart === '00:00' ? viewDate : `${viewDate},${timePart.replace(':', '')}`;
          textarea.value = this.quickEntryService.replaceToken(value, '//', token);
        } else {
          textarea.value = value.slice(0, -2);
        }
      }
    } finally {
      this.isSettingQuickEntryValue = false;
    }
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.store.add(!this.canChange()); break;
      case 'export': await this.store.export('raw'); break;
      default: error(undefined, `TaskListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Task. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param task 
   */
  protected async showActions(task: TaskModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, task);
    await this.executeActions(actionSheetOptions, task);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param task 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, task: TaskModel): void {
    actionSheetOptions.buttons.push(createActionSheetButton('task.complete', this.imgixBaseUrl, 'checkbox'));
    actionSheetOptions.buttons.push(createActionSheetDivider());
    if (this.canChange(task)) {
      actionSheetOptions.buttons.push(createActionSheetButton('task.edit', this.imgixBaseUrl, 'edit'));
    } else {
      actionSheetOptions.buttons.push(createActionSheetButton('task.view', this.imgixBaseUrl, 'eye-on'));
    }
    if (hasRole('admin', this.store.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('task.delete', this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param task 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, task: TaskModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'task.delete':
          await this.store.delete(task, !this.canChange(task));
          break;
        case 'task.edit':
          await this.store.edit(task, !this.canChange(task));
          break;
        case 'task.view':
          await this.store.edit(task, true);
          break;
        case 'task.complete':
          await this.store.setCompleted(task, !this.canChange(task));
          break;

      }
    }
  }

  public async toggleCompleted(task: TaskModel): Promise<void> {
    await this.store.setCompleted(task);
  }

  protected clear(bkQuickEntry: IonTextarea): void {
    bkQuickEntry.value = '';
    this.selectedQuickEntryPerson.set(null);
  }

  /******************************* helpers *************************************** */
  protected canChange(task?: TaskModel): boolean {
    // 1) general roles
    if (this.hasRole('privileged')) return true; 
    if (this.hasRole('eventAdmin')) return true;

    // 2) group todo: allow group admin to change
    if (this.groupAdmin()) return true;

    // 3) task data: allow author and assignee to make changes
    const currentUser = this.store.currentUser();
    if (task && currentUser) {
      if (task.author?.key === currentUser.personKey) return true;
      if (task.assignee?.key === currentUser.personKey) return true;
    }
    return false;
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}
