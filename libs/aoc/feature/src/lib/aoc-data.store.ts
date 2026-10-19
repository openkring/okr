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

import { addressValidations, getAddressIndex } from '@okr/subject-address-util';
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
import { getGroupIndex, groupValidations } from '@okr/subject-group-util';
import { getResponsibilityIndex } from '@okr/relationship-responsibility-util';
import { getSessionIndex } from '@okr/session-util';


export type AocDataState = {
  modelType: string | undefined;
  log: LogInfo[];
  logTitle: string;
};

export const initialState: AocDataState = {
  modelType: undefined,
  log: [],
  logTitle: '',
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
