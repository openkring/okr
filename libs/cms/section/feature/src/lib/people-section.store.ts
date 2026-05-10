import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { map } from 'rxjs';

import { AVATAR_CONFIG_SHAPE, AvatarConfig, AvatarInfo, PeopleSection } from '@bk2/shared-models';
import { MembershipService } from '@bk2/relationship-membership-data-access';
import { ResponsibilityService } from '@bk2/relationship-responsibility-data-access';

export type PeopleSectionState = {
  section: PeopleSection | undefined;
};

const initialState: PeopleSectionState = {
  section: undefined,
};

export const PeopleSectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    membershipService: inject(MembershipService),
    responsibilityService: inject(ResponsibilityService),
  })),
  withProps((store) => ({
    groupMembersResource: rxResource({
      params: () => ({ groupId: store.section()?.properties.groupId ?? '' }),
      stream: ({ params }) => store.membershipService.listMembersOfOrg(params.groupId),
    }),
    responsibilityResource: rxResource({
      params: () => ({ responsibilityId: store.section()?.properties.responsibilityId ?? '' }),
      stream: ({ params }) => {
        if (!params.responsibilityId) return store.responsibilityService.list().pipe(map(() => undefined));
        return store.responsibilityService.read(params.responsibilityId);
      },
    }),
  })),
  withComputed((state) => ({
    avatarConfig: computed<AvatarConfig>(() => state.section()?.properties.avatar ?? AVATAR_CONFIG_SHAPE),
    persons: computed<AvatarInfo[]>(() => {
      const type = state.section()?.properties.type ?? 'persons';
      switch (type) {
        case 'group': {
          const memberships = state.groupMembersResource.value() ?? [];
          return state.membershipService.getMemberAvatars(memberships);
        }
        case 'responsibility': {
          const r = state.responsibilityResource.value();
          if (!r) return [];
          const persons: AvatarInfo[] = [];
          if (r.responsibleAvatar) persons.push(r.responsibleAvatar);
          if (r.delegateAvatar) persons.push(r.delegateAvatar);
          return persons;
        }
        default:
          return state.section()?.properties.persons ?? [];
      }
    }),
    isLoading: computed(() => state.groupMembersResource.isLoading() || state.responsibilityResource.isLoading()),
  })),
  withMethods((store) => ({
    setSection(section: PeopleSection | undefined): void {
      patchState(store, { section });
    },
  })),
);
