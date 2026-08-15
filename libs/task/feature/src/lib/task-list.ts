import { Component, computed, effect, inject, input, PLATFORM_ID, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTextarea, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { PersonModel, RoleName, TaskModel } from '@okr/shared-models';
import { ModelSelectService } from '@okr/shared-feature';
import { PrettyDatePipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error, isBrowser, keepDefaultTrue, QuickEntryService } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, getAvatarInfo, hasRole } from '@okr/shared-util-core';

import { AvatarPipe } from '@okr/avatar-ui';
import { Menu } from '@okr/cms-menu-feature';
import { TaskBoard } from './task-board';
import { TaskMove, TaskStore } from './task.store';

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
  selector: 'okr-task-list',
  standalone: true,
  imports: [
    SvgIconPipe, PrettyDatePipe, AvatarPipe,
    EmptyList, ListFilter, Menu, TaskBoard,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonList, IonAvatar, IonImg, IonTextarea, IonChip, IonPopover
  ],
  providers: [TaskStore],
  styles: [`
      ion-avatar { width: 30px; height: 30px; border: 2px solid white; transition: transform 0.2s ease; }
      ion-textarea {
        margin-top: 10px;
        --background: var(--ion-color-light-tint, #f4f5f8);
        --border-color: var(--ion-color-medium);
        --border-width: 2px;
        --border-radius: 8px;
        --padding-start: 12px;
        --padding-end: 12px;
      }
      .name { min-width: 70% !important;}
      .tags { padding-right: 10px; }
    `],
  template: `
    <ion-header>
      <!-- title and actions -->
      @if(showContextMenu()) {
      <ion-toolbar [color]="color()">
        @if(showMenuButton()) {
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        }
        <ion-title>{{ selectedTasksCount()}}/{{tasksCount()}} {{ store.i18n.tasks() }}</ion-title>
        <ion-buttons slot="end">
          @if(showViewToggle()) {
            <ion-button (click)="toggleView()">
              <ion-icon slot="icon-only" src="{{ (isListView() ? 'grid' : 'list') | svgIcon }}" />
            </ion-button>
          }
          @if(canChange()) {
            <ion-button id="c-tasks">
              <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="c-tasks" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()" [forceVisible]="groupAdmin()" [toggleStates]="{ toggleFilter: showFilter() }"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          }
        </ion-buttons>
      </ion-toolbar>
      }

      <!-- quick entry -->
      @if(canChange()) {
        <ion-item lines="none">
          <ion-textarea #okrQuickEntry
            (keyup.enter)="quickEntry(okrQuickEntry)"
            (ionInput)="onQuickEntryInput(okrQuickEntry)"
            label = "{{ store.i18n.quick_entry_label() }}"
            labelPlacement = "floating"
            placeholder = "{{ store.i18n.quick_entry_placeholder() }}"
            [counter]="true"
            fill="outline"
            [maxlength]="1000"
            inputmode="text"
            type="text"
            [autoGrow]="true"
          >
          </ion-textarea>
          @if(quickEntryText().length > 0) {
            <ion-icon slot="end" src="{{'cancel' | svgIcon }}" (click)="clear(okrQuickEntry)" />
          }
        </ion-item>
      }

      <!-- search and filters — hidden on small screens by default; toggled via the context-menu 'toggleFilter' action -->
      @if(showFilter()) {
        <okr-list-filter
          (searchTermChanged)="onSearchtermChange($event)"
          (tagChanged)="onTagSelected($event)" [tags]="tags()"
          (typeChanged)="onPrioritySelected($event)" [types]="priorities()"
          (stateChanged)="onStateSelected($event)" [states]="states()"
        />
      }
    </ion-header>

  <!-- list or board -->
  <ion-content #content>
      @if(isListView()) {
        @if(selectedTasksCount() === 0) {
          <okr-empty-list [message]="store.i18n.empty()" />
        } @else {
          <ion-list lines="inset">
            @for(task of filteredTasks(); track task.okey) {
              <ion-item>
                <ion-icon src="{{ getIcon(task) | svgIcon }}"  (click)="toggleCompleted(task)" />
                @if(task.assignee) {
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
              </ion-item>
            }
          </ion-list>
        }
      } @else {
        <okr-task-board (taskSelected)="showActions($event)" (taskMoved)="onTaskMoved($event)" />
      }
  </ion-content>
    `
})
export class TaskList {
  protected store = inject(TaskStore);
  private actionSheetController = inject(ActionSheetController);
  private readonly modalController = inject(ModalController);
  private readonly quickEntryService = inject(QuickEntryService);
  private readonly modelSelectService = inject(ModelSelectService);
  private readonly platformId = inject(PLATFORM_ID);
  private selectedQuickEntryPerson = signal<PersonModel | null>(null);
  // filter row: shown by default from Ionic's sm breakpoint (576px), hidden on smaller screens.
  // Toggled via the context-menu 'toggleFilter' action.
  protected readonly showFilter = signal(isBrowser(this.platformId) && window.innerWidth >= 576);
  protected quickEntryText = signal('');
  private isSettingQuickEntryValue = false;

