import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { map, of } from 'rxjs';

import { AvatarConfig, AvatarInfo, PeopleSection } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { MembershipService } from '@okr/relationship-membership-data-access';
import { ResponsibilityService } from '@okr/relationship-responsibility-data-access';
import { I18nService } from '@okr/shared-i18n';

import { normalizeAvatarConfig, SECTION_I18N_KEYS, SectionI18n } from '@okr/cms-section-util';

export type PeopleSectionState = {
  section: PeopleSection | undefined;
};

const initialState: PeopleSectionState = {
  section: undefined,
};

export const PeopleSectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    membershipService: inject(MembershipService),
    responsibilityService: inject(ResponsibilityService),
    i18n: inject(I18nService).translateAll(SECTION_I18N_KEYS) as SectionI18n
  })),

  withProps((store) => ({
    // gate on currentUser: memberships/responsibilities require an authenticated tenant user (tenantRead).
    // Firing before auth is restored (notably mobile Safari) yields "Missing or insufficient permissions".
    groupMembersResource: rxResource({
      params: () => ({ groupId: store.section()?.properties.groupId ?? '', currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([]);
        return store.membershipService.listMembersOfOrg(params.groupId, 'group');
      },
    }),
    responsibilityResource: rxResource({
      params: () => ({ responsibilityId: store.section()?.properties.responsibilityId ?? '', currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => {
        if (!params.currentUser) return of(undefined);
        if (!params.responsibilityId) return store.responsibilityService.list().pipe(map(() => undefined));
        return store.responsibilityService.read(params.responsibilityId);
      },
    }),
  })),
  withComputed((state) => ({
    avatarConfig: computed<AvatarConfig>(() => normalizeAvatarConfig(state.section()?.properties.avatar)),
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
  withComputed((state) => ({
    /**
     * person key → email shown with the person (only when info contains 'email'):
     * - responsibility: the role's public address (ResponsibilityModel.email, typically a club alias)
     * - persons / group: the favorite email of the address-directory projection, which only signed-in
     *   members of the tenant can read — anonymous visitors get an empty map.
     */
    emails: computed<Record<string, string>>(() => {
      const section = state.section();
      if (!section || !state.avatarConfig().info.includes('email')) return {};
      const emails: Record<string, string> = {};
      if ((section.properties.type ?? 'persons') === 'responsibility') {
        const r = state.responsibilityResource.value();
        const email = r?.email?.trim();
        if (!r || !email) return {};
        for (const avatar of [r.responsibleAvatar, r.delegateAvatar]) {
          if (avatar?.key) emails[avatar.key] = email;
        }
        return emails;
      }
      if (!state.appStore.currentUser()) return {};
      for (const person of state.persons()) {
        const email = state.appStore.getDirectoryEntry(`${person.modelType}.${person.key}`)?.favEmail?.trim();
        if (email) emails[person.key] = email;
      }
      return emails;
    }),
  })),
  withMethods((store) => ({
    setSection(section: PeopleSection | undefined): void {
      patchState(store, { section });
    },
  })),
);
