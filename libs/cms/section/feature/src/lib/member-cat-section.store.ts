import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { MemberCatConfig } from '@bk2/shared-models';
import { I18nService } from '@bk2/shared-i18n';
import { MembershipService } from '@bk2/relationship-membership-data-access';

import { PFX } from './scope';
import { buildCatRows, CatRow } from './member-cat-section.util';

export { buildCatRows, CatRow };

const MEMBER_CAT_SECTION_I18N_KEYS = {
  category: PFX + 'memberCat.category',
  male:     PFX + 'memberCat.male',
  female:   PFX + 'memberCat.female',
  total:    PFX + 'memberCat.total',
  empty:    PFX + 'memberCat.empty',
} satisfies Record<string, string>;

export type MemberCatSectionI18n = { [K in keyof typeof MEMBER_CAT_SECTION_I18N_KEYS]: Signal<string> };

type MemberCatSectionState = { orgId: string };
const initialState: MemberCatSectionState = { orgId: '' };

export const MemberCatSectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
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
