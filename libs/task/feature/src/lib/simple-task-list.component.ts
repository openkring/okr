import { Component, computed, effect, inject, input } from '@angular/core';
import { IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonItemSliding, IonList, IonTextarea, IonAvatar, IonImg, IonChip } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { AvatarPipe, CategoryAbbreviationPipe, PrettyDatePipe, SvgIconPipe } from '@bk2/shared/pipes';
import { EmptyListComponent, ListFilterComponent } from '@bk2/shared/ui';
import { TaskModel } from '@bk2/shared/models';
import { addAllCategory, Importances, Priorities, TaskStates } from '@bk2/shared/categories';
import { RoleName } from '@bk2/shared/config';
import { error, extractTagAndDate, getAvatarInfoFromCurrentUser, hasRole } from '@bk2/shared/util';

import { TaskListStore } from './task-list.store';

/**
 * Task items can be marked as done/completed by checking the checkbox.
 * isCompleted() is computed from the completion date (if it is set, the task is completed).
 * Task items can be manually archived with 'delete' button.
 * Quick entry accepts tag:[tag:] @assignedPerson //dueDate.
 * A notification is sent to the assigned person.
 * Later, a cloud function will automatically archive all completed task items after one day.
 * There is a list to see the current task items and one to see the archived ones (sorted by completion date).
 * Completed task items are added to the diary at the same date as the completion date.
 * 
 * This simple task list is used by group segment task. 
 * It does not have a header and no sliding items.
 * The actions are provided be the static group menu.
 */
@Component({
    selector: 'bk-simple-task-list',
    imports: [
      TranslatePipe, AsyncPipe, SvgIconPipe, CategoryAbbreviationPipe, PrettyDatePipe, AvatarPipe,
      EmptyListComponent, ListFilterComponent,
      IonHeader, IonIcon, IonLabel, IonContent, IonItem, IonList, IonAvatar, IonImg, IonTextarea, IonChip
    ],
    providers: [TaskListStore],
    styles: [`
      ion-avatar { width: 30px; height: 30px; border: 2px solid white; transition: transform 0.2s ease; }
      ion-textarea { margin-top: 10px;}
      .name { min-width: 70% !important;}
      .tags { padding-right: 10px; }
    `],
    template: `
    <ion-header>

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
        [tags]="taskTags()"
        [types]="types"
        [typeName]="typeName"
        (searchTermChanged)="onSearchtermChange($event)"
        (tagChanged)="onTagSelected($event)"
        (typeChanged)="onTypeSelected($event)"
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
                <ion-label class="name" (click)="edit(undefined, task)">{{ task.name }}</ion-label>
                @if(task.dueDate.length > 0) {
                  <ion-label>{{ task.dueDate | prettyDate }}</ion-label>
                }
                @if(task.assignee !== undefined) {
                  <ion-avatar>
                    <ion-img src="{{ task.assignee.modelType + '.' + task.assignee.key | avatar | async }}" alt="Avatar of the assigned person" />
                  </ion-avatar>
                }
                <ion-label class="ion-hide-md-down ion-text-end">
                  {{task.priority | categoryAbbreviation:types}} {{task.importance | categoryAbbreviation:importances}}
                </ion-label> 
              </ion-item>
          }
        </ion-list>
      }
  </ion-content>
    `
})
export class SimpleTaskListComponent {
  protected taskListStore = inject(TaskListStore);
  
  public listId = input.required<string>();

  protected filteredTasks = computed(() => this.taskListStore.filteredTasks() ?? []);
  protected tasksCount = computed(() => this.taskListStore.tasksCount());
  protected selectedTasksCount = computed(() => this.filteredTasks().length);
  protected isLoading = computed(() => this.taskListStore.isLoading());
  protected taskTags = computed(() => this.taskListStore.getTags());

  protected taskStates = TaskStates;
  protected types = addAllCategory(Priorities);
  protected typeName = 'priority';
  protected importances = Importances;

  constructor() {
    effect(() => {  
      this.taskListStore.setCalendarName(this.listId());
    });
  }
  /******************************* actions *************************************** */
  /**
   * This is the quick entry. It just takes the name of the task and adds it to the list.
   * @param taskName 
   */
  protected async addName(bkTaskName: IonTextarea): Promise<void> {
    const _task = new TaskModel(this.taskListStore.tenantId());
    [_task.tags, _task.dueDate, _task.name] = extractTagAndDate(bkTaskName.value?.trim() ?? '');
    _task.author = getAvatarInfoFromCurrentUser(this.taskListStore.currentUser());
    await this.taskListStore.addName(_task);
    bkTaskName.value = '';
  }

  public async edit(slidingItem?: IonItemSliding, task?: TaskModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.taskListStore.edit(task);
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'add':  await this.taskListStore.add(); break;
      case 'export': await this.taskListStore.export(); break;
      default: error(undefined, `TaskListComponent.call: unknown method ${_selectedMethod}`);
    }
  }

  public async delete(slidingItem: IonItemSliding, task: TaskModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.taskListStore.delete(task);
  }

  public async toggleCompleted(task: TaskModel): Promise<void> {
    await this.taskListStore.setCompleted(task);
  }

  public getIcon(task: TaskModel): string {
    return task.completionDate.length > 0 ? 'checkbox-circle' : 'circle';
  }

  protected clear(bkTaskName: IonTextarea): void {
    bkTaskName.value = '';
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.taskListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.taskListStore.setSelectedTag(tag);
  }

  protected onStateChange(state: number): void {
    this.taskListStore.setSelectedState(state);
  }

  protected onTypeSelected(type: number): void {
    this.taskListStore.setSelectedPriority(type);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.taskListStore.currentUser());
  }
}
