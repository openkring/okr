import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonAvatar, IonChip, IonContent, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonTextarea } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, TaskModel } from '@bk2/shared-models';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent } from '@bk2/shared-ui';
import { error } from '@bk2/shared-util-angular';
import { extractTagAndDate, getAvatarInfo, hasRole } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { TaskStore } from './task.store';

/**
 * Task items can be marked as done/completed by checking the checkbox.
 * isCompleted() is computed from the completion date (if it is set, the task is completed).
 * Quick entry accepts tag:[tag:] @assignedPerson //dueDate.
 * A notification is sent to the assigned person.
 * Later, a cloud function will automatically archive all completed task items after one day.
 * There is a list to see the current task items and one to see the archived ones (sorted by completion date).
 * Completed task items are added to the diary at the same date as the completion date.
 * 
 * This simple task list is used by group segment task. 
 * The actions are provided be the static group menu.
 */
@Component({
  selector: 'bk-simple-task-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, PrettyDatePipe, AvatarPipe,
    EmptyListComponent, ListFilterComponent,
    IonHeader, IonIcon, IonLabel, IonContent, IonItem, IonList, IonAvatar, IonImg, IonTextarea, IonChip
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
      @if(!readOnly()) {
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
      }

      <!-- search and filters -->
      <bk-list-filter
        (searchTermChanged)="onSearchtermChange($event)"
        (tagChanged)="onTagSelected($event)" [tags]="tags()"
        (typeChanged)="onTypeSelected($event)" [types]="types()"
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
                <div class="tags ion-hide-md-down">
                  @for (tag of task.tags.split(','); track tag) {
                    @if(tag.length > 0) {
                      <ion-chip color="primary">
                        <ion-label>{{ tag }}</ion-label>
                      </ion-chip>
                    }
                  }
                </div>
                <ion-label class="name" (click)="edit(task)">{{ task.name }}</ion-label>
                @if(task.dueDate.length > 0) {
                  <ion-label>{{ task.dueDate | prettyDate }}</ion-label>
                }
                @if(task.assignee !== undefined) {
                  <ion-avatar>
                    <ion-img src="{{ task.assignee.modelType + '.' + task.assignee.key | avatar | async }}" alt="Avatar of the assigned person" />
                  </ion-avatar>
                }
                <ion-label class="ion-hide-md-down ion-text-end">
                  {{task.priority}} {{task.importance}}
                </ion-label> 
              </ion-item>
          }
        </ion-list>
      }
  </ion-content>
    `
})
export class SimpleTaskListComponent {
  protected taskListStore = inject(TaskStore);

  // inputs
  public listId = input.required<string>();
  public readOnly = input(true);

  // derived signals
  protected searchTerm = linkedSignal(() => this.taskListStore.searchTerm());
  protected selectedTag = linkedSignal(() => this.taskListStore.selectedTag());
  protected selectedType = linkedSignal(() => this.taskListStore.selectedPriority());
  protected selectedState = linkedSignal(() => this.taskListStore.selectedState());
  protected filteredTasks = computed(() => this.taskListStore.filteredTasks() ?? []);
  protected tasksCount = computed(() => this.taskListStore.tasksCount());
  protected selectedTasksCount = computed(() => this.filteredTasks().length);
  protected isLoading = computed(() => this.taskListStore.isLoading());
  protected tags = computed(() => this.taskListStore.tags());
  protected types = computed(() => this.taskListStore.appStore.getCategory('priority'));
  protected states = computed(() => this.taskListStore.appStore.getCategory('task_state'));
  protected currentUser = computed(() => this.taskListStore.appStore.currentUser());

  constructor() {
    effect(() => {
      this.taskListStore.setCalendarName(this.listId());
    });
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.taskListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.taskListStore.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.taskListStore.setSelectedPriority(type);
  }

  protected onStateSelected(state: string): void {
    this.taskListStore.setSelectedState(state);
  }

  /******************************* actions *************************************** */
  /**
   * This is the quick entry. It just takes the name of the task and adds it to the list.
   * @param taskName 
   */
  protected async addName(bkTaskName: IonTextarea): Promise<void> {
    const task = new TaskModel(this.taskListStore.tenantId());
    [task.tags, task.dueDate, task.name] = extractTagAndDate(bkTaskName.value?.trim() ?? '');
    task.author = getAvatarInfo(this.taskListStore.currentUser(), 'user');
    await this.taskListStore.addName(task);
    bkTaskName.value = '';
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.taskListStore.add(this.readOnly()); break;
      case 'export': await this.taskListStore.export('raw'); break;
      default: error(undefined, `TaskListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  public async edit(task: TaskModel): Promise<void> {
    await this.taskListStore.edit(task, this.readOnly());
  }

  public async toggleCompleted(task: TaskModel): Promise<void> {
    await this.taskListStore.setCompleted(task, this.readOnly());
  }

  public getIcon(task: TaskModel): string {
    return task.completionDate.length > 0 ? 'checkbox-circle' : 'circle';
  }

  protected clear(bkTaskName: IonTextarea): void {
    bkTaskName.value = '';
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.taskListStore.currentUser());
  }
}
