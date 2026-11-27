import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { combineLatest, map, of } from 'rxjs';

import { applyPeopleOverrides, AvatarConfig, AvatarInfo, PeopleSection, peopleHiddenKeys, ResponsibilityModel } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { MembershipService } from '@okr/relationship-membership-data-access';
import { ResponsibilityService } from '@okr/relationship-responsibility-data-access';
import { getResponsibilityPortraitKey } from '@okr/relationship-responsibility-util';
import { sortMembersBySortOrder } from '@okr/relationship-membership-util';
import { AvatarService } from '@okr/avatar-data-access';
import { I18nService } from '@okr/shared-i18n';

import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { resourceParams } from '@okr/shared-util-angular';
import {
  getPeopleResponsibilityIds, getPeopleResponsibilityParentKey, getResponsibilityKeysUnderParent, mergeResponsibilityKeys,
  normalizeAvatarConfig, SECTION_I18N_KEYS, SectionI18n,
} from '@okr/cms-section-util';

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
    avatarService: inject(AvatarService),
    i18n: inject(I18nService).translateAll(SECTION_I18N_KEYS) as SectionI18n
  })),

  withProps((store) => ({
    // gate on currentUser: memberships/responsibilities require an authenticated tenant user (tenantRead).
    // Firing before auth is restored (notably mobile Safari) yields "Missing or insufficient permissions".
    groupMembersResource: rxResource({
      // primitives compared by value: an edit of the section that keeps the group never reads again (the editor's canvas)
      params: resourceParams(() => ({ groupId: store.section()?.properties.groupId ?? '', hasUser: !!store.appStore.currentUser() })),
      stream: ({ params }) => {
        if (!params.hasUser) return of([]);
        return store.membershipService.listMembersOfOrg(params.groupId, 'group');
      },
    }),
    // the chosen responsibilities in their order (a legacy single responsibilityId is a list of one), then
    // the active ones under responsibilityParentKey. The ids are joined into one string so that an equal
    // list does not re-read (compared by value, see resourceParams).
    responsibilitiesResource: rxResource({
      params: resourceParams(() => ({
        ids: getPeopleResponsibilityIds(store.section()?.properties).join(','),
        parentKey: getPeopleResponsibilityParentKey(store.section()?.properties),
        hasUser: !!store.appStore.currentUser(),
      })),
      stream: ({ params }) => {
        if (!params.hasUser || (!params.ids && !params.parentKey)) return of([] as ResponsibilityModel[]);
        const chosen$ = params.ids
          ? combineLatest(params.ids.split(',').map(id => store.responsibilityService.read(id)))
          : of([] as (ResponsibilityModel | undefined)[]);
        const underParent$ = params.parentKey
          ? store.responsibilityService.listForParent(params.parentKey)
          : of([] as ResponsibilityModel[]);
        return combineLatest([chosen$, underParent$]).pipe(
          map(([chosen, underParent]) => {
            const byKey = new Map<string, ResponsibilityModel>();
            for (const r of [...chosen, ...underParent]) if (r?.okey) byKey.set(r.okey, r);
            const today = getTodayStr(DateFormat.StoreDate);
            const keys = mergeResponsibilityKeys(
              chosen.filter((r): r is ResponsibilityModel => !!r).map(r => r.okey),
              getResponsibilityKeysUnderParent(underParent, params.parentKey, today),
            );
            return keys.map(k => byKey.get(k)).filter((r): r is ResponsibilityModel => !!r);
          })
        );
      },
    }),
  })),
  withComputed((state) => ({
    avatarConfig: computed<AvatarConfig>(() => normalizeAvatarConfig(state.section()?.properties.avatar)),
    /** the persons of the source, before any override */
    sourcePersons: computed<AvatarInfo[]>(() => {
      const type = state.section()?.properties.type ?? 'persons';
      switch (type) {
        case 'group': {
          // in the group's manual order (sortOrder, set by dragging the group's member list)
          const memberships = sortMembersBySortOrder(state.groupMembersResource.value() ?? []);
          return state.membershipService.getMemberAvatars(memberships);
        }
        case 'responsibility': {
          // responsible and delegate of each responsibility; a person holding several is shown once
          const persons: AvatarInfo[] = [];
          for (const r of state.responsibilitiesResource.value() ?? []) {
            for (const avatar of [r.responsibleAvatar, r.delegateAvatar]) {
              if (avatar?.key && !persons.some(p => p.key === avatar.key)) persons.push(avatar);
            }
          }
          return persons;
        }
        default:
          return state.section()?.properties.persons ?? [];
      }
    }),
    hiddenKeys: computed<string[]>(() => peopleHiddenKeys(state.section()?.properties)),
    isLoading: computed(() => state.groupMembersResource.isLoading() || state.responsibilitiesResource.isLoading()),
  })),
  withComputed((state) => ({
    /** every person of the source in the wanted order, the hidden ones included (for the editor) */
    allPersons: computed<AvatarInfo[]>(() => applyPeopleOverrides(state.sourcePersons(), state.section()?.properties, { keepHidden: true })),
  })),
  withComputed((state) => ({
    /** the persons the section shows: hidden removed, so emails / images follow */
    persons: computed<AvatarInfo[]>(() => {
      const hidden = new Set(state.hiddenKeys());
      return state.allPersons().filter(p => !hidden.has(p.key));
    }),
  })),
  withComputed((state) => ({
    /**
     * person key → function shown with the person (info 'function'): for responsibilities the
     * name of the responsibility (several joined with a comma); otherwise the person's own label.
     */
    functions: computed<Record<string, string>>(() => {
      const section = state.section();
      if ((section?.properties.type ?? 'persons') !== 'responsibility') return {};
      const names: Record<string, string[]> = {};
      for (const r of state.responsibilitiesResource.value() ?? []) {
        for (const avatar of [r.responsibleAvatar, r.delegateAvatar]) {
          if (!avatar?.key || !r.name) continue;
          const list = names[avatar.key] ?? (names[avatar.key] = []);
          if (!list.includes(r.name)) list.push(r.name);
        }
      }
      return Object.fromEntries(Object.entries(names).map(([key, list]) => [key, list.join(', ')]));
    }),
    /**
     * person key → avatar key of a responsibility's own portrait (`responsibility.<okey>`), which then
     * replaces the responsible person's avatar; the first responsibility with a portrait wins.
     * Only the responsible is affected, not the delegate. Without a portrait the person's avatar stays.
     */
    imageKeys: computed<Record<string, string>>(() => {
      if ((state.section()?.properties.type ?? 'persons') !== 'responsibility') return {};
      const keys: Record<string, string> = {};
      for (const r of state.responsibilitiesResource.value() ?? []) {
        const personKey = r.responsibleAvatar?.key;
        const portraitKey = getResponsibilityPortraitKey(r.okey);
        if (!personKey || keys[personKey] || !portraitKey) continue;
        if (state.avatarService.getCachedStoragePath(portraitKey)) keys[personKey] = portraitKey;
      }
      return keys;
    }),
    /**
     * person key → email of the person (only when info contains 'email' or 'emailLink'):
     * - responsibility: the role's public address (ResponsibilityModel.email, typically a club alias)
     * - persons / group: the favorite email of the address-directory projection, which only signed-in
     *   members of the tenant can read — anonymous visitors get an empty map.
     */
    emails: computed<Record<string, string>>(() => {
      const section = state.section();
      const info = state.avatarConfig().info;
      if (!section || !(info.includes('email') || info.includes('emailLink'))) return {};
      const emails: Record<string, string> = {};
      if ((section.properties.type ?? 'persons') === 'responsibility') {
        // a person holding several responsibilities gets the address of the first one that has one
        for (const r of state.responsibilitiesResource.value() ?? []) {
          const email = r.email?.trim();
          if (!email) continue;
          for (const avatar of [r.responsibleAvatar, r.delegateAvatar]) {
            if (avatar?.key && !emails[avatar.key]) emails[avatar.key] = email;
          }
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
