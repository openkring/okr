import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { map, of } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TaskCollection, TaskModel } from '@bk2/shared-models';
import { getSystemQuery, getTodayStr } from '@bk2/shared-util-core';

import { TaskService } from '@bk2/task-data-access';
import { TaskEditModalComponent } from '@bk2/task-feature';
import { isTask } from '@bk2/task-util';

export type TasksState = {
  maxItems: number | undefined; // max items to show, undefined means all
};

export const initialState: TasksState = {
  maxItems: undefined,
};

export const TasksStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    taskService: inject(TaskService),
    modalController: inject(ModalController),
  })),
  withProps((store) => ({
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
    })
  })),

  withComputed((state) => {
    return {
      tasks: computed(() => state.tasksForCurrentUserResource.value() ?? []),
      isLoading: computed(() => state.tasksForCurrentUserResource.isLoading()),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.env.tenantId),
      tags: computed(() => state.appStore.getTags('task')),
      states: computed(() => state.appStore.getCategory('task_state')),
      priorities: computed(() => state.appStore.getCategory('priority')),
      importances: computed(() => state.appStore.getCategory('importance'))
    }
  }),

  withMethods((store) => {
    return {

      setConfig(maxItems?: number): void {
        patchState(store, { maxItems });
      },

      reload(): void {
        store.tasksForCurrentUserResource.reload();
      },

    async edit(task: TaskModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: TaskEditModalComponent,
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
    }
  })
);

