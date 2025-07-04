import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, of } from 'rxjs';

import { FIRESTORE } from '@bk2/shared/config';
import { AppStore } from '@bk2/shared/feature';
import { BkModel, LogInfo, MembershipCollection, MembershipModel, ModelType, OrgCollection, OrgModel, PersonCollection, PersonModel } from '@bk2/shared/models';
import { getSystemQuery, searchData } from '@bk2/shared/util-core';

export type AocStatisticsState = {
  modelType: ModelType | undefined;
  log: LogInfo[];
  logTitle: string;
};

export const initialState: AocStatisticsState = {
  modelType: undefined,
  log: [],
  logTitle: ''
};

export const AocStatisticsStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestore: inject(FIRESTORE),
  })),
  withProps((store) => ({
    dataResource: rxResource({
      params: () => ({
        modelType: store.modelType()
      }),
      stream: ({params}): Observable<BkModel[] | undefined> => {
        switch(params.modelType) {
          case ModelType.Person:
            return searchData<PersonModel>(store.firestore, PersonCollection, getSystemQuery(store.appStore.env.tenantId), 'lastName', 'asc');
          case ModelType.Org:
            return searchData<OrgModel>(store.firestore, OrgCollection, getSystemQuery(store.appStore.env.tenantId), 'name', 'asc');
          case ModelType.Membership:
            return searchData<MembershipModel>(store.firestore, MembershipCollection, getSystemQuery(store.appStore.env.tenantId), 'memberName2', 'asc');
          default:
            return of(undefined);
        }
      }
    })
  })),

  withComputed((state) => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.dataResource.isLoading()),
      data: computed(() => state.dataResource.value() ?? []),
    }
  }),

  withMethods((store) => {
    return {

      /******************************** setters (filter) ******************************************* */
      setModelType(modelType: ModelType | undefined): void {
        patchState(store, { modelType, log: [], logTitle: '' });
      },

      updateCompetitionLevels(): void {
        console.log('AocStatisticsStore.updateCompetitionLevels: not yet implemented');
      },

     updateCLStatistics(): void {
        console.log('AocStatisticsStore.updateCLStatistics: not yet implemented');
      },

     updateAgeByGender(): void {
        console.log('AocStatisticsStore.updateAgeByGender: not yet implemented');
      },

     updateCategoryByGender(): void {
        console.log('AocStatisticsStore.updateCategoryByGender: not yet implemented');
      },

     updateMemberLocation(): void {
        console.log('AocStatisticsStore.updateMemberLocation: not yet implemented');
      },
    }
  })
);
 

/*   public async updateCompetitionLevels(): Promise<void> {
    console.log('competition-levels aktualisieren...');
    let _counterCreated = 0;
    console.log('not yet implemented');

    // phase 1: for each active member (mid): create it in cl if it does not yet exist
    const _activeScsMembers = await firstValueFrom(this.dataService.searchData(CollectionNames.Membership, [
      { key: 'objectKey', operator: '==', value: OrgKey.SCS },
      { key: 'state', operator: '==', value: MembershipState.Active }
    ]));
    for (const _scsMember of _activeScsMembers) {
      if (isMembership(_scsMember)) {
        _counterCreated += await this.checkAndCreateMissingCompetitionLevels(_scsMember);
      }
    }
    console.log(`checked ${_activeScsMembers.length} members and created ${_counterCreated} competitionLevelItems`);

    // phase 2: check each cl item and update/delete if necessary
    const _clItems = await firstValueFrom(this.dataService.searchData(CollectionNames.CompetitionLevel, []));

    for (const _clItem of _clItems) {
      if (isCompetitionLevel(_clItem)) {
        //let _isDirty = TripleBoolType.False;

        // tbd: optimize these checks, are they really needed ?
        // if (await checkMembershipInformation(this.afs, _clItem) === TripleBoolType.True) _isDirty = TripleBoolType.True;
        // if (await checkLicenseInformation(this.afs, _clItem) === true) _isDirty = TripleBoolType.True;
        //if (_isDirty === TripleBoolType.True) {
          await this.dataService.updateModel(CollectionNames.CompetitionLevel, _clItem);
        //}
        this.updateCLStatisticsWithSingleValue(_clItem);
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
    const _clItem = await firstValueFrom(this.dataService.readModel(CollectionNames.CompetitionLevel, scsMember.subjectKey));
    if (_clItem === undefined) {
      const _birthdate = scsMember.properties.dateOfBirth;
      if (!_birthdate) return 0;
      const _clModel = createCompetitionLevelFromScsMembership(scsMember, _birthdate);
      await this.dataService.createModel(CollectionNames.CompetitionLevel, _clModel);
      return 1;
    }
    return 0;
  } */
  
