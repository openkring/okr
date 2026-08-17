import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { MemberAgeConfig } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { AppStore } from '@okr/shared-feature';

import { MembershipService } from '@okr/relationship-membership-data-access';
import { SECTION_I18N_KEYS } from '@okr/cms-section-util';

export type AgeRow = { label: string; male: number; female: number; total: number };

const AGE_BUCKETS: Array<{ label: string; test: (age: number) => boolean }> = [
  { label: '< 20',  test: (a) => a < 20 },
  { label: '20–30', test: (a) => a >= 20 && a <= 30 },
  { label: '31–40', test: (a) => a >= 31 && a <= 40 },
  { label: '41–50', test: (a) => a >= 41 && a <= 50 },
  { label: '51–60', test: (a) => a >= 51 && a <= 60 },
  { label: '61–70', test: (a) => a >= 61 && a <= 70 },
  { label: '71–80', test: (a) => a >= 71 && a <= 80 },
  { label: '81–90', test: (a) => a >= 81 && a <= 90 },
  { label: '> 90',  test: (a) => a > 90 },
];

function computeAge(dob: string, todayStr: string): number {
  if (!dob || dob.length !== 8) return -1;
  const age = Number(todayStr.substring(0, 4)) - Number(dob.substring(0, 4));
  return todayStr.substring(4) < dob.substring(4) ? age - 1 : age;
}

// Pure helper — exported so it can be unit-tested independently if test infra is added
export function buildAgeRows(
  memberships: Array<{ memberDateOfBirth?: string; memberType?: string; memberModelType?: string; relIsLast?: boolean; dateOfExit?: string }>,
  today: string
): AgeRow[] {
  // Age stats are person-only (age/gender are person attributes); skip org/group members.
  const active = memberships.filter(m => m.memberModelType === 'person' && m.relIsLast === true && (m.dateOfExit ?? '') > today);
  const rows: AgeRow[] = AGE_BUCKETS.map(bucket => {
    let male = 0;
    let female = 0;
    for (const m of active) {
      const age = computeAge(m.memberDateOfBirth ?? '', today);
      if (age < 0 || !bucket.test(age)) continue;
      if (m.memberType === 'male') male++;
      else if (m.memberType === 'female') female++;
    }
    return { label: bucket.label, male, female, total: male + female };
  });
  const totals = rows.reduce(
    (acc, r) => ({ label: 'Total', male: acc.male + r.male, female: acc.female + r.female, total: acc.total + r.total }),
    { label: 'Total', male: 0, female: 0, total: 0 }
  );
  return [...rows, totals];
}

type MemberAgeSectionState = { orgId: string; sortOrder: 'asc' | 'desc' };
const initialState: MemberAgeSectionState = { orgId: '', sortOrder: 'asc' };

export const MemberAgeSectionStore = signalStore(
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
        // Member age stats are person-only (age is a person attribute); orgId is the
        // containing ORG, never a group — hence the explicit 'org' filter. Orgs and groups
        // share one key namespace (an org may have an implicit same-key group, e.g. org
        // `scs` + group `scs` "Ganzer Verein"), so a bare key match would add the group's
        // memberships on top and count those members twice.
        return store.membershipService.listMembersOfOrg(params.orgId, 'org');
      },
    }),
  })),

  withComputed((store) => ({
    isLoading: computed(() => store.membershipsResource.isLoading()),
    rows: computed(() => {
      const all = buildAgeRows(
        store.membershipsResource.value() ?? [],
        new Date().toISOString().slice(0, 10).replace(/-/g, '')
      );
      if (store.sortOrder() !== 'desc' || all.length === 0) return all;
      const total = all[all.length - 1];
      return [...all.slice(0, -1).reverse(), total]; // reverse age buckets, keep Total last
    }),
  })),

  withMethods((store) => ({
    setConfig(config: MemberAgeConfig | undefined): void {
      patchState(store, { orgId: config?.orgId ?? '', sortOrder: config?.sortOrder ?? 'asc' });
    },
  }))
);
