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
      // gate on currentUser: the memberships collection requires an authenticated tenant user (tenantRead).
      // Firing before auth is restored (notably mobile Safari) yields "Missing or insufficient permissions".
      params: () => ({ orgId: store.orgId(), currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => {
        if (!params.currentUser || !params.orgId) return of([]);
        // Member category stats are person-only (category is a person attribute); orgId is
        // the containing org. The org/group key collision is not disambiguated here — only
        // the legacy `scs` key can collide, and new groups use random keys.
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
