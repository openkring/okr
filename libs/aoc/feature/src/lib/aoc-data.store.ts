import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressCollection, AddressModel, BkModel, CalEventCollection, CalEventModel, CommentCollection, CommentModel, DocumentCollection, DocumentModel, LogInfo, MembershipCollection, MembershipModel, OrgCollection, OrgModel, PersonCollection, PersonModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';

import { addressValidations, getAddressIndex } from '@bk2/subject-address-util';
import { commentValidations, getCommentIndex } from '@bk2/comment-util';
import { calEventValidations, getCaleventIndex } from '@bk2/calevent-util';
import { StaticSuite } from 'vest';

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
        switch (store.modelType()) {
          case 'address':
            this.validate<AddressModel>(AddressCollection, addressValidations, 'parentKey');
            break;
          case 'comment':
            this.validate<CommentModel>(CommentCollection, commentValidations, 'createdAt');
          case 'document':
          //  this.validate(DocumentCollection, documentValidations, 'title');
          case 'calevent':
            this.validate(CalEventCollection, calEventValidations, 'title');
          case 'location':
          //  this.validate(LocationCollection, locationValidations, 'name');
          case 'membership':
          //  this.validate(MembershipCollection, membershipValidations, 'memberName2');
          case 'menuitem':
          //  this.validate(MenuItemCollection, menuItemValidations);
          case 'org':
          //  this.validate(OrgCollection, orgValidations, 'name');
          case 'ownership':
          //  this.validate(OwnershipCollection, ownershipValidations);
          case 'page':
          //  this.validate(PageCollection, pageValidations);
          case 'person':
          //  this.validate(PersonCollection, personValidations, 'lastName');
          case 'personal_rel':
          //  this.validate(PersonalRelCollection, personalRelValidations);
          case 'reservation':
          //  this.validate(ReservationCollection, reservationValidations);
          case 'resource':
          //  this.validate(ResourceCollection, resourceValidations);
          case 'todo':
          //  this.validate(TaskCollection, taskValidations);
          case 'transfer':
          //  this.validate(TransferCollection, transferValidations);
          case 'user':
            // split into auth, display, settings, privacy validations
          //  this.validate(UserCollection, userValidations);
          case 'workrel':
          //  this.validate(WorkrelCollection, workrelValidations);
          case 'category':
          //  this.validate(CategoryCollection, categoryListValidations);, 
          case 'group':
          //  this.validate(GroupCollection, groupValidations);
          case 'account': 
            // this.validate(AccountCollection, accountValidations, 'name');
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

      validate<T>(collection: string, suite: StaticSuite, orderBy = 'name'): void {
        const dbQuery = getSystemQuery(store.appStore.tenantId());
        store.appStore.firestoreService.searchData<T>(collection, dbQuery, orderBy, 'asc')
          .subscribe(async (data) => {
            for (const model of data) {
              console.log(`Validating model ${collection}/${(model as any).bkey}...`);
              const validationResult = suite(model);
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
