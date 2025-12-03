import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { TaskCollection, TaskModel } from '@bk2/shared-models';
import { chipMatches, debugListLoaded, getAvatarInfoFromCurrentUser, getSystemQuery, getTodayStr, nameMatches } from '@bk2/shared-util-core';

import { TaskService } from '@bk2/task-data-access';

import { ModalController } from '@ionic/angular/standalone';
import { TaskEditModalComponent } from 'libs/task/feature/src/lib/task-edit.modal';
import { isTask } from '@bk2/task-util';

export type TaskListState = {
  calendarName: string;
  searchTerm: string;
  selectedTag: string;
  selectedState: string;
  selectedPriority: string;
};

export const initialTaskListState: TaskListState = {
  calendarName: '', 
  searchTerm: '',
  selectedTag: '',
  selectedState: 'all',
  selectedPriority: 'all',
};

export const TaskListStore = signalStore(
  withState(initialTaskListState),
  withProps(() => ({
    taskService: inject(TaskService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
  })),
  withProps((store) => ({
    tasksResource: rxResource({
      stream: () => {
        const tasks$ = store.firestoreService.searchData<TaskModel>(TaskCollection, getSystemQuery(store.appStore.tenantId()), 'dueDate', 'asc');
        debugListLoaded<TaskModel>('TaskListStore.tasks', tasks$, store.appStore.currentUser());
        return tasks$;
      }
    })
  })),

 withComputed((state) => {
    return {
      tasks: computed(() => {
        if (state.calendarName() === 'all') {
          return state.tasksResource.value() ?? [];
        } else {
          return state.tasksResource.value()?.filter((task: TaskModel) => task.calendars.includes(state.calendarName())) ?? [];
        }
      }),
      isLoading: computed(() => state.tasksResource.isLoading()),
    }
  }),

  withComputed((state) => {
    return {
      tasksCount: computed(() => state.tasks()?.length ?? 0),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      filteredTasks: computed(() => 
        state.tasks()?.filter((task: TaskModel) => 
          nameMatches(task.index, state.searchTerm()) &&
          chipMatches(task.tags, state.selectedTag()))
      )
    };
    // tbd:           categoryMatches(task.state, state.selectedState()) &&
    // tbd:           categoryMatches(task.priority, state.selectedPriority()))
  }),

  withMethods((store) => {
    return {
 
      /******************************** setters (filter) ******************************************* */
      setCalendarName(calendarName: string) {
        patchState(store, { calendarName });
      },

      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedState(selectedState: string) {
        patchState(store, { selectedState });
      },

      setSelectedPriority(selectedPriority: string) {
        patchState(store, { selectedPriority });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('task');
      },

      /******************************* actions *************************************** */
      async add(readOnly = true): Promise<void> {
        if (readOnly) return;
        const author = getAvatarInfoFromCurrentUser(store.currentUser());
        if (!author) return;
        const task = new TaskModel(store.appStore.tenantId());
        task.author = author;
        task.calendars = [store.calendarName()];
        await this.edit(task, readOnly);
      },

      async edit(task: TaskModel, readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
          component: TaskEditModalComponent,
          componentProps: {
            task: task,
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data) {
          if (isTask(data, store.tenantId())) {
             data.bkey?.length > 0 ? 
              await store.taskService.create(data, store.currentUser()) : 
              await store.taskService.update(data, store.currentUser());
          }
        }
        store.tasksResource.reload();
      },

      async addName(task: TaskModel): Promise<void> {
        await store.taskService.create(task, store.currentUser());
      },

      async export(type: string): Promise<void> {
        console.log(`TaskListStore.export(${type}) ist not yet implemented`);
      },

      async delete(task?: TaskModel, readOnly = true): Promise<void> {
        if (task && !readOnly) {
          await store.taskService.delete(task);
          store.tasksResource.reload();
        }
      },

      async setCompleted(task: TaskModel, readOnly = true): Promise<void> {
        if (!readOnly) {
          if (task.completionDate) {
            task.completionDate = '';
            task.state = 'planned';
          } else {
            task.completionDate = getTodayStr();
            task.state = 'done';
          }
          await store.taskService.update(task, store.currentUser());
          store.tasksResource.reload();
        }
      }
    }
  }),
);
