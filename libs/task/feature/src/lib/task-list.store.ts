import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { chipMatches, debugListLoaded, getAvatarInfoFromCurrentUser, getSystemQuery, getTodayStr, nameMatches, searchData } from '@bk2/shared/util-core';
import { AllCategories, ModelType, Priority, TaskCollection, TaskModel, TaskState } from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';

import { TaskService } from '@bk2/task/data-access';
import { TaskModalsService } from './task-modals.service';

export type TaskListState = {
  calendarName: string;
  searchTerm: string;
  selectedTag: string;
  selectedState: TaskState | typeof AllCategories;
  selectedPriority: Priority | typeof AllCategories;
};

export const initialTaskListState: TaskListState = {
  calendarName: '', 
  searchTerm: '',
  selectedTag: '',
  selectedState: AllCategories,
  selectedPriority: AllCategories,
};

export const TaskListStore = signalStore(
  withState(initialTaskListState),
  withProps(() => ({
    taskService: inject(TaskService),
    taskModalsService: inject(TaskModalsService),
    appStore: inject(AppStore),
  })),
  withProps((store) => ({
    tasksResource: rxResource({
      loader: () => {
        const tasks$ = searchData<TaskModel>(store.appStore.firestore, TaskCollection, getSystemQuery(store.appStore.tenantId()), 'dueDate', 'asc');
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

      setSelectedState(selectedState: TaskState | typeof AllCategories) {
        patchState(store, { selectedState });
      },

      setSelectedPriority(selectedPriority: Priority | typeof AllCategories) {
        patchState(store, { selectedPriority });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.Task);
      },

      /******************************* actions *************************************** */
      async add(): Promise<void> {
        const _currentPerson = getAvatarInfoFromCurrentUser(store.currentUser());
        if (!_currentPerson) return;
        console.log('TaskListStore.add: ', store.calendarName());
        await store.taskModalsService.add(_currentPerson, store.calendarName());
        store.tasksResource.reload();
      },

      async addName(task: TaskModel): Promise<void> {
        await store.taskService.create(task, store.currentUser());
      },

      async export(): Promise<void> {
        console.log('TaskListStore.export ist not yet implemented');
      },

      async edit(task?: TaskModel): Promise<void> {
        await store.taskModalsService.edit(task);
        store.tasksResource.reload();
      },

      async delete(task?: TaskModel): Promise<void> {
        if (task) {
          await store.taskService.delete(task);
          store.tasksResource.reload();
        }
      },

      async setCompleted(task: TaskModel): Promise<void> {
        if (task.completionDate) {
          task.completionDate = '';
          task.state = TaskState.Planned;
        } else {
          task.completionDate = getTodayStr();
          task.state = TaskState.Done;
        }
        await store.taskService.update(task, store.currentUser());
        store.tasksResource.reload();
      }
    }
  }),
);
