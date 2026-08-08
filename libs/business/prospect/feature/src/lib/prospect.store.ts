import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ProspectModel, ProspectStatus } from '@okr/shared-models';
import { debugListLoaded, nameMatches } from '@okr/shared-util-core';
import { AlertService } from '@okr/shared-util-angular';

import { PartnerService } from '@okr/business-partner-data-access';
import { ProspectService } from '@okr/business-prospect-data-access';
import { PROSPECT_I18N_KEYS, isInPool } from '@okr/business-prospect-util';

export type ProspectState = {
  searchTerm: string;
  isRevoking: boolean;
};

const initialState: ProspectState = {
  searchTerm: '',
  isRevoking: false,
};

export const ProspectStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    alertService: inject(AlertService),
    prospectService: inject(ProspectService),
    partnerService: inject(PartnerService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(PROSPECT_I18N_KEYS),
  })),
  withProps((store) => ({
    prospectsResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => store.prospectService.list().pipe(
        debugListLoaded<ProspectModel>('ProspectStore.prospects', params.currentUser),
      ),
    }),
    // Same lookup as the metering ledger: a claim stores a `partnerKey`, and a key is not a
    // name anyone can act on.
    partnersResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: () => store.partnerService.list(),
    }),
  })),

  withComputed((state) => ({
    prospects: computed(() => state.prospectsResource.value() ?? []),
    isLoading: computed(() => state.prospectsResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
    partnerNames: computed(() => new Map(
      (state.partnersResource.value() ?? []).map(p => [p.okey, p.name]))),
  })),

  withComputed((state) => ({
    filteredProspects: computed(() =>
      state.prospects().filter(p => nameMatches(p.index, state.searchTerm()))),
    // Not `status === 'open'`: a claim whose three months have elapsed is back in the pool the
    // moment it expires, whether or not anything has rewritten its status (C5 §3). The count in
    // the header has to agree with what a partner's `listProspects` actually returns.
    poolCount: computed(() => state.prospects().filter(p => isInPool(p)).length),
  })),

  withMethods((store) => ({
    setSearchTerm(searchTerm: string) { patchState(store, { searchTerm }); },

    reload() { store.prospectsResource.reload(); },

    partnerName(partnerKey: string): string {
      return partnerKey ? (store.partnerNames().get(partnerKey) ?? partnerKey) : '';
    },

    statusLabel(status: ProspectStatus): string {
      switch (status) {
        case 'claimed':   return store.i18n.status_claimed();
        case 'converted': return store.i18n.status_converted();
        case 'expired':   return store.i18n.status_expired();
        case 'withdrawn': return store.i18n.status_withdrawn();
        default:          return store.i18n.status_open();
      }
    },

    /**
     * C5 §7 — a revocation beats an active claim, immediately.
     *
     * The partner is named back to the admin rather than mailed automatically: the partner became
     * an independent controller the moment they received the lead (Vertragswerk Teil III.2), so
     * what is owed them is a notice that contact must stop — their own copy is their own erasure
     * duty, and bkaiser cannot delete data in a partner's installation.
     */
    async revoke(prospect?: ProspectModel): Promise<void> {
      if (!prospect || store.isRevoking()) return;
      const ok = await store.alertService.confirm(store.i18n.revoke_confirm(), true);
      if (ok !== true) return;
      patchState(store, { isRevoking: true });
      try {
        const result = await store.prospectService.revoke(prospect.okey);
        await store.alertService.showToast(store.i18n.revoke_conf());
        if (result.partnerToNotify) {
          await store.alertService.confirm(`${store.i18n.revoke_notify()} ${result.partnerName}`, false);
        }
        this.reload();
      } catch (error) {
        store.alertService.error(`${store.i18n.revoke_error()} ${error}`);
      } finally {
        patchState(store, { isRevoking: false });
      }
    },
  })),
);