  public listId = input.required<string>(); // all, my, calendarId
  public contextMenuName = input.required<string>();
  public color = input('secondary');
  // keepDefaultTrue: withComponentInputBinding() would otherwise set these to undefined on standalone
  // routes (hiding the hamburger/toolbar/toggle); an explicit [x]="false" from the group still wins.
  public showMenuButton = input(true, { transform: keepDefaultTrue });
  public showContextMenu = input(true, { transform: keepDefaultTrue }); // false when the context menu is hoisted to a parent toolbar (group view)
  public showViewToggle = input(true, { transform: keepDefaultTrue }); // false when the view toggle is hoisted to a parent toolbar (group view)
  public groupAdmin = input(false);

  // derived signals
  protected filteredTasks = computed(() => this.store.filteredTasks() ?? []);
  protected tasksCount = computed(() => this.store.tasksCount());
  protected selectedTasksCount = computed(() => this.filteredTasks().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.tags());
  protected priorities = computed(() => this.store.appStore.getCategory('priority'));
  protected states = computed(() => this.store.appStore.getCategory('task_state'));
  protected currentUser = computed(() => this.store.appStore.currentUser());

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  public readonly isListView = signal(true);

  constructor() {
    effect(() => {
      this.store.setCalendarName(this.listId());
      this.store.setGroupAdmin(this.groupAdmin());
    });
  }

  /** Flip between list and board view. Public so a parent toolbar (group view) can drive the hoisted toggle. */
  public toggleView(): void {
    this.onViewChange(!this.isListView());
  }

  /** Whether the filter row is currently visible. Public so a parent (group view) can reflect it in a hoisted toggle menu item. */
  public isFilterVisible(): boolean {
    return this.showFilter();
  }

  protected onViewChange(showList: boolean): void {
    this.isListView.set(showList);
  }

  protected async onTaskMoved(move: TaskMove): Promise<void> {
    await this.store.moveTask(move, !this.canChange(move.task));
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

  /******************************* actions *************************************** */
  /**
   * This is the quick entry. It just takes the name of the task and adds it to the list.
   * @param taskName 
   */
  protected async quickEntry(okrQuickEntry: IonTextarea): Promise<void> {
    const task = new TaskModel(this.store.tenantId());
    const rawValue = okrQuickEntry.value?.trim() ?? '';
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
    okrQuickEntry.value = '';
    this.quickEntryText.set('');
  }

  protected async onQuickEntryInput(textarea: IonTextarea): Promise<void> {
    this.quickEntryText.set(textarea.value ?? '');
    if (this.isSettingQuickEntryValue) return;
    const value = textarea.value ?? '';
    const trigger = this.quickEntryService.detectTrigger(value);
    if (!trigger) return;
    this.isSettingQuickEntryValue = true;
    try {
      if (trigger === 'person') {
        const person = await this.modelSelectService.selectPerson();
        if (person) {
          this.selectedQuickEntryPerson.set(person);
          textarea.value = this.quickEntryService.replaceToken(value, '@', `@${person.firstName} ${person.lastName}`);
        } else {
          textarea.value = value.slice(0, -1);
        }
      } else if (trigger === 'date') {
        const { DateTimeSelectModal: DateTimeSelectModal } = await import('@okr/shared-ui');
        const modal = await this.modalController.create({
          component: DateTimeSelectModal,
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
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'add': await this.store.add(!this.canChange()); break;
      case 'export': await this.store.export('raw'); break;
      case 'toggleFilter': this.showFilter.update(v => !v); break;
      default: error(undefined, `TaskList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Task. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param task 
   */
  protected async showActions(task: TaskModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, task);
    await this.executeActions(actionSheetOptions, task);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param task 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, task: TaskModel): void {
    if (task.state !== 'done') {
      actionSheetOptions.buttons.push(createActionSheetButton('task.complete', this.store.i18n.done(), this.imgixBaseUrl, 'checkbox'));
      actionSheetOptions.buttons.push(createActionSheetDivider());
    }
    if (this.canChange(task)) {
      actionSheetOptions.buttons.push(createActionSheetButton('task.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
    } else {
      actionSheetOptions.buttons.push(createActionSheetButton('task.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    }
    if (hasRole('admin', this.store.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('task.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
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

  protected clear(okrQuickEntry: IonTextarea): void {
    okrQuickEntry.value = '';
    this.quickEntryText.set('');
    this.selectedQuickEntryPerson.set(null);
  }

  /******************************* helpers *************************************** */
  public canChange(task?: TaskModel): boolean {
    return this.store.canChangeTask(task);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}
