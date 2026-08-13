import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { WorkflowRuleCollection, WorkflowRuleModel } from '@okr/shared-models';
import { debugListLoaded, getSystemQuery, nameMatches } from '@okr/shared-util-core';
import { AlertService } from '@okr/shared-util-angular';

import { WorkflowRuleService } from '@okr/system-workflow-data-access';
import { WORKFLOW_I18N_KEYS, newWorkflowRuleModel } from '@okr/system-workflow-util';

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
          WorkflowRuleCollection, getSystemQuery(store.appStore.tenantId()), 'order', 'asc'
        ).pipe(debugListLoaded<WorkflowRuleModel>('WorkflowRuleStore.rules', params.currentUser));
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
  })),

  withMethods((store) => ({
    setSearchTerm(searchTerm: string) { patchState(store, { searchTerm }); },

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
