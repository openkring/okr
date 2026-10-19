import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { from, Observable, of } from 'rxjs';
import { StaticSuite } from 'vest';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { AddressCollection, AddressModel, OkrModel, CalEventCollection, CalEventModel, CalEventModelName, CategoryCollection, CommentCollection, CommentModel,
  DocumentCollection, DocumentModel, GroupCollection, LocationCollection, LocationModel, LogInfo, MembershipCollection, MembershipModel, MenuItemCollection,
  MenuItemModel, OrgCollection, OrgModel, OwnershipCollection, OwnershipModel, PageCollection, PageModel, PersonalRelCollection, PersonalRelModel, PersonCollection,
  PersonModel, ReservationCollection, ReservationModel, SessionCollection, SessionModel, TaskCollection, TransferCollection, UserCollection,
  WorkrelCollection, TaskModel, ResourceModel, ResourceCollection, TransferModel, UserModel, WorkrelModel, GroupModel, CategoryModel,
  CategoryListModel, DbQuery, ResponsibilityModel, ResponsibilityCollection } from '@okr/shared-models';
import { getCategoryIndex, getFullName, getSystemQuery } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';
import { AOC_I18N_KEYS } from '@okr/aoc-util';

import { addressValidations, computeFavoriteAddressInfo, getAddressIndex } from '@okr/subject-address-util';
import { commentValidations, getCommentIndex } from '@okr/comment-util';
import { calEventValidations, getCaleventIndex } from '@okr/calevent-util';
import { documentValidations, getDocumentIndex } from '@okr/content-document-util';
import { getLocationIndex, locationValidations } from '@okr/location-util';
import { getMembershipIndex, membershipValidations } from '@okr/relationship-membership-util';
import { getMenuIndex, menuItemValidations } from '@okr/cms-menu-util';
import { getOrgIndex, orgValidations } from '@okr/subject-org-util';
import { getOwnershipIndex, ownershipValidations } from '@okr/relationship-ownership-util';
import { getPageIndex, pageValidations } from '@okr/cms-page-util';
import { getPersonIndex, personValidations } from '@okr/subject-person-util';
import { getPersonalRelIndex, personalRelValidations } from '@okr/relationship-personal-rel-util';
import { getReservationIndex, reservationValidations } from '@okr/relationship-reservation-util';
import { getResourceIndex, resourceValidations } from '@okr/resource-util';
import { getTaskIndex, taskValidations } from '@okr/project-task-util';
import { getTransferIndex, transferValidations } from '@okr/relationship-transfer-util';
import { getWorkrelIndex, workrelValidations } from '@okr/relationship-workrel-util';
import { getUserIndex, userValidations } from '@okr/user-util';
import { categoryListValidations } from '@okr/category-util';
import { findDuplicateGroups, findGroupKeyIssues, getGroupIndex, groupValidations } from '@okr/subject-group-util';
import { getResponsibilityIndex } from '@okr/relationship-responsibility-util';
import { getSessionIndex } from '@okr/session-util';


export interface FavMismatch {
  personKey: string;
  personName: string;
  field: string;
  cached: string;
  fromAddress: string;
}

export type AocDataState = {
  modelType: string | undefined;
  log: LogInfo[];
  logTitle: string;
  favMismatches: FavMismatch[];
};

export const initialState: AocDataState = {
  modelType: undefined,
  log: [],
  logTitle: '',
  favMismatches: [],
};

