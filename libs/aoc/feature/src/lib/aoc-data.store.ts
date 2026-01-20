import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, of, take } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AccountCollection, AddressCollection, AddressModel, BkModel, CalEventCollection, CalEventModel, CalEventModelName, CategoryCollection, CommentCollection, CommentModel, DocumentCollection, DocumentModel, GroupCollection, LocationCollection, LogInfo, MembershipCollection, MembershipModel, MenuItemCollection, OrgCollection, OrgModel, OwnershipCollection, PageCollection, PersonalRelCollection, PersonCollection, PersonModel, ReservationCollection, ResourceCollection, TaskCollection, TransferCollection, UserCollection, WorkrelCollection } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';

import { addressValidations, getAddressIndex } from '@bk2/subject-address-util';
import { commentValidations, getCommentIndex } from '@bk2/comment-util';
import { calEventValidations, getCaleventIndex } from '@bk2/calevent-util';
import { StaticSuite } from 'vest';
import { documentValidations } from 'libs/document/util/src/lib/document.validations';
import { locationValidations } from '@bk2/location-util';
import { membershipValidations } from 'libs/relationship/membership/util/src/lib/membership.validations';
import { menuItemValidations } from '@bk2/cms-menu-util';
import { orgValidations } from '@bk2/subject-org-util';
import { ownershipValidations } from '@bk2/relationship-ownership-util';
import { pageValidations } from '@bk2/cms-page-util';
import { personValidations } from '@bk2/subject-person-util';
import { personalRelValidations } from '@bk2/relationship-personal-rel-util';
import { reservationValidations } from '@bk2/relationship-reservation-util';
import { resourceValidations } from '@bk2/resource-util';
import { taskValidations } from '@bk2/task-util';
import { transferValidations } from '@bk2/relationship-transfer-util';
import { workrelValidations } from '@bk2/relationship-workrel-util';
import { userValidations } from '@bk2/user-util';
import { categoryListValidations } from '@bk2/category-util';
import { groupValidations } from '@bk2/subject-group-util';

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
       * Fix models of a given type. THIS CHANGES MANY DATA IN THE DATABASE.
       * The purpose of this function is to apply corrections as a bulk operation over all models of a given type.
       * The function is normally called once and then new logic is implemented for the next correction.
       * That's why we only keep one single function that is used for all models.
       * To test your fix function, disable the update call.
       */
      async fixModels(): Promise<void> {
        console.log('AocDataStore.fixModels: fixing addresses...');
        const dbQuery = getSystemQuery(store.appStore.tenantId());
        store.appStore.firestoreService.searchData<AddressModel>(AddressCollection, dbQuery, 'parentKey', 'asc')
          .pipe(take(1))
          .subscribe(async (addresses) => {
            for (const address of addresses) {
              let hasChanged = false;
              console.log(`Checking address ${address.parentKey}/${address.bkey}...`);
              if (address.channelType === undefined) { console.log(`  - address has no channelType!`); address.channelType = 0; hasChanged = true; }
              if (address.channelLabel === undefined) { console.log(`  - address has no channelLabel!`); address.channelLabel = ''; hasChanged = true; }
              if (address.usageType === undefined) { console.log(`  - address has no usageType!`); address.usageType = 0; hasChanged = true; }
              if (address.usageLabel === undefined) { console.log(`  - address has no usageLabel!`); address.usageLabel = ''; hasChanged = true; }
              if (address.email === undefined) { console.log(`  - address has no email!`); address.email = ''; hasChanged = true; }
              if (address.phone === undefined) { console.log(`  - address has no phone!`); address.phone = ''; hasChanged = true; }
              if (address.iban === undefined) { console.log(`  - address has no iban!`); address.iban = ''; hasChanged = true; }
              if (address.streetName === undefined) { console.log(`  - address has no streetName!`); address.streetName = ''; hasChanged = true; }
              if (address.streetNumber === undefined) { console.log(`  - address has no streetNumber!`); address.streetNumber = ''; hasChanged = true; }
              if (address.addressValue2 === undefined) { console.log(`  - address has no addressValue2!`); address.addressValue2 = ''; hasChanged = true; }
              if (address.zipCode === undefined) { console.log(`  - address has no zipCode!`); address.zipCode = ''; hasChanged = true; }
              if (address.city === undefined) { console.log(`  - address has no city!`); address.city = ''; hasChanged = true; }
              if (address.countryCode === undefined) { console.log(`  - address has no countryCode!`); address.countryCode = ''; hasChanged = true; }
              if (address.url === undefined) { console.log(`  - address has no url!`); address.url = ''; hasChanged = true; }
              if (address.tags === undefined) { console.log(`  - address has no tags!`); address.tags = ''; hasChanged = true; }
              if (address.notes === undefined) { console.log(`  - address has no notes!`); address.notes = ''; hasChanged = true; }
              if (address.parentKey === undefined) { console.log(`  - address has no parentKey!`); address.parentKey = ''; hasChanged = true; }
             // if (hasChanged) {
                address.index = getAddressIndex(address);
                console.log(`  - index creation and updating ...`);
                //await store.appStore.firestoreService.updateModel<AddressModel>(AddressCollection, address);
             // }
          }
        });
      },

      /**
       * Validate models of a given type. This checks the data in one collection of the database whether it is valid.
       */
      async validateModels(): Promise<void> {
        console.log('AocDataStore.validateModels: validating ' + store.modelType() + ' models...');
        const tenants = store.tenantId();
        switch (store.modelType()) {
          case 'address':
            this.validate<AddressModel>(AddressCollection, addressValidations, tenants, store.appStore.getTags('address'), 'parentKey');
            break;
          case 'comment':
            this.validate<CommentModel>(CommentCollection, commentValidations, tenants, store.appStore.getTags('comment'), 'createdAt');
            break;
          case 'document':
            this.validate(DocumentCollection, documentValidations, tenants, store.appStore.getTags('document'), 'title');
            break;
          case 'calevent':
            this.validate(CalEventCollection, calEventValidations, tenants, store.appStore.getTags(CalEventModelName), 'title');
            break;
          case 'location':
            this.validate(LocationCollection, locationValidations, tenants, store.appStore.getTags('location'), 'name');
            break;
          case 'membership':
            this.validate(MembershipCollection, membershipValidations, tenants, store.appStore.getTags('membership'), 'memberName2');
            break;
          case 'menuitem':
            this.validate(MenuItemCollection, menuItemValidations, tenants, store.appStore.getTags('menuitem'));
            break;
          case 'org':
            this.validate(OrgCollection, orgValidations, tenants, store.appStore.getTags('org'), 'name');
            break;
          case 'ownership':
            this.validate(OwnershipCollection, ownershipValidations, tenants, store.appStore.getTags('ownership'));
            break;
          case 'page':
            this.validate(PageCollection, pageValidations, tenants, store.appStore.getTags('page'));
            break;
          case 'person':
            this.validate(PersonCollection, personValidations, tenants, store.appStore.getTags('person'), 'lastName');
            break;
          case 'personal_rel':
            this.validate(PersonalRelCollection, personalRelValidations, tenants, store.appStore.getTags('personal_rel'));
            break;
          case 'reservation':
            this.validate(ReservationCollection, reservationValidations, tenants, store.appStore.getTags('reservation'));
            break;
          case 'resource':
            this.validate(ResourceCollection, resourceValidations, tenants, store.appStore.getTags('resource'));
            break;
          case 'todo':
            this.validate(TaskCollection, taskValidations, tenants, store.appStore.getTags('todo'));
            break;
          case 'transfer':
            this.validate(TransferCollection, transferValidations, tenants, store.appStore.getTags('transfer'));
            break;
          case 'user':
            this.validate(UserCollection, userValidations, tenants, store.appStore.getTags('user'));
            break;
          case 'workrel':
            this.validate(WorkrelCollection, workrelValidations, tenants, store.appStore.getTags('workrel'));
            break;
          case 'category':
            this.validate(CategoryCollection, categoryListValidations, tenants, store.appStore.getTags('category'));
            break;
          case 'group':
            this.validate(GroupCollection, groupValidations, tenants, store.appStore.getTags('group'));
            break;
          case 'account': 
            // this.validate(AccountCollection, accountValidations, tenants, store.appStore.getTags('account'), 'name');
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

      validate<T>(collection: string, suite: StaticSuite, tenants: string, tags: string, orderBy = 'name'): void {
        const dbQuery = getSystemQuery(store.appStore.tenantId());
        store.appStore.firestoreService.searchData<T>(collection, dbQuery, orderBy, 'asc')
          .pipe(take(1))
          .subscribe(async (data) => {
            for (const model of data) {
              console.log(`Validating model ${collection}/${(model as any).bkey}...`);
              const validationResult = suite(model, tenants, tags);
              if (validationResult.hasErrors()) {
                console.log(`Model ${collection}/${(model as any).bkey} has validation errors:`);
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
            this.createIndex<AddressModel>(AddressCollection, getAddressIndex, 'parentKey');
            break;
          case 'comment':
            this.createIndex<CommentModel>(CommentCollection, getCommentIndex, 'createdAt');
            break;
          case 'document':
           // this.createIndex<DocumentModel>(DocumentCollection, getDocumentIndex, 'title');
          case 'calevent':
            this.createIndex<CalEventModel>(CalEventCollection, getCaleventIndex, 'title');
            break;
          case 'location':
          //  this.createIndex<LocationModel>(LocationCollection, getLocationIndex, 'name');
          case 'membership':
          //  this.createIndex<MembershipModel>(MembershipCollection, getMembershipIndex, 'memberName2');
          case 'menuitem':
          //  this.createIndex<MenuItemModel>(MenuItemCollection, getMenuItemIndex);
          case 'org':
          //  this.createIndex<OrgModel>(OrgCollection, getOrgIndex, 'name');
          case 'ownership':
          //  this.createIndex<OwnershipModel>(OwnershipCollection, getOwnershipIndex);
          case 'page':
          //  this.createIndex<PageModel>(PageCollection, getPageIndex, 'title');
          case 'person':
          //  this.createIndex<PersonModel>(PersonCollection, getPersonIndex, 'lastName');
          case 'personal_rel':
          //  this.createIndex<PersonalRelModel>(PersonalRelCollection, getPersonalRelIndex);
          case 'reservation':
          //  this.createIndex<ReservationModel>(ReservationCollection, getReservationIndex);
          case 'resource':
          //  this.createIndex<ResourceModel>(ResourceCollection, getResourceIndex);
          case 'todo':
          //  this.createIndex<TaskModel>(TaskCollection, getTaskIndex);
          case 'transfer':
          //  this.createIndex<TransferModel>(TransferCollection, getTransferIndex);
          case 'user':
            // split into auth, display, settings, privacy validations
          //  this.createIndex<UserModel>(UserCollection, getUserIndex);
          case 'workrel':
          //  this.createIndex<WorkrelModel>(WorkrelCollection, getWorkrelIndex);
          case 'category':
          //  this.createIndex<CategoryModel>(CategoryCollection, getCategoryIndex);, 
          case 'group':
          //  this.createIndex<GroupModel>(GroupCollection, getGroupIndex);
          case 'account': 
            // this.createIndex<AccountModel>(AccountCollection, getAccountIndex, 'name');
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

      createIndex<T>(collection: string, generateIndexFn: (model: T) => string, orderBy = 'name'): void {
        const dbQuery = getSystemQuery(store.appStore.tenantId());
        store.appStore.firestoreService.searchData<T>(collection, dbQuery, orderBy, 'asc')
          .subscribe(async (data) => {
            for (const model of data) {
              const oldIndex = (model as any).index;
              console.log(`Generating index for model ${collection}/${(model as any).bkey}...`);
              const newIndex = generateIndexFn(model);
              if (oldIndex !== newIndex) {
                (model as any).index = newIndex;
                console.log(`  - updating index from ${oldIndex} to ${newIndex} ...`);
                // await store.appStore.firestoreService.updateModel<T>(collection, model);
              }
            }
          });
      },
    };
  })
);
