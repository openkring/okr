import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, of } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';

import { DEFAULT_PROJECT_STATE, DEFAULT_TAGS, DEFAULT_TASK_STATE } from '@okr/shared-constants';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ProjectModel } from '@okr/shared-models';
import { AlertService } from '@okr/shared-util-angular';
import { chipMatches, getDayDiff, nameMatches } from '@okr/shared-util-core';
import { duplicateProjectTasks, getProjectParentKey, isProject, PROJECT_I18N_KEYS } from '@okr/project-project-util';
import { ProjectService } from '@okr/project-project-data-access';
import { TaskService } from '@okr/project-task-data-access';

export type ProjectState = {
  // the detail page
  projectKey: string;
  listEnabled: boolean;   // the list component turns this on; the detail page never loads the whole list

  // filter
  searchTerm: string;
  selectedTag: string;
  selectedState: string;
};

export const initialState: ProjectState = {
  projectKey: '',
  listEnabled: false,
  searchTerm: '',
  selectedTag: '',
  selectedState: 'all',
};

const STORE_DATE = /^\d{8}$/;

/**
 * Component-provided (`providers: [ProjectStore]` on the list and the page). The edit modal
 * lives in the ui lib, takes inputs only and does not inject this store, so it is imported
 * dynamically only to keep it out of the feature's initial chunk.
 */
export const ProjectStore = signalStore(
  withState(initialState),
  withProps(() => ({
    projectService: inject(ProjectService),
    taskService: inject(TaskService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    router: inject(Router),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(PROJECT_I18N_KEYS),
    projectsResource: rxResource({
      params: () => store.listEnabled() ? true : undefined,
      stream: () => store.projectService.list(),
    }),
    // archived projects included: a link to one must still open
    projectResource: rxResource({
      params: () => ({ projectKey: store.projectKey() }),
      stream: ({ params }) => params.projectKey ? store.projectService.read(params.projectKey) : of(undefined),
    }),
  })),

  withComputed((state) => ({
    projects: computed(() => state.projectsResource.value() ?? []),
    project: computed(() => state.projectResource.value()),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),
    tags: computed(() => state.appStore.getTags('project')),
    allTags: computed(() => state.appStore.getTags('project') || DEFAULT_TAGS),
    states: computed(() => state.appStore.getCategory('project_state')),
    isLoading: computed(() => state.projectsResource.isLoading()),
  })),

  withComputed((state) => ({
    projectsCount: computed(() => state.projects().length),
    filteredProjects: computed(() =>
      state.projects().filter((p: ProjectModel) =>
        nameMatches(p.index ?? "", state.searchTerm()) &&
        chipMatches(p.tags, state.selectedTag()) &&
        nameMatches(p.state ?? "", state.selectedState())
      )
    ),
  })),

  withMethods((store) => ({
    reset() {
      patchState(store, initialState);
    },
    reload() {
      store.projectsResource.reload();
      store.projectResource.reload();
    },

    /******************************** setters ******************************************* */
    enableList() {
      patchState(store, { listEnabled: true });
    },
    setProjectKey(projectKey: string) {
      patchState(store, { projectKey });
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

    /******************************** actions ******************************************* */
    /** Opens the edit modal; resolves to the confirmed project, or undefined when cancelled. */
    async openEditModal(project: ProjectModel, readOnly = false): Promise<ProjectModel | undefined> {
      const { ProjectEditModal } = await import('@okr/project-project-ui');
      const modal = await store.modalController.create({
        component: ProjectEditModal,
        componentProps: {
          project,
          currentUser: store.currentUser(),
          i18n: store.i18n,
          allTags: store.allTags(),
          states: store.states(),
          readOnly,
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (readOnly || role !== 'confirm' || !data || !isProject(data, store.tenantId())) return undefined;
      return data as ProjectModel;
    },

    async add(): Promise<void> {
      await this.edit(new ProjectModel(store.tenantId()));
    },

    async edit(project: ProjectModel): Promise<void> {
      const result = await this.openEditModal(project);
      if (!result) return;
      if ((result.okey ?? '').length === 0) {
        await store.projectService.create(result, store.currentUser());
      } else {
        await store.projectService.update(result, store.currentUser());
      }
      this.reload();
    },

    /** Deletes after confirmation; the service moves the project's tasks back to the backlog first. */
    async delete(project?: ProjectModel): Promise<void> {
      if (!project?.okey) return;
      if (!await store.alertService.confirm(store.i18n.deleteConfirm(), true)) return;
      await store.projectService.delete(project, store.currentUser());
      this.reload();
    },

    /**
     * Duplicates a project with its open tasks (spec 3.14 D9): the user sets name and new start
     * date in the edit modal, the task due dates shift by the start-date difference. Tasks are
     * created one after the other. Afterwards the new project is opened.
     */
    async duplicate(source: ProjectModel): Promise<void> {
      if (!source.okey) return;
      if (!await store.alertService.confirm(store.i18n.duplicateConfirm(), true)) return;
      const draft: ProjectModel = {
        ...structuredClone(source),
        okey: '',
        isArchived: false,
        name: `${source.name} ${store.i18n.copySuffix()}`,
        state: DEFAULT_PROJECT_STATE,
      };
      const copy = await this.openEditModal(draft);
      if (!copy) return;
      const newKey = await store.projectService.create(copy, store.currentUser());
      if (!newKey) return;

      const tasks = await firstValueFrom(store.taskService.listByParent(getProjectParentKey(source.okey), store.tenantId()));
      // getDayDiff answers -1 for an unparsable date: only call it for two full StoreDates
      const delta = STORE_DATE.test(source.startDate ?? '') && STORE_DATE.test(copy.startDate ?? '')
        ? getDayDiff(source.startDate, copy.startDate)
        : 0;
      const firstState = store.appStore.getCategory('task_state')?.items?.[0]?.name ?? DEFAULT_TASK_STATE;
      const copies = duplicateProjectTasks(tasks, delta, getProjectParentKey(newKey), firstState);
      let copied = 0;
      for (const t of copies) {
        // create() never throws: it answers undefined on failure. Silent = one summary toast below.
        if (await store.taskService.create(t, store.currentUser(), { silent: true })) copied++;
      }
      const message = copied === copies.length ? store.i18n.duplicated() : store.i18n.duplicatedPartial();
      void store.alertService.showToast(message.replace('{count}', String(copied)).replace('{total}', String(copies.length)));
      this.reload();
      await store.router.navigate(['/projects', newKey]);
    },
  })),
);
