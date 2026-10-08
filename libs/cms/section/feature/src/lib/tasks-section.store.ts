import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { TaskCollection, TaskModel } from '@okr/shared-models';
import { getSystemQuery, getTodayStr } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { SECTION_I18N_KEYS } from '@okr/cms-section-util';
import { TaskService } from '@okr/project-task-data-access';
import { canChangeTask, canDeleteTask, getCompletionPatch, isTask } from '@okr/project-task-util';
import { resourceParams } from '@okr/shared-util-angular';


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
    i18n: inject(I18nService).translateAll(SECTION_I18N_KEYS)
  })),
  withProps((store) => ({
    tasksForCurrentUserResource: rxResource({
      params: resourceParams(() => ({
        personKey: store.appStore.currentUser()?.personKey,
      })),
      stream: ({params}) => {
        const personKey = params.personKey;
        if (!personKey) return of([]);
        const query = getSystemQuery(store.appStore.tenantId());
        query.push({ key: 'completionDate', operator: '==', value: '' }); // only get tasks that are not completed (completionDate is empty)
        query.push({ key: 'assignee.key', operator: '==', value: personKey });
        return store.appStore.firestoreService.searchData<TaskModel>(TaskCollection, query, 'dueDate', 'asc');
      }
    })
  })),

  withComputed((state) => {
    return {
      tasks: computed(() => {
        const all = state.tasksForCurrentUserResource.value() ?? [];
        const max = state.maxItems();
        return max !== undefined ? all.slice(0, max) : all;
      }),
      totalTaskCount: computed(() => (state.tasksForCurrentUserResource.value() ?? []).length),
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
      // dynamic: a static import puts the task feature (and the workflow ui it pulls in) into the dashboard closure
      const { TaskEditModal } = await import('@okr/project-task-feature');
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
          data.okey?.length === 0 ? 
            await store.taskService.create(data, store.currentUser()) : 
            await store.taskService.update(data, store.currentUser());
          // no reload(): the list is an rxfire real-time stream
        }
      }
    },

    canChangeTask(task: TaskModel): boolean {
      return canChangeTask(task, store.currentUser());
    },

    canDeleteTask(task: TaskModel): boolean {
      return canDeleteTask(task, store.currentUser());
    },

    /** Archive a task (soft delete, sets isArchived). Gated here, not only in the ActionSheet. */
    async delete(task: TaskModel): Promise<void> {
      if (!canDeleteTask(task, store.currentUser())) return;
      await store.taskService.delete(task, store.currentUser());
    },

    /** Toggle completion: open → done today, done → planned. Never mutates the streamed task. */
    async toggleCompleted(task: TaskModel): Promise<void> {
      if (!canChangeTask(task, store.currentUser())) return;
      await store.taskService.saveCompletion(task, getCompletionPatch(task, getTodayStr()), store.currentUser());
    },
    }
  })
);

