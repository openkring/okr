import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { MemberCatConfig } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { AppStore } from '@okr/shared-feature';

import { MembershipService } from '@okr/relationship-membership-data-access';
import { applyCatRowConfig, buildCatRows, CatRow } from './member-cat-section.util';
import { SECTION_I18N_KEYS } from '@okr/cms-section-util';

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
        // the containing ORG, never a group — hence the explicit 'org' filter. Orgs and
        // groups share one key namespace (an org may have an implicit same-key group, e.g.
        // org `scs` + group `scs` "Ganzer Verein"), so a bare key match would add the
        // group's memberships on top and count those members twice.
        return store.membershipService.listMembersOfOrg(params.orgId, 'org');
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
