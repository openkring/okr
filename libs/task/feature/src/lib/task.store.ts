import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { CategoryListModel, TaskCollection, TaskModel } from '@bk2/shared-models';
import { chipMatches, debugItemLoaded, debugListLoaded, getAvatarInfo, getSystemQuery, getTodayStr, nameMatches } from '@bk2/shared-util-core';

import { TaskService } from '@bk2/task-data-access';

import { ModalController } from '@ionic/angular/standalone';
import { TaskEditModalComponent } from 'libs/task/feature/src/lib/task-edit.modal';
import { isTask } from '@bk2/task-util';
import { AvatarService } from '@bk2/avatar-data-access';

export type TaskState = {
  calendarName: string;

  // task
  taskKey: string;

  // filter
  searchTerm: string;
  selectedTag: string;
  selectedState: string;
  selectedPriority: string;
};

export const initialState: TaskState = {
  calendarName: '', 

  // task
  taskKey: '',

  // filter
  searchTerm: '',
  selectedTag: '',
  selectedState: 'all',
  selectedPriority: 'all',
};

export const TaskStore = signalStore(
  withState(initialState),
  withProps(() => ({
    taskService: inject(TaskService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    avatarService: inject(AvatarService)
  })),
  withProps((store) => ({
    tasksResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        return store.firestoreService.searchData<TaskModel>(TaskCollection, getSystemQuery(store.appStore.tenantId()), 'dueDate', 'asc').pipe(
          debugListLoaded<TaskModel>('TaskListStore.tasks', params.currentUser)
        );
      }
    }),
    taskResource: rxResource({
      params: () => ({
        taskKey: store.taskKey(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        return store.taskService.read(params.taskKey).pipe(
          debugItemLoaded('TaskStore.task', params.currentUser)
        );
      }
    }),
  })),

 withComputed((state) => ({
    // tasks
    tasks: computed(() => {
      if (state.calendarName() === 'all') {
        return state.tasksResource.value() ?? [];
      } else {
        return state.tasksResource.value()?.filter((task: TaskModel) => task.calendars.includes(state.calendarName())) ?? [];
      }
    }),
    tasksCount: computed(() => state.tasksResource.value()?.length ?? 0),
    filteredTasks: computed(() => 
      state.tasksResource.value()?.filter((task: TaskModel) => 
        nameMatches(task.index, state.searchTerm()) &&
        chipMatches(task.tags, state.selectedTag()) &&
        nameMatches(task.state, state.selectedState()) &&
        nameMatches(task.priority, state.selectedPriority())
      ) ?? [],
    ),

    // task
    task: computed(() => state.taskResource.value()),

    // other
    isLoading: computed(() => state.tasksResource.isLoading() || state.taskResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),
    tags: computed(() => state.appStore.getTags('task')),
    states: computed(() => state.appStore.getCategory('task_state')),
    priorities: computed(() => state.appStore.getCategory('priority')),
    importances: computed(() => state.appStore.getCategory('importance')),
  })),

  withMethods((store) => ({
     reset() {
      patchState(store, initialState);
    },
    reload() {
      store.tasksResource.reload();
      store.taskResource.reload();
    },

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

    /******************************* actions *************************************** */
    async export(type: string): Promise<void> {
      console.log(`TaskListStore.export(${type}) ist not yet implemented`);
    },

    async add(readOnly = true): Promise<void> {
      if (readOnly) return;
      const author = getAvatarInfo(store.currentUser(), 'user');
      if (!author) return;
      const task = new TaskModel(store.tenantId());
      task.author = author;
      task.calendars = [store.calendarName()];
      await this.edit(task, readOnly);
    },

    async edit(task: TaskModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: TaskEditModalComponent,
        componentProps: {
          task,
          currentUser: store.currentUser(),
          tags: store.tags(),
          states: store.states(),
          priorities: store.priorities(),
          importances: store.importances(),
          readOnly
        }
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && !readOnly) {
        if (isTask(data, store.tenantId())) {
          data.bkey?.length === 0 ? 
            await store.taskService.create(data, store.currentUser()) : 
            await store.taskService.update(data, store.currentUser());
          this.reload();
        }
      }
    },

    async addName(task: TaskModel): Promise<void> {
      await store.taskService.create(task, store.currentUser());
    },

    async delete(task?: TaskModel, readOnly = true): Promise<void> {
      if (task && !readOnly) {
        await store.taskService.delete(task);
        this.reload();
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
        this.reload();
      }
    },
  })),
);
