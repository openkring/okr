import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ResponsibilityCollection, ResponsibilityModel, WorkflowRuleCollection, WorkflowRuleModel, WorkflowRuleModelName } from '@okr/shared-models';
import { buildExportTable, debugListLoaded, getSystemQuery, nameMatches } from '@okr/shared-util-core';
import { AlertService, exportCsv, getExportFileName, showToast } from '@okr/shared-util-angular';

import { WorkflowRuleService } from '@okr/system-workflow-data-access';
import { WORKFLOW_I18N_KEYS, WorkflowI18n, getWorkflowRuleExportColumns, newWorkflowRuleModel } from '@okr/system-workflow-util';

export type WorkflowRuleState = {
  searchTerm: string;
};

const initialState: WorkflowRuleState = {
  searchTerm: '',
};

export const WorkflowRuleStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    alertService: inject(AlertService),
    workflowRuleService: inject(WorkflowRuleService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(WORKFLOW_I18N_KEYS),
  })),
  withProps((store) => ({
    rulesResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => {
        // workflow-rules is admin-gated; querying it without a user is a guaranteed
        // permission-denied when a logout leaves this view mounted.
        if (!params.currentUser) return of([] as WorkflowRuleModel[]);
        return store.firestoreService.searchData<WorkflowRuleModel>(
          WorkflowRuleCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc'
        ).pipe(debugListLoaded<WorkflowRuleModel>('WorkflowRuleStore.rules', params.currentUser));
      },
    }),
    // a rule points at a responsibility by okey; the list and the export show its name
    responsibilitiesResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([] as ResponsibilityModel[]);
        return store.firestoreService.searchData<ResponsibilityModel>(
          // same ordering as ResponsibilityService.list() — the composite index exists for it
          ResponsibilityCollection, getSystemQuery(store.appStore.tenantId()), 'validFrom', 'asc'
        );
      },
    }),
  })),

  withComputed((state) => ({
    rules: computed(() => state.rulesResource.value() ?? []),
    isLoading: computed(() => state.rulesResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),
  })),

  withComputed((state) => ({
    filteredRules: computed(() =>
      state.rules().filter(r => nameMatches(r.index, state.searchTerm()))
    ),
    // okey → name; an unknown key falls back to the key itself (deleted responsibility)
    responsibilityNames: computed(() =>
      new Map((state.responsibilitiesResource.value() ?? []).map(r => [r.okey, r.name]))
    ),
    // the rule form's responsibility picker
    responsibilityOptions: computed(() =>
      (state.responsibilitiesResource.value() ?? []).map(r => ({ key: r.okey, name: r.name }))
    ),
  })),

  withMethods((store) => ({
    setSearchTerm(searchTerm: string) { patchState(store, { searchTerm }); },

    responsibilityName(key: string): string { return store.responsibilityNames().get(key) ?? key; },

    reload() { store.rulesResource.reload(); },

    async add(): Promise<void> {
      if (!store.currentUser()) return;
      await this.edit(newWorkflowRuleModel(store.tenantId()), false);
    },

    async edit(rule: WorkflowRuleModel, readOnly = true): Promise<void> {
      // dynamic import: the modal statically imports this store's siblings, and a
      // top-level import here would close the cycle (see the new-feature skill).
      const { WorkflowRuleEditModal } = await import('@okr/system-workflow-ui');
      const modal = await store.modalController.create({
        component: WorkflowRuleEditModal,
        componentProps: {
          rule,
          currentUser: store.currentUser(),
          eventCategory: store.appStore.getCategory('workflow_event'),
          probeCategory: store.appStore.getCategory('workflow_probe'),
          responsibilities: store.responsibilityOptions(),
          allTags: store.appStore.getTags(WorkflowRuleModelName),
          readOnly,
        },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && !readOnly) {
        if (data.okey?.length === 0) await store.workflowRuleService.create(data, store.currentUser());
        else await store.workflowRuleService.update(data, store.currentUser());
        this.reload();
      }
    },

    async export(): Promise<void> {
      const columns = getWorkflowRuleExportColumns(store.i18n as WorkflowI18n, (key) => this.responsibilityName(key));
      await exportCsv(buildExportTable(store.filteredRules(), columns), getExportFileName('workflow-rules', 'csv'));
      showToast(store.toastController, store.i18n.export_conf());
    },

    async delete(rule?: WorkflowRuleModel): Promise<void> {
      if (!rule) return;
      const result = await store.alertService.confirm(store.i18n.delete_confirm(), true);
      if (result === true) {
        await store.workflowRuleService.delete(rule, store.currentUser());
        this.reload();
      }
    },
  })),
);
