import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { map, of } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore, PersonSelectModal } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { CategoryListModel, PersonModel, TaskCollection, TaskModel } from '@bk2/shared-models';
import { chipMatches, debugItemLoaded, debugListLoaded, getAvatarInfo, getSystemQuery, getTodayStr, isPerson, nameMatches } from '@bk2/shared-util-core';

import { TaskService } from '@bk2/task-data-access';
import { isTask, TASK_I18N_KEYS, TaskI18n } from '@bk2/task-util';
import { AvatarService } from '@bk2/avatar-data-access';

import { TaskEditModal } from './task-edit.modal';

export type TaskState = {
  calendarName: string;
  maxItems: number | undefined,

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
  maxItems: undefined,

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
    avatarService: inject(AvatarService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(TASK_I18N_KEYS),
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
   tasksForCurrentUserResource: rxResource({
      params: () => ({
        personKey: store.appStore.currentUser()?.personKey,
        maxItems: store.maxItems()
      }),
      stream: ({params}) => {
        const personKey = params.personKey;
        if (!personKey) return of([]);
        const query = getSystemQuery(store.appStore.env.tenantId);
        query.push({ key: 'completionDate', operator: '==', value: '' }); // only get tasks that are not completed (completionDate is empty)  
        return store.appStore.firestoreService.searchData<TaskModel>(TaskCollection, query, 'dueDate', 'asc').pipe(
          map(tasks => {
            const filteredTasks = tasks.filter(task => task.assignee?.key === personKey || task.author?.key === personKey);
            // Limit results if maxItems is defined
            return params.maxItems !== undefined ? filteredTasks.slice(0, params.maxItems) : filteredTasks;
          })
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
    tasks: computed(() => {
      if (state.calendarName() === 'all') {
        return state.tasksResource.value() ?? [];
      } else if (state.calendarName() === 'my') {
        return state.tasksForCurrentUserResource.value() ?? [];
      } else {
        return state.tasksResource.value()?.filter((task: TaskModel) => task.calendars.includes(state.calendarName())) ?? [];
      }
    })
 })),

 withComputed((state) => ({
    tasksCount: computed(() => state.tasks().length),
    filteredTasks: computed(() => 
      state.tasks().filter((task: TaskModel) => 
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
      store.tasksForCurrentUserResource.reload();
    },

    /******************************** setters (filter) ******************************************* */
    setCalendarName(calendarName: string) {
      patchState(store, { calendarName });
    },

    setMaxItems(maxItems?: number): void {
      patchState(store, { maxItems });
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
      const pKey = store.currentUser()?.personKey;
      if (!pKey) return;
      const person = store.appStore.getPerson(pKey);
      const author = getAvatarInfo(person, 'person');
      if (!author) return;
      const task = new TaskModel(store.tenantId());
      task.author = author;
      task.assignee = author; // by default, the task is self-assigned, user can change this in the edit modal
      const calendar = store.calendarName();
      if (!calendar || calendar === 'all' || calendar === 'my' || calendar === '') {
        task.calendars = [store.tenantId()];
      } else {
        task.calendars = [calendar];
      }
      await this.edit(task, readOnly);
    },

    async edit(task: TaskModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: TaskEditModal,
        componentProps: {
          task,
          currentUser: store.currentUser(),
          tags: store.tags(),
          tenantId: store.tenantId(),
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

    async quickEntry(task: TaskModel): Promise<void> {
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

    async selectPerson(): Promise<PersonModel | undefined> {
      const modal = await store.modalController.create({
        component: PersonSelectModal,
        cssClass: 'list-modal',
        componentProps: {
          selectedTag: '',
          currentUser: store.currentUser()
        }
      });
      modal.present();
      const { data, role } = await modal.onWillDismiss();
      if (role === 'confirm' && data) {
        if (isPerson(data, store.tenantId())) {
          return data;
        }
      }
      return undefined;
    },

    getTitleLabel(readOnly: boolean, key?: string): string {
        if (readOnly) {
          return store.i18n.view();
        }
        if (key && key.length > 0) {
          return store.i18n.update();
        } else {
          return store.i18n.create();
        }
      }
  })),
);
