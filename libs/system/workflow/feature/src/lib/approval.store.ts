import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ApprovalCollection, ApprovalModel } from '@okr/shared-models';
import { buildExportTable, debugListLoaded, getSystemQuery, hasRole, nameMatches } from '@okr/shared-util-core';
import { AlertService, exportCsv, getExportFileName, showToast } from '@okr/shared-util-angular';

import { ApprovalService } from '@okr/system-workflow-data-access';
import { WORKFLOW_I18N_KEYS, WorkflowI18n, getApprovalExportColumns, isUnassigned } from '@okr/system-workflow-util';

/** Which slice of the tenant's approvals the list shows. */
export type ApprovalScope = 'mine' | 'unassigned' | 'all';

export type ApprovalState = {
  searchTerm: string;
  scope: ApprovalScope;
  showDecided: boolean;
};

const initialState: ApprovalState = {
  searchTerm: '',
  // The approver's own pending decisions are what the notification led them here for.
  scope: 'mine',
  showDecided: false,
};

export const ApprovalStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    alertService: inject(AlertService),
    approvalService: inject(ApprovalService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(WORKFLOW_I18N_KEYS),
  })),
  withProps((store) => ({
    approvalsResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([] as ApprovalModel[]);
        return store.firestoreService.searchData<ApprovalModel>(
          ApprovalCollection, getSystemQuery(store.appStore.tenantId()), 'index', 'asc'
        ).pipe(debugListLoaded<ApprovalModel>('ApprovalStore.approvals', params.currentUser));
      },
    }),
  })),

  withComputed((state) => ({
    approvals: computed(() => state.approvalsResource.value() ?? []),
    isLoading: computed(() => state.approvalsResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),
  })),

  withComputed((state) => ({
    isAdmin: computed(() => hasRole('admin', state.currentUser())),
    myPersonKey: computed(() => state.currentUser()?.personKey ?? ''),
  })),

  withComputed((state) => ({
    filteredApprovals: computed(() => {
      const scope = state.scope();
      const me = state.myPersonKey();
      return state.approvals()
        .filter((a) => state.showDecided() || (a.state ?? 'pending') === 'pending')
        .filter((a) => {
          if (scope === 'mine') return (a.approver?.key ?? '') === me && me !== '';
          if (scope === 'unassigned') return isUnassigned(a);
          return true;
        })
        .filter((a) => nameMatches(a.index, state.searchTerm()));
    }),
    // pending decisions of the current user — the count the list header shows
    myPendingCount: computed(() =>
      state.approvals().filter((a) =>
        (a.state ?? 'pending') === 'pending' && (a.approver?.key ?? '') === state.myPersonKey()).length),
  })),

  withMethods((store) => ({
    setSearchTerm(searchTerm: string) { patchState(store, { searchTerm }); },
    setScope(scope: ApprovalScope) { patchState(store, { scope }); },
    toggleDecided() { patchState(store, { showDecided: !store.showDecided() }); },

    reload() { store.approvalsResource.reload(); },

    /**
     * May the current user decide this one? The CF is the real gate — this only keeps the
     * UI from offering a button that would be refused.
     */
    canDecide(approval: ApprovalModel): boolean {
      if ((approval.state ?? 'pending') !== 'pending') return false;
      return store.isAdmin() || (approval.approver?.key ?? '') === store.myPersonKey();
    },

    canWithdraw(approval: ApprovalModel): boolean {
      if ((approval.state ?? 'pending') !== 'pending') return false;
      return this.canDecide(approval) || (approval.requestedBy?.key ?? '') === store.myPersonKey();
    },

    async open(approval: ApprovalModel): Promise<void> {
      // dynamic import: the modal statically imports this store's siblings, and a
      // top-level import here would close the cycle (see the new-feature skill).
      const { ApprovalDecideModal } = await import('@okr/system-workflow-ui');
      const modal = await store.modalController.create({
        component: ApprovalDecideModal,
        componentProps: {
          approval,
          readOnly: !this.canDecide(approval),
          canWithdraw: this.canWithdraw(approval),
        },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role !== 'confirm' || !data?.decision) return;
      await this.decide(approval, data.decision, data.note ?? '');
    },

    async decide(approval: ApprovalModel, decision: 'approve' | 'reject' | 'withdraw', note: string): Promise<void> {
      try {
        await store.approvalService.decide(approval.okey, decision, note);
        showToast(store.toastController, store.i18n.approval_decided_conf());
      } catch (error) {
        // Never swallow: a failed decision looks exactly like a successful one otherwise.
        store.alertService.error(`${store.i18n.approval_decided_error()} ${error instanceof Error ? error.message : ''}`);
      }
      this.reload();
    },

    async export(): Promise<void> {
      const columns = getApprovalExportColumns(store.i18n as WorkflowI18n);
      await exportCsv(buildExportTable(store.filteredApprovals(), columns), getExportFileName('approvals', 'csv'));
      showToast(store.toastController, store.i18n.approval_export_conf());
    },
  })),
);