export const AocDataStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    i18nService: inject(I18nService)
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(AOC_I18N_KEYS),

    dataResource: rxResource({
      params: () => ({
        modelType: store.modelType(),
      }),
      stream: ({ params }): Observable<OkrModel[] | undefined> => {
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
      tenantId: computed(() => state.appStore.env.tenantId),
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

      /**
       * Prepares the validation of models for the given type of model.
       */
      async validateModels(): Promise<void> {
        console.log('AocDataStore.validateModels: validating ' + store.modelType() + ' models...');
        const tenants = store.tenantId();
        switch (store.modelType()) {
          case 'address':
            this.executeValidation<AddressModel>(AddressCollection, addressValidations, tenants, store.appStore.getTags('address'), 'parentKey');
            break;
          case 'comment':
            this.executeValidation<CommentModel>(CommentCollection, commentValidations, tenants, store.appStore.getTags('comment'), 'creationDateTime');
            break;
          case 'document':
            this.executeValidation<DocumentModel>(DocumentCollection, documentValidations, tenants, store.appStore.getTags('document'), 'title');
            break;
          case 'calevent':
            this.executeValidation<CalEventModel>(CalEventCollection, calEventValidations, tenants, store.appStore.getTags(CalEventModelName), 'startDate');
            break;
          case 'location':
            this.executeValidation<LocationModel>(LocationCollection, locationValidations, tenants, store.appStore.getTags('location'), 'name');
            break;
          case 'membership':
            this.executeValidation<MembershipModel>(MembershipCollection, membershipValidations, tenants, store.appStore.getTags('membership'), 'memberName2');
            break;
          case 'menuitem':
            this.executeValidation<MenuItemModel>(MenuItemCollection, menuItemValidations, tenants, store.appStore.getTags('menuitem'));
            break;
          case 'org':
            this.executeValidation<OrgModel>(OrgCollection, orgValidations, tenants, store.appStore.getTags('org'), 'name');
            break;
          case 'ownership':
            this.executeValidation<OwnershipModel>(OwnershipCollection, ownershipValidations, tenants, store.appStore.getTags('ownership'));
            break;
          case 'page':
            this.executeValidation<PageModel>(PageCollection, pageValidations, tenants, store.appStore.getTags('page'));
            break;
          case 'person':
            this.executeValidation<PersonModel>(PersonCollection, personValidations, tenants, store.appStore.getTags('person'), 'lastName');
            break;
          case 'personal_rel':
            this.executeValidation<PersonalRelModel>(PersonalRelCollection, personalRelValidations, tenants, store.appStore.getTags('personal_rel'));
            break;
          case 'reservation':
            this.executeValidation<ReservationModel>(ReservationCollection, reservationValidations, tenants, store.appStore.getTags('reservation'));
            break;
          case 'resource':
            this.executeValidation<ResourceModel>(ResourceCollection, resourceValidations, tenants, store.appStore.getTags('resource'));
            break;
          case 'task':
            this.executeValidation<TaskModel>(TaskCollection, taskValidations, tenants, store.appStore.getTags('task'), 'okey');
            break;
          case 'transfer':
            this.executeValidation<TransferModel>(TransferCollection, transferValidations, tenants, store.appStore.getTags('transfer'), 'dateOfTransfer');
            break;
          case 'user':
            this.executeValidation<UserModel>(UserCollection, userValidations, tenants, store.appStore.getTags('user'), 'loginEmail');
            break;
          case 'workrel':
            this.executeValidation<WorkrelModel>(WorkrelCollection, workrelValidations, tenants, store.appStore.getTags('workrel'), 'okey');
            break;
          case 'category':
            this.executeValidation<CategoryModel>(CategoryCollection, categoryListValidations, tenants, store.appStore.getTags('category'));
            break;
          case 'group':
            this.executeValidation<GroupModel>(GroupCollection, groupValidations, tenants, store.appStore.getTags('group'));
            break;
          case 'account':
            // this.validate(AccountCollection, accountValidations, tenants, store.appStore.getTags('account'), 'name');
            // falls through — disabled, so it joins the unsupported group below
          case 'avatar':
          case 'bill':
          case 'competitionLevel':
          case 'expense':
          case 'invoice':
          case 'invoicePosition':
          case 'section': // split by section type, e.g. albumSectionValidations
          case 'trip':
            console.log('AocDataStore.validateModels: validation for model type ' + store.modelType() + ' not yet implemented.');
            break;
          default:
            console.log('AocDataStore.validateModels: unknown model type, cannot validate.');
            return;
        }
      },

      /**
       * Validate models of a given type using a vest test suite. 
       * This checks each document of a given collection in the database for correctness.
       * @param collection the collection name
       * @param suite the validation suite function
       * @param tenants validates the models to have at least one of these tenants
       * @param tags validates the models to have only these tags
       * @param orderBy the field to order by
       */
      executeValidation<T>(collection: string, suite: StaticSuite, tenants: string, tags: string, orderBy = 'name'): void {
        const dbQuery = getSystemQuery(store.appStore.tenantId());
        from(store.appStore.firestoreService.getDataOnce<T>(collection, dbQuery, orderBy, 'asc'))
          .subscribe(async (data) => {
            for (const model of data) {
              console.log(`Validating model ${collection}/${(model as any).okey}...`);
              const validationResult = suite(model, tenants, tags);
              if (validationResult.hasErrors()) {
                console.log(`Model ${collection}/${(model as any).okey} has validation errors:`);
                console.log(validationResult.getErrors());
              }
            }
          });
      },

      /**
       * Compare the fav* cache fields on every PersonModel against the actual favorite addresses
       * in the address sub-collection. Populates favMismatches so the UI can display them and
       * offer to repair in either direction.
       */
      async checkFavAddresses(): Promise<void> {
        patchState(store, { favMismatches: [] });
        const tenantId = store.appStore.tenantId();
        const dbQuery = getSystemQuery(tenantId);

        const [persons, addresses] = await Promise.all([
          store.appStore.firestoreService.getDataOnce<PersonModel>(PersonCollection, dbQuery, 'lastName', 'asc'),
          store.appStore.firestoreService.getDataOnce<AddressModel>(AddressCollection, dbQuery, 'parentKey', 'asc'),
        ]);

        if (!persons || !addresses) return;

        const mismatches: FavMismatch[] = [];
        for (const person of persons) {
          const personAddresses = addresses.filter(a => a.parentKey === `person.${person.okey}`);
          const fav = computeFavoriteAddressInfo(personAddresses);

 /*          console.log(person);
          console.log(personAddresses);
          console.log(fav);
          return; */

          const name = `${person.firstName} ${person.lastName}`;
          // favEmail/favPhone were stripped from persons (spec 1.19 Phase 4) —
          // only the favZipCode cache remains to check.
          const checks: Array<[string, string, string]> = [
            ['favZipCode', person.favZipCode, fav.favZipCode],
          ];
          for (const [field, cached, fromAddress] of checks) {
            if (cached !== fromAddress) {
              mismatches.push({ personKey: person.okey, personName: name, field, cached, fromAddress });
            }
          }
        }
        patchState(store, { favMismatches: mismatches });
      },

      clearFavMismatches(): void {
        patchState(store, { favMismatches: [] });
      },

      /**
       * Repair a single fav* mismatch.
       * direction 'toPerson'  → copy fromAddress value into person.fav* field
       * direction 'toAddress' → find the favorite address and update its value from the cached person.fav* field
       */
      async repairFavMismatch(mismatch: FavMismatch, direction: 'toPerson' | 'toAddress'): Promise<void> {
        if (direction === 'toAddress') {
          // updating an address channel value is complex (different fields per channel) — not implemented
          console.warn('AocDataStore.repairFavMismatch: toAddress direction is not yet implemented.');
          return;
        }
        // direction === 'toPerson': write the address-derived value into the person document
        const person = store.appStore.getPerson(mismatch.personKey);
        if (!person) return;
        (person as any)[mismatch.field] = mismatch.fromAddress;
        console.log('AocData.repairavMismatch: ', person);
        await store.appStore.firestoreService.updateModel(PersonCollection, person);
        // remove fixed mismatch from state
        patchState(store, { favMismatches: store.favMismatches().filter(m =>
          !(m.personKey === mismatch.personKey && m.field === mismatch.field)
        )});
      },

      /**
       * Validate models of a given type. This checks the data in one collection of the database whether it is valid.
       */
      async createIndexesOnCollection(): Promise<void> {
        console.log('AocDataStore.createIndex: creating indexes for ' + store.modelType() + ' models...');
        switch (store.modelType()) {
          case 'address':
            // resolve the owner name here rather than waiting for onAddressChange to
            // stamp it — a backfill run should leave every index complete in one pass
            this.createIndex<AddressModel>(AddressCollection,
              (a) => getAddressIndex(a, this.getOwnerName(a.parentKey)), 'parentKey', true);
            break;
          case 'comment':
            this.createIndex<CommentModel>(CommentCollection, getCommentIndex);
            break;
          case 'document':
            this.createIndex<DocumentModel>(DocumentCollection, getDocumentIndex);
            break;
          case 'calevent':
            this.createIndex<CalEventModel>(CalEventCollection, getCaleventIndex);
            break;
          case 'location':
            this.createIndex<LocationModel>(LocationCollection, getLocationIndex);
            break;
          case 'membership':
            this.createIndex<MembershipModel>(MembershipCollection, getMembershipIndex);
            break;
          case 'menuitem':
            this.createIndex<MenuItemModel>(MenuItemCollection, getMenuIndex);
            break;
          case 'org':
            this.createIndex<OrgModel>(OrgCollection, getOrgIndex, 'name');
            break;
          case 'ownership':
            this.createIndex<OwnershipModel>(OwnershipCollection, getOwnershipIndex);
            break;
          case 'page':
            this.createIndex<PageModel>(PageCollection, getPageIndex);
            break;
          case 'person':
            this.createIndex<PersonModel>(PersonCollection, getPersonIndex, 'lastName');
            break;
          case 'personalRel':
            this.createIndex<PersonalRelModel>(PersonalRelCollection, getPersonalRelIndex);
            break;
          case 'reservation':
            this.createIndex<ReservationModel>(ReservationCollection, getReservationIndex);
            break;
          case 'resource':
            this.createIndex<ResourceModel>(ResourceCollection, getResourceIndex);
            break;
          case 'task':
            this.createIndex<TaskModel>(TaskCollection, getTaskIndex);
            break;
          case 'transfer':
            this.createIndex<TransferModel>(TransferCollection, getTransferIndex);
            break;
          case 'user':
            this.createIndex<UserModel>(UserCollection, getUserIndex, 'loginEmail');
            break;
          case 'workrel':
            this.createIndex<WorkrelModel>(WorkrelCollection, getWorkrelIndex);
            break;
          case 'category':
            this.createIndex<CategoryListModel>(CategoryCollection, getCategoryIndex);
            break;
          case 'group':
            this.createIndex<GroupModel>(GroupCollection, getGroupIndex);
            break;
          case 'responsibility':
            this.createIndex<ResponsibilityModel>(ResponsibilityCollection, getResponsibilityIndex);
            break;
          case 'session':
            this.createIndex<SessionModel>(SessionCollection, getSessionIndex, 'startedAt');
            break;
          case 'account':
            // this.createIndex<AccountModel>(AccountCollection, getAccountIndex, 'name');
            // falls through — disabled, so it joins the unsupported group below
          case 'avatar':
          case 'bill':
          case 'competitionLevel':
          case 'expense':
          case 'invoice':
          case 'invoicePosition':
          case 'section': // split by section type, e.g. albumSectionValidations
          case 'trip':
            console.log('AocDataStore.createIndexesOnCollection: index creation for model type ' + store.modelType() + ' not yet implemented.');
            break;
          default:
            console.log('AocDataStore.createIndexesOnCollection: unknown model type, cannot create index.');
            return;
        }
      },

      /** The display name behind an address `parentKey` (`person.<okey>` / `org.<okey>`). */
      getOwnerName(parentKey: string): string {
        const [modelType, key] = (parentKey ?? '').split('.');
        if (modelType === 'person') {
          const person = store.appStore.getPerson(key) as PersonModel | undefined;
          return person ? getFullName(person.firstName, person.lastName) : '';
        }
        if (modelType === 'org') {
          return (store.appStore.getOrg(key) as OrgModel | undefined)?.name ?? '';
        }
        return '';
      },

      /**
       * @param includeArchived reindex soft-deleted documents too. Needed wherever a list can
       *   surface archived documents (the admin address list's archived toggle) — otherwise they
       *   keep a stale index forever and silently drop out of every search.
       */
      /**
       * Reports groups that are the same group twice, and group keys that cannot safely carry the
       * ids derived from them.
       *
       * Also a report only. A group key is referenced by `memberships.orgKey`, the group's calendar
       * document id AND its `owner`, every `calevent.calendars[]` entry, the files/album folder
       * names, task list ids and page ids — there is no safe automatic rename, and this is the list
       * a human needs before deciding.
       */
      async findGroupHygieneIssues(): Promise<void> {
        const log: LogInfo[] = [];
        const tenantId = store.appStore.tenantId();
        const groups = await store.appStore.firestoreService.getDataOnce<GroupModel>(
          GroupCollection, getSystemQuery(tenantId), 'name', 'asc');

        for (const dup of findDuplicateGroups(groups)) {
          log.push({
            id: dup.groups.map(g => g.okey).join(' / '),
            name: dup.groups[0].name,
            message: `${dup.groups.length} Gruppen mit praktisch demselben Namen: ${dup.groups.map(g => `${g.name} (${g.okey})`).join(', ')}`
          });
        }

        for (const issue of findGroupKeyIssues(groups, tenantId)) {
          const message = issue.kind === 'aliasCollision'
            ? `Der Chat-Alias '${issue.aliasLocalpart}' wird auch von ${issue.collidesWith.join(', ')} beansprucht.`
            : issue.kind === 'unsafeCharacters'
              ? `Die ID enthaelt Zeichen, die abgeleitete Ordner-, Seiten- und Chat-Namen nicht unveraendert tragen koennen. Heute wuerde sie '${tenantId}_...' heissen.`
              : `Die ID traegt kein '${tenantId}_'-Praefix — in einem zweiten Mandanten koennte derselbe Name dieses Dokument ueberschreiben.`;
          log.push({ id: issue.okey, name: issue.name, message });
        }

        if (log.length === 0) log.push({ id: '', name: '', message: store.i18n.hygiene_groups_clean() });
        patchState(store, { log, logTitle: store.i18n.hygiene_groups_title() });
      },

      createIndex<T extends OkrModel>(collection: string, generateIndexFn: (model: T) => string, orderBy = 'none', includeArchived = false): void {
        const dbQuery: DbQuery[] = includeArchived
          ? [{ key: 'tenants', operator: 'array-contains', value: store.appStore.tenantId() }]
          : getSystemQuery(store.appStore.tenantId());
        from(store.appStore.firestoreService.getDataOnce<T>(collection, dbQuery, orderBy, 'asc'))
          .subscribe(async (data) => {
            for (const model of data) {
              const oldIndex = (model as any).index;
              console.log(`Generating index for model ${collection}/${(model as any).okey}...`);
              const newIndex = generateIndexFn(model);
              if (oldIndex !== newIndex) {
                (model as any).index = newIndex;
                console.log(`  - from <${oldIndex}>`);
                console.log(`  - to   <${newIndex}>`);
                await store.appStore.firestoreService.updateModel(collection, model);
              }
            }
          });
      },
    };
  })
);
