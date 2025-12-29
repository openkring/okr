import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, map, Observable, of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { BkModel, LogInfo, logMessage, MembershipCollection, MembershipModel, OrgCollection, OrgModel, PersonCollection, PersonModel, SectionCollection, SectionModel, TABLE_SECTION_SHAPE } from '@bk2/shared-models';
import { error } from '@bk2/shared-util-angular';
import { DateFormat, getSystemQuery, getTodayStr } from '@bk2/shared-util-core';

import { initializeAgeByGenderStatistics, updateAgeByGenderStats } from '@bk2/aoc-util';

export type AocStatisticsState = {
  modelType: string | undefined;
  log: LogInfo[];
  logTitle: string;
};

export const initialState: AocStatisticsState = {
  modelType: undefined,
  log: [],
  logTitle: '',
};

export const AocStatisticsStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
  })),
  withProps(store => ({
    dataResource: rxResource({
      params: () => ({
        modelType: store.modelType(),
      }),
      stream: ({ params }): Observable<BkModel[] | undefined> => {
        switch (params.modelType) {
          case 'person':
            return store.firestoreService.searchData<PersonModel>(PersonCollection, getSystemQuery(store.appStore.env.tenantId), 'lastName', 'asc');
          case 'org':
            return store.firestoreService.searchData<OrgModel>(OrgCollection, getSystemQuery(store.appStore.env.tenantId), 'name', 'asc');
          case 'membership':
            return store.firestoreService.searchData<MembershipModel>(MembershipCollection, getSystemQuery(store.appStore.env.tenantId), 'memberName2', 'asc');
          default:
            return of(undefined);
        }
      },
    }),
  })),

  withComputed(state => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.dataResource.isLoading()),
      data: computed(() => state.dataResource.value() ?? []),
    };
  }),

  withMethods(store => {
    return {
      /******************************** setters (filter) ******************************************* */
      setModelType(modelType: string | undefined): void {
        patchState(store, { modelType, log: [], logTitle: '' });
      },

      updateMemberLocation(): void {
        console.log('AocStatisticsStore.updateMemberLocation: not yet implemented');
      },

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
          updateAgeByGenderStats(ageByGenderStats, member.memberType, member.memberDateOfBirth);
        }
        patchState(store, { log: logMessage(log, `aoc-statistics.updateAgeByGender: saving updated statistics to ${SectionCollection}/${sectionKey}...`) });

        let section = await firstValueFrom(store.firestoreService.readModel<SectionModel>(SectionCollection, sectionKey));
        const isNew = !section;
        if (isNew) {
          // section does not exist -> create a new section
          section = TABLE_SECTION_SHAPE;
          section.tenants = [store.appStore.env.tenantId];
          section.bkey = sectionKey;
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
        isNew
          ? store.firestoreService.createModel<SectionModel>(SectionCollection, section!, 'aoc.statistics.ageByGender.conf', store.appStore.currentUser())
          : store.firestoreService.updateModel<SectionModel>(SectionCollection, section!, false, 'aoc.statistics.ageByGender.conf', store.appStore.currentUser());
      },

      /**
       * Retrieves all active members of the default organisation.
       * @param sectionKey the key of the section where the statistics data should be stored.
       * @returns An observable that emits an array of active MembershipModel objects.
       */
      async updateCategoryByGender(sectionKey: string): Promise<void> {
        error(undefined, 'aoc-statistics.updateCategoryByGender: updating member-category by gender statistics is not yet adapted');
        /*        
        const log: LogInfo[] = [];
        patchState(store, { log: logMessage(log, 'aoc-statistics.updateCategoryByGender: updating member-category by gender statistics...') });
        const categoryByGenderStats = initializeCategoryByGenderStatistics(this.appStore.defaultOrg().memberCategory);
        const activeMembers = await firstValueFrom(this.getActiveMembersOfDefaultOrg(log));

        for (const member of activeMembers) {
          updateCategoryByGenderStats(categoryByGenderStats, member.memberType, member.memberCategory);
        }
        patchState(store, { log: logMessage(log, `aoc-statistics.updateupdateCategoryByGenderAgeByGender: saving updated statistics to ${SectionCollection}/${sectionKey}...`) });
        const section = await firstValueFrom(store.firestoreService.readModel<SectionModel>(SectionCollection, sectionKey));
        if (!section) { // section does not exist -> create a new section 
          section = new SectionModel(store.appStore.env.tenantId);
          section.bkey = sectionKey;
          section.title = 'aoc.statistics.categoryByGender.title';
          section.subTitle = getTodayStr(DateFormat.ViewDate)
          section.properties.table.config = {
            "gridTemplate": "20% 20% 20% 20% 20%",
            "headerBackgroundColor": "var(--ion-color-light)",
            "headerFontSize": "1rem",
            "headerFontWeight": "bold",
            "headerPadding": "5px",
            "headerTextAlign": "center"
          };
          section.properties.table.data = categoryByGenderStats.flatMap(e => [e.rowTitle, e.m, e.f, e.d, e.total]);
          section.properties.table.header = ['Kat.', 'M', 'W', 'D', 'Total'];
          store.firestoreService.createModel<SectionModel>(SectionCollection, section, 'aoc.statistics.categoryByGender.conf', store.appStore.currentUser());
        } else {    // update the existing section
          section.subTitle = getTodayStr(DateFormat.ViewDate)
          section.properties.table.data = categoryByGenderStats.flatMap(e => [e.rowTitle, e.m, e.f, e.d, e.total]);
          store.firestoreService.updateModel<SectionModel>(SectionCollection, section, false, 'aoc.statistics.categoryByGender.conf', store.appStore.currentUser());
        }
 */
      },

      async updateLocationByCategory(): Promise<void> {
        const log: LogInfo[] = [];
        patchState(store, { log: logMessage(log, 'aoc-statistics.updateLocationByCategory: default updating location by category statistics...') });
        const activeMembers$ = this.getActiveMembersOfDefaultOrg(log);

        const zipCodes$: Observable<string[]> = activeMembers$.pipe(
          map((memberships: MembershipModel[]) => {
            return memberships.map((membership: MembershipModel) => {
              return membership.memberZipCode;
              // tbd: add the membership category
            });
          })
        );
        const zipCodes = await firstValueFrom(zipCodes$);
        //console.log('zipCodes (raw): ', _zipCodes);
        // compute the number of occurrences of each word,https://stackoverflow.com/questions/36008637/sort-array-by-frequency
        const counter = Object.create(null);
        zipCodes.forEach(function (zip) {
          if (zip) {
            counter[zip] = (counter[zip] || 0) + 1;
            // tbd: save it for the membercategory, too:
          }
        });
        /*       zipCodes.sort(function(x, y) {
                if (x && y) return counter[y] - counter[x];
                return 0;
              });
              console.log('zipCodes (condensed): ', zipCodes); */
        console.log('counter: ', counter);
        // tbd: write the result into the database
        // tbd: show a table with the results
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
        query.push({ key: 'objectKey', operator: '==', value: defaultOrg.bkey });
        query.push({ key: 'membershipState', operator: '==', value: 'active' });
        return store.firestoreService.searchData<MembershipModel>(MembershipCollection, query, 'memberZipCode', 'asc');
      },

      updateCompetitionLevels(): void {
        console.log('AocStatisticsStore.updateCompetitionLevels: not yet implemented');
      },

      updateCLStatistics(): void {
        console.log('AocStatisticsStore.updateCLStatistics: not yet implemented');
      },
    };
  })
);

