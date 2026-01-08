import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTextarea, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, TaskModel } from '@bk2/shared-models';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { extractTagAndDate, getAvatarInfo, getCategoryIcon, hasRole } from '@bk2/shared-util-core';

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
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedTasksCount()}}/{{tasksCount()}} {{ '@task.plural' | translate | async }}</ion-title>
        @if(hasRole('privileged') || hasRole('eventAdmin')) {
          <ion-buttons slot="end">
            <ion-button id="c-tasks">
              <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="c-tasks" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <bk-menu [menuName]="contextMenuName()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>

      <!-- quick entry -->
      <ion-item lines="none">
        <ion-textarea #bkTaskName 
          (keyup.enter)="addName(bkTaskName)"
          label = "{{'@input.taskName.label' | translate | async }}"
          labelPlacement = "floating"
          placeholder = "{{'@input.taskName.placeholder' | translate | async }}"
          [counter]="true"
          fill="outline"
          [maxlength]="1000"
          [rows]="1"
          inputmode="text"
          type="text"
          [autoGrow]="true">
        </ion-textarea>
        <ion-icon slot="end" src="{{'close_cancel' | svgIcon }}" (click)="clear(bkTaskName)" />
      </ion-item>

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
                  <ion-img src="{{ task.assignee.modelType + '.' + task.assignee.key | avatar | async }}" alt="Avatar of the assigned person" />
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
  protected taskStore = inject(TaskStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // derived signals
  protected filteredTasks = computed(() => this.taskStore.filteredTasks() ?? []);
  protected tasksCount = computed(() => this.taskStore.tasksCount());
  protected selectedTasksCount = computed(() => this.filteredTasks().length);
  protected isLoading = computed(() => this.taskStore.isLoading());
  protected tags = computed(() => this.taskStore.tags());
  protected priorities = computed(() => this.taskStore.appStore.getCategory('priority'));
  protected importances = computed(() => this.taskStore.appStore.getCategory('importance'));
  protected states = computed(() => this.taskStore.appStore.getCategory('task_state'));
  protected currentUser = computed(() => this.taskStore.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('eventAdmin', this.currentUser()));

  private imgixBaseUrl = this.taskStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => {
      this.taskStore.setCalendarName(this.listId());
    });
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.taskStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.taskStore.setSelectedTag(tag);
  }

  protected onPrioritySelected(priority: string): void {
    this.taskStore.setSelectedPriority(priority);
  }

  protected onStateSelected(state: string): void {
    this.taskStore.setSelectedState(state);
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
  protected async addName(bkTaskName: IonTextarea): Promise<void> {
    const task = new TaskModel(this.taskStore.tenantId());
    [task.tags, task.dueDate, task.name] = extractTagAndDate(bkTaskName.value?.trim() ?? '');
    task.author = getAvatarInfo(this.taskStore.currentUser(), 'user');
    await this.taskStore.addName(task);
    bkTaskName.value = '';
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.taskStore.add(this.readOnly()); break;
      case 'export': await this.taskStore.export('raw'); break;
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
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('task.view', this.imgixBaseUrl, 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('task.complete', this.imgixBaseUrl, 'checkbox_task'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('task.edit', this.imgixBaseUrl, 'create_edit'));
    }
    if (hasRole('admin', this.taskStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('task.delete', this.imgixBaseUrl, 'trash_delete'));
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
          await this.taskStore.delete(task, this.readOnly());
          break;
        case 'task.edit':
          await this.taskStore.edit(task, this.readOnly());
          break;
        case 'task.view':
          await this.taskStore.edit(task, true);
          break;
        case 'task.complete':
          await this.taskStore.setCompleted(task, this.readOnly());
          break;

      }
    }
  }

  public async toggleCompleted(task: TaskModel): Promise<void> {
    await this.taskStore.setCompleted(task);
  }

  protected clear(bkTaskName: IonTextarea): void {
    bkTaskName.value = '';
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.taskStore.currentUser());
  }
}
