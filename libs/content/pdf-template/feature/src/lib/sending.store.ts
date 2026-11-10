import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SendingService } from '@okr/content-pdf-template-data-access';
import { filterSendings, SENDING_I18N_KEYS, SendingI18n, SendingPeriod, SendingStatus } from '@okr/content-pdf-template-util';

interface SendingState {
  status: SendingStatus | 'all';
  period: SendingPeriod;
}

/** All letters of the tenant, live (spec 1.150 §9). Read-only: the server owns the `sendings` docs. */
export const SendingStore = signalStore(
  withState<SendingState>({ status: 'all', period: 'all' }),
  withProps(() => ({
    i18n: inject(I18nService).translateAll(SENDING_I18N_KEYS) as SendingI18n,
    appStore: inject(AppStore),
    sendingService: inject(SendingService),
  })),
  withProps((store) => ({
    sendingsResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: ({ params }) => store.sendingService.list(params.tenantId),
    }),
  })),
  withComputed((store) => {
    const sendings = computed(() => store.sendingsResource.value() ?? []);
    return {
      sendings,
      isLoading: computed(() => store.sendingsResource.isLoading()),
      // evaluated when the data or a filter changes; «now» only moves the period edge by minutes
      filteredSendings: computed(() => filterSendings(sendings(), store.status(), store.period(), new Date())),
    };
  }),
  withMethods((store) => ({
    setStatus(status: SendingStatus | 'all'): void { patchState(store, { status }); },
    setPeriod(period: SendingPeriod): void { patchState(store, { period }); },
  })),
);