/*   public async updateCLStatistics(): Promise<void> {
    this.clStats = initializeCLStatistics();
    const _clItems = await firstValueFrom(this.dataService.searchData(CollectionNames.CompetitionLevel, []));
    
    // tbd: gender other is not yet considered
    for (const _clItem of _clItems) {
      if (isCompetitionLevel(_clItem)) {
        this.updateCLStatisticsWithSingleValue(_clItem);
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


 /*  public async updateAgeByGender(): Promise<void> {
  console.log('age structure (by gender) aktualisieren...');
  this.ageByGenderStats = initializeAgeByGenderStatistics();

  // for all active SCS members...
  const _activeScsMembers = await firstValueFrom(this.dataService.searchData(CollectionNames.Membership, [
    { key: 'objectKey', operator: '==', value: OrgKey.SCS },
    { key: 'state', operator: '==', value: MembershipState.Active }
  ]));
    
  for (const _scsMember of _activeScsMembers) {
    if (isMembership(_scsMember)) {
      updateAgeByGenderStats(this.ageByGenderStats, _scsMember.subjectCategory, _scsMember.properties.dateOfBirth);
    }
  }
  // save the statistics
  console.log('bk3migration.updateAgeByGender: saving updated statistics:');
  console.log(this.ageByGenderStats);
  this.dataService.createObject(CollectionNames.Statistics, this.ageByGenderStats, 'ageByGender');
}
 */

/*   public async updateCategoryByGender(): Promise<void> {
    console.log('category structure (by gender) aktualisieren...');
    this.categoryByGenderStats = initializeCategoryByGenderStatistics();

    // for all active SCS members...
    const _activeScsMembers = await firstValueFrom(this.dataService.searchData(CollectionNames.Membership, [
      { key: 'objectKey', operator: '==', value: OrgKey.SCS },
      { key: 'state', operator: '==', value: MembershipState.Active }
    ]));
      
    for (const _scsMember of _activeScsMembers) {
      if (isMembership(_scsMember)) {
        updateCategoryByGenderStats(this.categoryByGenderStats, _scsMember.subjectCategory, _scsMember.subType);
      }
    }
    // save the statistics
    console.log('bk3migration.updateCategoryByGender: saving updated statistics:');
    console.log(this.categoryByGenderStats);
    this.dataService.createObject(CollectionNames.Statistics, this.categoryByGenderStats, 'categoryByGender');
  } */
  
/*   public async updateMemberLocation(): Promise<void> {
    console.log('Herkunft der Aktivmitglieder aktualisieren...');
    // get the zipcodes of all active SCS members...
   // const _activeScsMembers = await firstValueFrom(
    const _zipCodes$ = (this.dataService.searchData(CollectionNames.Membership, [
      { key: 'objectKey', operator: '==', value: OrgKey.SCS },
      { key: 'state', operator: '==', value: MembershipState.Active }
    ]) as Observable<RelationshipModel[]>)    
    .pipe(map((memberships: RelationshipModel[]) => {
      return memberships.map((_membership: RelationshipModel) => {
        return _membership.properties.zipCode;
      })
    }));
    const _zipCodes = await firstValueFrom(_zipCodes$);
    console.log('zipCodes (raw): ', _zipCodes);
    // compute the number of occurrences of each word
    // https://stackoverflow.com/questions/36008637/sort-array-by-frequency
    const _counter = Object.create(null);
    _zipCodes.forEach(function(_zip) {
      if (_zip)  {
        _counter[_zip] = (_counter[_zip] || 0) + 1;
      }
    });
    _zipCodes.sort(function(x, y) {
      if (x && y) return _counter[y] - _counter[x];
      return 0;
    });
    console.log('zipCodes (condensed): ', _zipCodes);
    console.log('counter: ', _counter);
  } */