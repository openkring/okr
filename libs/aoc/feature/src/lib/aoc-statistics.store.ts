import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, Observable, of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { LogInfo, logMessage, MembershipCollection, MembershipModel, SectionCollection, SectionModel, TABLE_SECTION_SHAPE } from '@okr/shared-models';
import { DateFormat, getSystemQuery, getTodayStr, STORE_DATE_FILLER } from '@okr/shared-util-core';

import { initializeAgeByGenderStatistics, updateAgeByGenderStats, AOC_I18N_KEYS } from '@okr/aoc-util';

export type AocStatisticsState = {
  log: LogInfo[];
  logTitle: string;
};

export const initialState: AocStatisticsState = {
  log: [],
  logTitle: '',
};

export const AocStatisticsStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(AOC_I18N_KEYS),
  })),
  withComputed(state => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
    };
  }),

  withMethods(store => {
    return {
      /**
       * Updates the age by gender statistics.
       * This method retrieves all active members of the default organisation and updates the statistics accordingly.
       * It writes the updated statistics to the database into the section collection.
       * @param sectionKey the key of the section where the statistics data should be stored.
       * @returns {Promise<void>} A promise that resolves when the statistics have been updated.
       */
      async updateAgeByGender(sectionKey: string): Promise<void> {
        const log: LogInfo[] = [];
        patchState(store, { log: logMessage(log, 'aoc-statistics.updateAgeByGender: default updating age by gender statistics...') });
        const ageByGenderStats = initializeAgeByGenderStatistics();
        const activeMembers = await firstValueFrom(this.getActiveMembersOfDefaultOrg(log));

        for (const member of activeMembers) {
          // year-precision replica (spec 1.19 Phase 4): decade stats need no full dob. The year is
          // padded with STORE_DATE_FILLER, never with a fabricated 01.01. (D-P4-9) — getAge reads
          // the YYYY of a 'yearOnly' StoreDate and ignores the rest.
          updateAgeByGenderStats(ageByGenderStats, member.memberType, member.memberBirthYear ? member.memberBirthYear + STORE_DATE_FILLER : undefined);
        }
        patchState(store, { log: logMessage(log, `aoc-statistics.updateAgeByGender: saving updated statistics to ${SectionCollection}/${sectionKey}...`) });
        
        let section = await firstValueFrom(store.firestoreService.readModel<SectionModel>(SectionCollection, sectionKey));
        const isNew = !section;
        if (isNew) {
          // section does not exist -> create a new section
          section = TABLE_SECTION_SHAPE;
          section.tenants = [store.appStore.env.tenantId];
          section.okey = sectionKey;
          section.title = 'aoc.statistics.ageByGender.title';
        }
        section!.subTitle = getTodayStr(DateFormat.ViewDate);
        section!.properties = {
          table: {
            config: {
              gridTemplate: '20% 20% 20% 20% 20%',
              gridGap: '5px',
              gridBackgroundColor: 'var(--ion-color-light-shade)',
              gridPadding: '10px',
              headerBackgroundColor: 'var(--ion-color-light)',
              headerTextAlign: 'center',
              headerFontSize: '1rem',
              headerFontWeight: 'bold',
              headerPadding: '5px',
              cellBackgroundColor: 'var(--ion-color-light)',
              cellTextAlign: 'center',
              cellFontSize: '1rem',
              cellFontWeight: 'normal',
              cellPadding: '5px'
            },
            data: ageByGenderStats.flatMap(e => [e.rowTitle, e.m + '', e.f + '', e.d + '', e.total + '']),
            header: ['Kat.', 'M', 'W', 'D', 'Total'],
            title: 'aoc.statistics.ageByGender.title',
            subTitle: 'aoc.statistics.ageByGender.subTitle',
            description: ''
          },
        };
        if (isNew) {
          store.firestoreService.createModel<SectionModel>(SectionCollection, section!, store.i18n.statistics_age_by_gender_conf(), store.i18n.statistics_age_by_gender_error(), store.appStore.currentUser())
        } else {
          store.firestoreService.updateModel<SectionModel>(SectionCollection, section!, false, store.i18n.statistics_age_by_gender_conf(), store.i18n.statistics_age_by_gender_error(), store.appStore.currentUser());
        }
      },

      getActiveMembersOfDefaultOrg(log: LogInfo[]): Observable<MembershipModel[]> {
        const defaultOrg = store.appStore.defaultOrg();
        if (!defaultOrg) {
          patchState(store, { log: logMessage(log, 'aoc-statistics.getActiveMembersOfDefaultOrg: default organisation is missing') });
          return of([]);
        }
        patchState(store, { log: logMessage(log, `aoc-statistics.getActiveMembersOfDefaultOrg: getting active members for org ${defaultOrg.name}`) });

        // get the zipcodes of all active members of the default organisation...
        const query = getSystemQuery(store.appStore.env.tenantId);
        query.push({ key: 'objectKey', operator: '==', value: defaultOrg.okey });
        query.push({ key: 'membershipState', operator: '==', value: 'active' });
        return store.firestoreService.searchData<MembershipModel>(MembershipCollection, query, 'memberZipCode', 'asc');
      },
    };
  })
);