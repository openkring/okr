import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, of } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';

import { AppConfigService } from '@okr/shared-data-access';
import { AppStore, PersonSelectModal, PersonSelectResult } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { PersonModel, TaskModel } from '@okr/shared-models';
import { chipMatches, debugItemLoaded, getAvatarInfo, getAvatarInfoForCurrentUser, getTodayStr, hasRole, isPerson, nameMatches, rankBetween } from '@okr/shared-util-core';
import { resourceParams } from '@okr/shared-util-angular';

import { TaskService } from '@okr/task-data-access';
import { assignMissingRanks, buildTaskListQueries, canChangeTask, canCreateTask, canDeleteTask, getCompletionPatch, groupTasksByState, isTask, TASK_I18N_KEYS, TaskBoardColumn, TaskSettings } from '@okr/task-util';

/** The payload of a Kanban drag-and-drop. `columnTasks` is the target column, ordered, without the moved task. */
export type TaskMove = {
  task: TaskModel;
  targetState: string;
  targetIndex: number;
  columnTasks: TaskModel[];
};

export type TaskState = {
  calendarName: string;
  maxItems: number | undefined,
  groupAdmin: boolean,          // set by the group view; a group admin may change that group's tasks
  showArchived: boolean,        // the archived view (spec §10); toggled by Task 8's UI, consumed here

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
  groupAdmin: false,
  showArchived: false,

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
    appConfigService: inject(AppConfigService),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(TASK_I18N_KEYS),
    tasksResource: rxResource({
      params: resourceParams(() => ({
        calendarName: store.calendarName(),
        personKey: store.appStore.currentUser()?.personKey,
        tenantId: store.appStore.tenantId(),
        archived: store.showArchived(),
      })),
      stream: ({ params }) => {
        if (!params.calendarName || !params.tenantId) return of([]);
        const kind = params.calendarName === 'all' ? 'all' : params.calendarName === 'my' ? 'my' : 'shared';
        const queries = buildTaskListQueries({
          kind, tenantId: params.tenantId, personKey: params.personKey,
          shareKey: kind === 'shared' ? params.calendarName : undefined,
          archived: params.archived, openOnly: kind === 'my',
        });
        return store.taskService.listByQueries(queries);
      }
    }),
    taskResource: rxResource({
      params: () => ({
        taskKey: store.taskKey(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        if (!params.taskKey) return of(undefined);
        return store.taskService.read(params.taskKey).pipe(
          debugItemLoaded('TaskStore.task', params.currentUser)
        );
      }
    }),
  })),

 withComputed((state) => ({
    tasks: computed(() => {
      const tasks = state.tasksResource.value() ?? [];
      const maxItems = state.maxItems();
      return state.calendarName() === 'my' && maxItems !== undefined ? tasks.slice(0, maxItems) : tasks;
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

  withComputed((state) => ({
    // board: one column per task_state category item, cards ordered by rank (spec D6)
    boardColumns: computed<TaskBoardColumn[]>(() =>
      groupTasksByState(state.filteredTasks(), state.states())
    ),
  })),

  withMethods((store) => ({
     reset() {
      patchState(store, initialState);
    },
    reload() {
      store.tasksResource.reload();
      store.taskResource.reload();
    },

    toggleShowArchived() {
      patchState(store, { showArchived: !store.showArchived() });
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

    setGroupAdmin(groupAdmin: boolean) {
      patchState(store, { groupAdmin });
    },

    /******************************* actions *************************************** */
    /******************************* permissions *************************************** */
    // The rules live in @okr/task-util (shared with the dashboard section); the store only
    // supplies the current user and the group scope. Both the list and the board need them.
    canCreateTask(): boolean {
      return canCreateTask(store.currentUser(), store.groupAdmin());
    },

    canChangeTask(task?: TaskModel): boolean {
      return canChangeTask(task, store.currentUser(), store.groupAdmin());
    },

    canDeleteTask(task?: TaskModel): boolean {
      return canDeleteTask(task, store.currentUser(), store.groupAdmin());
    },

    /**
     * Move a card on the Kanban board: into a new column (state) and/or to a new position within
     * a column (rank). This is a single document write (spec D7) — the fractional rank means we
     * never renumber the siblings.
     *
     * Two exceptions to "single write":
     * - the target column may still be unranked (no task has ever been dragged there). Then we
     *   first freeze its current dueDate order into ranks — the spec's backfill, done lazily.
     * - the done ⇄ completionDate invariant (spec §6.2) is enforced here, on the same write.
     */
    async moveTask(move: TaskMove, readOnly = true): Promise<void> {
      if (readOnly) return;
      const { task, targetState, targetIndex, columnTasks } = move;

      // lazily backfill the target column if any neighbour lacks a rank (see board.util)
      const backfilled = assignMissingRanks(columnTasks);
      if (backfilled.length > 0) {
        await store.taskService.saveRanks(backfilled);
      }

      const previous = targetIndex > 0 ? columnTasks[targetIndex - 1] : undefined;
      const next = targetIndex < columnTasks.length ? columnTasks[targetIndex] : undefined;
      task.rank = rankBetween(previous?.rank ?? '', next?.rank ?? '');
      task.state = targetState;

      // invariant: state === 'done' <=> completionDate is set
      if (targetState === 'done') {
        if (task.completionDate.length === 0) task.completionDate = getTodayStr();
      } else {
        task.completionDate = '';
      }

      await store.taskService.saveBoardPosition(task, store.currentUser());
      // no reload(): searchData() is an rxfire real-time stream, so the write comes back on its own
    },

    async export(type: string): Promise<void> {
      console.log(`TaskListStore.export(${type}) ist not yet implemented`);
    },

    async add(): Promise<void> {
      if (!this.canCreateTask()) return;
      const currentUser = store.currentUser();
      if (!currentUser?.personKey) return;
      // the cached person carries the gender for the avatar; fall back to the user's own name
      // rather than silently doing nothing while the person list is still loading
      const person = store.appStore.getPerson(currentUser.personKey);
      const author = person ? getAvatarInfo(person, 'person') : getAvatarInfoForCurrentUser(currentUser);
      if (!author) return;
      const task = new TaskModel(store.tenantId());
      task.author = author;
      task.assignee = author; // by default, the task is self-assigned, user can change this in the edit modal
      task.calendars = this.getDefaultCalendars();
      await this.edit(task, false);
    },

    async edit(task: TaskModel, readOnly = true): Promise<void> {
      const { TaskEditModal } = await import('./task-edit.modal');
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
          if ((data.okey ?? '').length === 0) {
            await store.taskService.create(data, store.currentUser());
          } else {
            await store.taskService.update(data, store.currentUser());
          }
          // no reload(): the lists are rxfire real-time streams
        }
      }
    },

    /**
     * Open the admin-only task-settings modal (spec 1.72 §8.2/§9) — the menu row already gates on
     * `roleNeeded: 'admin'`, so this is a defence-in-depth check, same shape as `canCreateTask`.
     * The two `AppConfig` fields are coalesced here (`?? 30`, `?? ''`) because a legacy config doc
     * predates them (Firestore reads skip model defaults — see the class doc on `AppConfig`).
     */
    async editSettings(): Promise<void> {
      if (!hasRole('admin', store.currentUser())) return;
      const config = store.appStore.appConfig();
      const settings: TaskSettings = {
        taskArchiveDays: config.taskArchiveDays ?? 30,
        taskDiaryTenantId: config.taskDiaryTenantId ?? '',
      };
      const tenants = await firstValueFrom(store.appConfigService.list());
      const tenantIds = tenants.map((t) => t.okey);

      const { TaskSettingsModal } = await import('@okr/task-ui');
      const modal = await store.modalController.create({
        component: TaskSettingsModal,
        componentProps: { settings, tenantIds }
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        await store.appConfigService.setTaskSettings(store.tenantId(), data as TaskSettings);
      }
    },

    /** A new task belongs to the list it was created in: the group calendar, else the tenant's own. */
    getDefaultCalendars(): string[] {
      const calendar = store.calendarName();
      return (!calendar || calendar === 'all' || calendar === 'my') ? [store.tenantId()] : [calendar];
    },

    async quickEntry(task: TaskModel): Promise<void> {
      if (!this.canCreateTask()) return;
      // without this, a task typed into a group's quick entry never showed in that group's list
      if (task.calendars.length === 0) task.calendars = this.getDefaultCalendars();
      await store.taskService.create(task, store.currentUser());
    },

    /** Archive a task (soft delete). Gated here, not only in the ActionSheet. */
    async delete(task?: TaskModel): Promise<void> {
      if (!task || !this.canDeleteTask(task)) return;
      await store.taskService.delete(task, store.currentUser());
    },

    /** Toggle completion: open → done today, done → planned. Never mutates the streamed task. */
    async toggleCompleted(task: TaskModel): Promise<void> {
      if (!this.canChangeTask(task)) return;
      await store.taskService.saveCompletion(task, getCompletionPatch(task, getTodayStr()), store.currentUser());
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
      const { data: result, role } = await modal.onWillDismiss<PersonSelectResult>();
      const data = result?.kind === 'predefined' ? result.person : undefined;
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
