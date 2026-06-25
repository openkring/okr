import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { MemberCatConfig } from '@bk2/shared-models';
import { I18nService } from '@bk2/shared-i18n';
import { AppStore } from '@bk2/shared-feature';

import { MembershipService } from '@bk2/relationship-membership-data-access';
import { applyCatRowConfig, buildCatRows, CatRow } from './member-cat-section.util';
import { SECTION_I18N_KEYS } from '@bk2/cms-section-util';

export { buildCatRows, CatRow };

type MemberCatSectionState = { orgId: string; categoryFilter: string; sortOrder: 'asc' | 'desc' };
const initialState: MemberCatSectionState = { orgId: '', categoryFilter: '', sortOrder: 'asc' };

export const MemberCatSectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    membershipService: inject(MembershipService),
    i18n: inject(I18nService).translateAll(SECTION_I18N_KEYS)
  })),
  withProps((store) => ({
    membershipsResource: rxResource({
      params: () => ({ orgId: store.orgId() }),
      stream: ({ params }) => {
        if (!params.orgId) return of([]);
        return store.membershipService.listMembersOfOrg(params.orgId);
      },
    }),
  })),

  withComputed((store) => ({
    isLoading: computed(() => store.membershipsResource.isLoading()),
    rows: computed(() => {
      const all = buildCatRows(
        store.membershipsResource.value() ?? [],
        new Date().toISOString().slice(0, 10).replace(/-/g, '')
      );
      return applyCatRowConfig(all, store.categoryFilter(), store.sortOrder());
    }),
  })),

  withMethods((store) => ({
    setConfig(config: MemberCatConfig | undefined): void {
      patchState(store, {
        orgId: config?.orgId ?? '',
        categoryFilter: config?.categoryFilter ?? '',
        sortOrder: config?.sortOrder ?? 'asc',
      });
    },
  }))
);
