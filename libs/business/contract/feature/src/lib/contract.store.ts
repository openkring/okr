import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { ContractService } from '@okr/business-contract-data-access';
import { CONTRACT_I18N_KEYS, ContractI18n, newContractModel, sumLoans } from '@okr/business-contract-util';
import { AppStore, ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ContractModel, UserModel } from '@okr/shared-models';
import { AlertService, resourceParams } from '@okr/shared-util-angular';
import { addDuration, debugListLoaded, getTodayStr, hasRole, nameMatches } from '@okr/shared-util-core';

export type ContractListId = 'all' | 'my';

/** Same predicate as isContractReaderGuard: treasurer, privileged or auditor (admin included by hasRole). */
export function isContractReader(user: UserModel | undefined): boolean {
  return hasRole('treasurer', user) || hasRole('privileged', user) || hasRole('auditor', user);
}

/** Days ahead the "Frist in 90 Tagen" filter looks (spec 1.5 §8). */
export const CONTRACT_DUE_SOON_DAYS = 90;

export type ContractStoreState = {
  searchTerm: string;
  /** '' = nothing to list (e.g. the detail page's own store instance) */
  listId: ContractListId | '';
  typeFilter: string;      // 'all' | ContractType
  stateFilter: string;     // 'all' | ContractState (model)
  dueSoon: boolean;
};

const initialState: ContractStoreState = {
  searchTerm: '',
  listId: '',
  typeFilter: 'all',
  stateFilter: 'all',
  dueSoon: false,
};

/**
 * Contracts (spec 1.5 §5.1, §8). Two read paths, both provable by the Firestore rules:
 * - `all` (staff): treasurer/admin see every contract incl. strictly confidential ones;
 *   privileged/auditor get the `isStrictlyConfidential == false` query.
 * - `my`: contracts where the current person is a party (`partyPersonKeys`).
 *
 * The contract modals live in @okr/business-contract-ui and are imported dynamically: they do not
 * inject this store, but the dynamic import keeps the ui lib out of the list's chunk and avoids the
 * store↔modal cycle should they ever need to.
 */
export const ContractStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    contractService: inject(ContractService),
    modelSelectService: inject(ModelSelectService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(CONTRACT_I18N_KEYS) as ContractI18n,
    contractsResource: rxResource({
      // value-compared primitives: users/{uid} arrives twice at boot (cache, then server) and must
      // not re-run the query (memory: rxResource params not value-compared)
      params: resourceParams(() => {
        const user = store.appStore.currentUser();
        return {
          personKey: user?.personKey ?? '',
          includeStrict: hasRole('treasurer', user),   // treasurer or admin
          isReader: isContractReader(user),
          listId: store.listId(),
        };
      }),
      stream: ({ params }) => {
        const user = store.appStore.currentUser();
        if (!user || !params.listId) return of([] as ContractModel[]);
        if (params.listId === 'my') {
          return store.contractService.listMine(params.personKey)
            .pipe(debugListLoaded<ContractModel>('ContractStore.myContracts', user));
        }
        // defense in depth: never fire a staff query the rules would deny
        if (!params.isReader) return of([] as ContractModel[]);
        return store.contractService.listStaff(params.includeStrict)
          .pipe(debugListLoaded<ContractModel>('ContractStore.contracts', user));
      },
    }),
  })),

  withComputed((state) => ({
    // a rules denial puts the resource in error state, where value() throws
    contracts: computed(() => (state.contractsResource.hasValue() ? state.contractsResource.value() : undefined) ?? []),
    // a reload keeps the grid; the spinner is for the first load only
    isLoading: computed(() => state.contractsResource.isLoading() && !state.contractsResource.hasValue()),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),
    /** treasurer or admin — the only roles the rules let write contracts */
    canEdit: computed(() => hasRole('treasurer', state.appStore.currentUser())),
  })),

  withComputed((state) => ({
    filteredContracts: computed(() => {
      const soon = addDuration(getTodayStr(), { days: CONTRACT_DUE_SOON_DAYS });
      return state.contracts().filter((c) =>
        nameMatches(c.index, state.searchTerm())
        && (state.typeFilter() === 'all' || c.contractType === state.typeFilter())
        && (state.stateFilter() === 'all' || c.state === state.stateFilter())
        && (!state.dueSoon() || (!!c.nextDeadline && c.nextDeadline <= soon)));
    }),
    hasLoans: computed(() => state.contracts().some((c) => !!c.loan)),
    loanTotals: computed(() => sumLoans(state.contracts())),
  })),

  withMethods((store) => ({
    setListId(listId: ContractListId): void { patchState(store, { listId }); },
    setSearchTerm(searchTerm: string): void { patchState(store, { searchTerm }); },
    setTypeFilter(typeFilter: string): void { patchState(store, { typeFilter: typeFilter || 'all' }); },
    setStateFilter(stateFilter: string): void { patchState(store, { stateFilter: stateFilter || 'all' }); },
    toggleDueSoon(): void { patchState(store, { dueSoon: !store.dueSoon() }); },

    reload(): void { store.contractsResource.reload(); },

    async add(): Promise<void> {
      if (!store.currentUser() || !store.canEdit()) return;
      await this.edit(newContractModel(store.tenantId()), false);
    },

    /** Opens the edit modal; anybody without write permission always gets it read-only. */
    async edit(contract: ContractModel, readOnly = true): Promise<void> {
      const isReadOnly = readOnly || !store.canEdit();
      const { ContractEditModal } = await import('@okr/business-contract-ui');
      const modal = await store.modalController.create({
        component: ContractEditModal,
        componentProps: {
          contract,
          currentUser: store.currentUser(),
          tenantId: store.tenantId(),
          readOnly: isReadOnly,
          // pickers are passed IN as callbacks: the ui lib must not depend on @okr/shared-feature
          selectPerson: () => store.modelSelectService.selectPersonAvatar(undefined, undefined, false, false),
          selectOrg: () => store.modelSelectService.selectOrgAvatar(),
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role !== 'confirm' || !data || isReadOnly) return;
      const edited = data as ContractModel;
      if (!edited.okey) await store.contractService.create(edited, store.currentUser());
      else await store.contractService.update(edited, store.currentUser());
      this.reload();
    },

    /** "Kündigung erfassen": the modal returns noticeGivenDate/By, effectiveEndDate and state 'noticeGiven'. */
    async giveNotice(contract: ContractModel): Promise<void> {
      if (!store.canEdit()) return;
      const { ContractNoticeModal } = await import('@okr/business-contract-ui');
      const modal = await store.modalController.create({
        component: ContractNoticeModal,
        componentProps: { contract },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role !== 'confirm' || !data) return;
      await store.contractService.update({ ...contract, ...data }, store.currentUser());
      this.reload();
    },

    /** Contracts are archived, never deleted (spec §3.4). */
    async archive(contract: ContractModel): Promise<void> {
      if (!store.canEdit()) return;
      if (!(await store.alertService.confirm(store.i18n.archive_confirm(), true))) return;
      await store.contractService.archive(contract, store.currentUser());
      this.reload();
    },
  })),
);