/*   public async updateCompetitionLevels(): Promise<void> {
    console.log('competition-levels aktualisieren...');
    let counterCreated = 0;
    console.log('not yet implemented');

    // phase 1: for each active member (mid): create it in cl if it does not yet exist
    const activeScsMembers = await firstValueFrom(this.dataService.searchData(CollectionNames.Membership, [
      { key: 'objectKey', operator: '==', value: OrgKey.SCS },
      { key: 'state', operator: '==', value: MembershipState.Active }
    ]));
    for (const scsMember of activeScsMembers) {
      if (isMembership(scsMember)) {
        counterCreated += await this.checkAndCreateMissingCompetitionLevels(scsMember);
      }
    }
    console.log(`checked ${activeScsMembers.length} members and created ${counterCreated} competitionLevelItems`);
    // phase 2: check each cl item and update/delete if necessary
    const clItems = await firstValueFrom(this.dataService.searchData(CollectionNames.CompetitionLevel, []));

    for (const clItem of clItems) {
      if (isCompetitionLevel(clItem)) {
        //let isDirty = TripleBoolType.False;

        // tbd: optimize these checks, are they really needed ?
        // if (await checkMembershipInformation(this.afs, clItem) === TripleBoolType.True) isDirty = TripleBoolType.True;
        // if (await checkLicenseInformation(this.afs, clItem) === true) isDirty = TripleBoolType.True;
        //if (isDirty === TripleBoolType.True) {
          await this.dataService.updateModel(CollectionNames.CompetitionLevel, clItem);
        //}
        this.updateCLStatisticsWithSingleValue(clItem);
      }
    }
    if (this.clStats) {
      this.dataService.createObject(CollectionNames.Statistics, this.clStats, 'competitionLevels');
    } else {
      warn('bk3migration.updateCompetitionLevels: clStats is undefined');
    }
  }
 */
/*   private async checkAndCreateMissingCompetitionLevels(scsMember: RelationshipModel): Promise<number> {
    console.log('checking ' + scsMember.bkey + '/' + scsMember.subjectName2 + ' ' + scsMember.subjectName);
    const clItem = await firstValueFrom(this.dataService.readModel(CollectionNames.CompetitionLevel, scsMember.subjectKey));
    if (clItem === undefined) {
      const birthdate = scsMember.properties.dateOfBirth;
      if (!birthdate) return 0;
      const clModel = createCompetitionLevelFromScsMembership(scsMember, birthdate);
      await this.dataService.createModel(CollectionNames.CompetitionLevel, clModel);
      return 1;
    }
    return 0;
  } */

/*   public async updateCLStatistics(): Promise<void> {
    this.clStats = initializeCLStatistics();
    const clItems = await firstValueFrom(this.dataService.searchData(CollectionNames.CompetitionLevel, []));
    
    // tbd: gender other is not yet considered
    for (const clItem of clItems) {
      if (isCompetitionLevel(clItem)) {
        this.updateCLStatisticsWithSingleValue(clItem);
      }
    }
    console.log('bk3migration.updateCLStatistics: saving updated statistics:');
    console.log(this.clStats);
    this.dataService.createObject(CollectionNames.Statistics, this.clStats, 'competitionLevels');
  }
 */
/*   private updateCLStatisticsWithSingleValue(clItem: CompetitionLevelModel): void {
    if (this.clStats && clItem && clItem.category >= 0 && clItem.competitionLevel >= 0) {
      clItem.category === GenderType.Female ?
        this.clStats.entries[clItem.competitionLevel].f++ :
        this.clStats.entries[clItem.competitionLevel].m++;
      this.clStats.entries[clItem.competitionLevel].total++;
    }
  } */
