import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { map, of } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore, PersonSelectModal, PersonSelectResult } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CategoryListModel, PersonModel, TaskCollection, TaskModel } from '@okr/shared-models';
import { chipMatches, debugItemLoaded, debugListLoaded, getAvatarInfo, getSystemQuery, getTodayStr, hasRole, isPerson, nameMatches, rankBetween } from '@okr/shared-util-core';

import { TaskService } from '@okr/task-data-access';
import { assignMissingRanks, groupTasksByState, isTask, TASK_I18N_KEYS, TaskBoardColumn, TaskI18n } from '@okr/task-util';
import { AvatarService } from '@okr/avatar-data-access';

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

    setGroupAdmin(groupAdmin: boolean) {
      patchState(store, { groupAdmin });
    },

    /******************************* actions *************************************** */
    /**
     * May the current user change this task?
     * Lives in the store because both the list (ActionSheet) and the board (drag handles) need it.
     * 1) privileged/eventAdmin roles, 2) admin of the group the list is scoped to, 3) the task's
     * own author or assignee.
     */
    canChangeTask(task?: TaskModel): boolean {
      const currentUser = store.currentUser();
      if (hasRole('privileged', currentUser)) return true;
      if (hasRole('eventAdmin', currentUser)) return true;
      if (store.groupAdmin()) return true;
      if (task && currentUser) {
        if (task.author?.key === currentUser.personKey) return true;
        if (task.assignee?.key === currentUser.personKey) return true;
      }
      return false;
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
          data.okey?.length === 0 ? 
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
        task.completionDate = getTodayStr();
        task.state = 'done';
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
