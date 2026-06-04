import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { MemberCatConfig } from '@bk2/shared-models';
import { I18nService } from '@bk2/shared-i18n';
import { AppStore } from '@bk2/shared-feature';

import { MembershipService } from '@bk2/relationship-membership-data-access';
import { MEMBER_CAT_SECTION_I18N_KEYS, MemberCatSectionI18n } from '@bk2/cms-section-util';
import { buildCatRows, CatRow } from './member-cat-section.util';

export type { MemberCatSectionI18n };
export { buildCatRows, CatRow };

type MemberCatSectionState = { orgId: string };
const initialState: MemberCatSectionState = { orgId: '' };

export const MemberCatSectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    membershipService: inject(MembershipService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(MEMBER_CAT_SECTION_I18N_KEYS),

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
    rows: computed(() => buildCatRows(
      store.membershipsResource.value() ?? [],
      new Date().toISOString().slice(0, 10).replace(/-/g, '')
    )),
  })),

  withMethods((store) => ({
    setConfig(config: MemberCatConfig | undefined): void {
      patchState(store, { orgId: config?.orgId ?? '' });
    },
  }))
);
