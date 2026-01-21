import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, of, take } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressCollection, AddressModel, BkModel, CalEventCollection, CalEventModel, CalEventModelName, CategoryCollection, CommentCollection, CommentModel, 
  DocumentCollection, DocumentModel, GroupCollection, LocationCollection, LocationModel, LogInfo, MembershipCollection, MembershipModel, MenuItemCollection, 
  MenuItemModel, OrgCollection, OrgModel, OwnershipCollection, OwnershipModel, PageCollection, PageModel, PersonalRelCollection, PersonalRelModel, PersonCollection, 
  PersonModel, ReservationCollection, ReservationModel, TaskCollection, TransferCollection, UserCollection, 
  WorkrelCollection, TaskModel, ResourceModel, ResourceCollection, TransferModel, UserModel, WorkrelModel, GroupModel, CategoryModel, 
  AvatarInfo,
  AVATAR_INFO_SHAPE,
  CategoryListModel} from '@bk2/shared-models';
import { getSystemQuery, removeProperty } from '@bk2/shared-util-core';

import { addressValidations, getAddressIndex } from '@bk2/subject-address-util';
import { commentValidations, getCommentIndex } from '@bk2/comment-util';
import { calEventValidations, getCaleventIndex } from '@bk2/calevent-util';
import { StaticSuite } from 'vest';
import { documentValidations, getDocumentIndex } from '@bk2/document-util';
import { getLocationIndex, locationValidations } from '@bk2/location-util';
import { getMembershipIndex, membershipValidations } from '@bk2/relationship-membership-util';
import { getMenuIndex, menuItemValidations } from '@bk2/cms-menu-util';
import { getOrgIndex, orgValidations } from '@bk2/subject-org-util';
import { getOwnershipIndex, ownershipValidations } from '@bk2/relationship-ownership-util';
import { getPageIndex, pageValidations } from '@bk2/cms-page-util';
import { getPersonIndex, personValidations } from '@bk2/subject-person-util';
import { getPersonalRelIndex, personalRelValidations } from '@bk2/relationship-personal-rel-util';
import { getReservationIndex, reservationValidations } from '@bk2/relationship-reservation-util';
import { getResourceIndex, resourceValidations } from '@bk2/resource-util';
import { getTaskIndex, taskValidations } from '@bk2/task-util';
import { getTransferIndex, transferValidations } from '@bk2/relationship-transfer-util';
import { getWorkrelIndex, workrelValidations } from '@bk2/relationship-workrel-util';
import { getUserIndex, userValidations } from '@bk2/user-util';
import { categoryListValidations, getCategoryIndex } from '@bk2/category-util';
import { getGroupIndex, groupValidations } from '@bk2/subject-group-util';

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
        // configuration: adapt these value to your needs
        const isDryRun = false; // if true, no changes are written to the database;   TEST IT BEFORE SETTING TO FALSE !
        const restrictToOneDocument = false; // for testing, only fix one document, if false, all documents are fixed
        const collectionName = 'orgs';
        const isBkModel = true;

        // fixing fields (types and undefined)
        // use s:string, n:number, b:boolean m:map {} a:array []
        const fieldsToCheckForUndefined: string[] = ['s:dateOfFoundation', 's:dateOfLiquidation', 's:favEmail', 's:favPhone', 's:favStreetNumber', 's:favZipCode', 's:notes', 's:tags', 's:taxId'];
        const fieldsToFixTypes: string[] = ['s:favStreetNumber', 's:favZipCode', 's:dateOfFoundation', 's:bexioId'];

        // converting enums
        const enumField = ''; // e.g. 'status'
        const enumMappingRules: string[] = []; // e.g. ['1:active', '2:inactive']
        // example scs member category: ['1:active', '2:active2', '3:active3', '4:junior', '5:free', '6:honorary', '7:candidate', '8:passive']
        // example srv membber category: ['1:active', '2:junior', '3:double']
        // example default member category: ['1:active', '2:junior', '3:passive']

        // migrating from old model to new model
        const doMigration = false;
        const newCollectionName = '';
        const newDoc = new OrgModel(store.appStore.tenantId());
        // use oldFieldName[:newFieldName][=value]
        const fieldMappings: string[] = [];

        // CHECK THE IMPLEMENTATION OF FIXCUSTOMISSUES !

        console.log('AocDataStore.fixModels has the following configuration:');
        console.log(`  - isDryRun: ${isDryRun}`);
        console.log(`  - restrictToOneDocument: ${restrictToOneDocument}`);
        console.log(`  - collectionName: ${collectionName}`);
        console.log(`  - isBkModel: ${isBkModel}`);
        console.log(`  - fieldsToCheckForUndefined: ${fieldsToCheckForUndefined}`);
        console.log(`  - fieldsToFixTypes: ${fieldsToFixTypes}`);
        console.log(`  - enumField: ${enumField}`);
        console.log(`  - enumMappingRules: ${enumMappingRules}`);
        console.log('Migration settings:');
        console.log(`  - doMigration: ${doMigration}`);
        console.log(`  - newCollectionName: ${newCollectionName}`);
        console.log(`  - fieldMappings: ${fieldMappings}`);
        // end of configuration -> you will also need to adapt the applied fixes below


        // reading the collection and iterating over all documents
        console.log(`AocDataStore.fixModels: fixing all documents of collection ${collectionName}...`);
        const dbQuery = isBkModel ? getSystemQuery(store.appStore.tenantId()) : [];
        const rawData$ = isBkModel ?
          store.appStore.firestoreService.searchData<typeof newDoc>(collectionName, dbQuery, 'none') :
          store.appStore.firestoreService.listAllObjects<any>(collectionName, true);
        rawData$
          .pipe(take(1))
          .subscribe(async (documents) => {
            for (const doc of documents) {
              const originalDoc = JSON.stringify(doc);
              let changed = false;
              if (isBkModel) {
                this.fixUndefinedFields<typeof newDoc>(doc, fieldsToCheckForUndefined);
                this.fixTypes<typeof newDoc>(doc, fieldsToFixTypes);
                this.fixCustomIssues<typeof newDoc>(doc);
                changed = JSON.stringify(doc) !== originalDoc;
                if (changed) {
                  await this.saveDoc<typeof newDoc>(collectionName, doc, isBkModel, isDryRun);
                }
              } else {
                this.fixUndefinedFields<any>(doc, fieldsToCheckForUndefined);
                this.fixTypes<any>(doc, fieldsToFixTypes);
                if (doMigration) {
                  const migratedDoc = this.migrateModel(doc, fieldMappings) as typeof newDoc;
                  changed = true;
                  if (changed) {
                    await this.saveDoc<typeof newDoc>(newCollectionName, migratedDoc, isBkModel, isDryRun);
                  }
                } else {
                  changed = JSON.stringify(doc) !== originalDoc;
                  if (changed) {
                    await this.saveDoc<any>(newCollectionName, doc, isBkModel, isDryRun);
                  }
                }
              }
              if (restrictToOneDocument) break;
            }
            console.log(`AocDataStore.fixModels: finished processing all ${documents.length} documents.`);
        });
      },

      /**
       * This is the place where you can implement your custom fixes.
       * This implementation is for BkModels where we know the model.
       */
      fixCustomIssues<T>(doc: T): T {
        (doc as OrgModel).index = getOrgIndex(doc as OrgModel);
        return doc;
      },

      /**
       * Fixes undefined fields in one single document of type T. The document type is not changed.
       * @param doc
       * @param fieldsToCheck format: s:string, n:number, b:boolean m:map {} a:array []
       */
      fixUndefinedFields<T>(doc: T, fieldsToCheck: string[]): T {
        console.log(`  - fixing undefined fields of document ${(doc as any).bkey} ...`);
        for (const field of fieldsToCheck) {
          const [type, attr] = field.split(':');
          if (!attr) continue;
          const value = doc[attr as keyof T];
          if (value === undefined || value === null) {
            switch (type) {
              case 's':
                (doc as any)[attr] = '';
                break;
              case 'n':
                (doc as any)[attr] = 0;
                break;
              case 'b':
                (doc as any)[attr] = false;
                break;
              case 'm':
                (doc as any)[attr] = {};
                break;
              case 'a':
                (doc as any)[attr] = [];
                break;
            }
          }
        }
        return doc;
      },

      /**
       * Converts the value of each field to the specified type.
       * @param doc The document to fix types in.
       * @param fieldsToFix Array of field definitions, e.g. s:fieldName, n:amount
       */
      fixTypes<T>(doc: T, fieldsToFix: string[]): T {
        console.log(`  - fixing types of document ${(doc as any).bkey} ...`);
        for (const field of fieldsToFix) {
          const [type, attr] = field.split(':');
          if (!attr) continue;
          const value = doc[attr as keyof T];
          switch (type) {
            case 's':
              (doc as any)[attr] = value !== undefined && value !== null ? String(value) : '';
              break;
            case 'n':
              (doc as any)[attr] = value !== undefined && value !== null && value !== '' ? Number(value) : 0;
              break;
            case 'b':
              (doc as any)[attr] = value === 'true' || value === true;
              break;
            case 'm':
              if (typeof value === 'string') {
                try {
                  (doc as any)[attr] = JSON.parse(value);
                } catch {
                  (doc as any)[attr] = {};
                }
              } else if (typeof value !== 'object' || value === null) {
                (doc as any)[attr] = {};
              }
              break;
            case 'a':
              if (typeof value === 'string') {
                try {
                  (doc as any)[attr] = JSON.parse(value);
                } catch {
                  (doc as any)[attr] = [];
                }
              } else if (!Array.isArray(value)) {
                (doc as any)[attr] = [];
              }
              break;
          }
        }
        return doc;
      },

      /**
       * Takes a document of any type and converts its fields according to the given field mappings.
       * @param doc 
       */
      migrateModel(oldDoc: any, fieldMappings: string[]): any {
        console.log(`  - migrating model of document ${(oldDoc as any).bkey} ...`);
        const newDoc: any = {};
        for (const mapping of fieldMappings) {
          // Parse mapping: oldFieldName[:newFieldName][=value]
          // Examples: 'foo', 'foo:bar', 'foo=42', 'foo:bar=42'
          let [fieldPart, valuePart] = mapping.split('=');
          let [oldField, newField] = fieldPart.split(':');
          const hasValue = valuePart !== undefined;
          const fieldName = newField ? newField : oldField;
          newDoc[fieldName] = hasValue ? valuePart : oldDoc?.[oldField];
        }
        return newDoc;
      },

      /**
       * Convert a set of fields into an AvatarInfo object.
       * The mapping rules are provided as an array of strings. Each entry defines how to map a field from the source object to the AvatarInfo.
       * oldFieldName:avatarFieldname
       * @param doc 
       * @param mappingRules 
       */
      convertToAvatar(doc: any, mappingRules: string[]): AvatarInfo {
        console.log(`  - converting document ${(doc as any).bkey} to avatar...`);
        const avatarInfo = AVATAR_INFO_SHAPE;
        for (const rule of mappingRules) {
          const [sourceField, avatarField] = rule.split(':');
          if (sourceField && avatarField && (doc as any)[sourceField] !== undefined) { 
            avatarInfo[avatarField as keyof AvatarInfo] = (doc as any)[sourceField];
          }
        } 
        return avatarInfo;
      },

      /**
       * Convert an enum with numeric index values into string values.
       * The mapping rules are provided as an array of strings. Each entry starts .
       * @param doc 
       * @param fieldName 
       * @param mappingRules:  index:string, e.g. 1:active, 2:inactive means that index 1 is mapped to 'active', index 2 to 'inactive' 
       */
      convertEnumField<T>(doc: T, fieldName: string, mappingRules: string[]): T {
        console.log(`  - converting enum field ${fieldName} of document ${(doc as any).bkey}...`);
        const index = (doc as any)[fieldName];
        // mappingRules: e.g. ['1:active', '2:inactive']
        const mapping: Record<string, string> = {};
        for (const rule of mappingRules) {
          const [idx, value] = rule.split(':');
          if (idx !== undefined && value !== undefined) {
            mapping[idx] = value;
          }
        }
        if (index !== undefined && mapping.hasOwnProperty(String(index))) {
          (doc as any)[fieldName] = mapping[String(index)];
        }
        return doc;
      },

      /**
       * Save a document to the database. The document is created (if not yet existing) or updated (if existing).
       * No bkey/id check is performed here.
       */
      async saveDoc<T extends BkModel | any>(collectionName: string, doc: T, isBkModel: boolean, isDryRun = true): Promise<void> {
        console.log(`  - saving document ${collectionName}/${(doc as any).bkey ?? ''} ...`);
        // tbd: createIndex
        if (isDryRun) {
          console.log(doc);
        } else {
          if (isBkModel) {
            await store.appStore.firestoreService.updateModel(collectionName, doc as BkModel, true);
          } else {
            const key = (doc as any)['bkey'];
            // contrary to updateModel, updateObject does not remove the bkey property from the stored object. So we need to remove it here.
            const storedModel = removeProperty(doc as any, 'bkey');
            await store.appStore.firestoreService.updateObject<T>(collectionName, key, storedModel as any, true);
          }
        }
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
            this.executeValidation<CommentModel>(CommentCollection, commentValidations, tenants, store.appStore.getTags('comment'), 'createdAt');
            break;
          case 'document':
            this.executeValidation<DocumentModel>(DocumentCollection, documentValidations, tenants, store.appStore.getTags('document'), 'title');
            break;
          case 'calevent':
            this.executeValidation<CalEventModel>(CalEventCollection, calEventValidations, tenants, store.appStore.getTags(CalEventModelName), 'title');
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
          case 'todo':
            this.executeValidation<TaskModel>(TaskCollection, taskValidations, tenants, store.appStore.getTags('todo'));
            break;
          case 'transfer':
            this.executeValidation<TransferModel>(TransferCollection, transferValidations, tenants, store.appStore.getTags('transfer'));
            break;
          case 'user':
            this.executeValidation<UserModel>(UserCollection, userValidations, tenants, store.appStore.getTags('user'));
            break;
          case 'workrel':
            this.executeValidation<WorkrelModel>(WorkrelCollection, workrelValidations, tenants, store.appStore.getTags('workrel'));
            break;
          case 'category':
            this.executeValidation<CategoryModel>(CategoryCollection, categoryListValidations, tenants, store.appStore.getTags('category'));
            break;
          case 'group':
            this.executeValidation<GroupModel>(GroupCollection, groupValidations, tenants, store.appStore.getTags('group'));
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
            this.createIndex<DocumentModel>(DocumentCollection, getDocumentIndex, 'title');
            break;
          case 'calevent':
            this.createIndex<CalEventModel>(CalEventCollection, getCaleventIndex, 'title');
            break;
          case 'location':
            this.createIndex<LocationModel>(LocationCollection, getLocationIndex, 'name');
            break;
          case 'membership':
            this.createIndex<MembershipModel>(MembershipCollection, getMembershipIndex, 'memberName2');
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
            this.createIndex<PageModel>(PageCollection, getPageIndex, 'title');
            break;
          case 'person':
            this.createIndex<PersonModel>(PersonCollection, getPersonIndex, 'lastName');
            break;
          case 'personal_rel':
            this.createIndex<PersonalRelModel>(PersonalRelCollection, getPersonalRelIndex);
            break;
          case 'reservation':
            this.createIndex<ReservationModel>(ReservationCollection, getReservationIndex);
            break;
          case 'resource':
            this.createIndex<ResourceModel>(ResourceCollection, getResourceIndex);
            break;
          case 'todo':
            this.createIndex<TaskModel>(TaskCollection, getTaskIndex);
            break;
          case 'transfer':
            this.createIndex<TransferModel>(TransferCollection, getTransferIndex);
            break;
          case 'user':
            this.createIndex<UserModel>(UserCollection, getUserIndex);
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
