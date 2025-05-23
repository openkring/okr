import { LogInfo } from '@bk2/shared/models';

export function getLogInfo(key: string | undefined, name: string | undefined, message: string, isVerbose = true): LogInfo {
if (isVerbose === true) console.log(`${key}/${name}: ${message}`);
return {
    id: key ?? '',
    name: name ?? '',
    message: message
};
}


/* 
  export const validateFunction = (sig: OpSignature): Promise<void> => {
    if (!sig.modelValidationType) return Promise.resolve();
    const _validationResults = validateModel(sig.modelValidationType, sig.model);
  if (_validationResults && _validationResults.hasErrors()) {
    console.log(`validation errors on ${sig.model.bkey}: `, _validationResults.getErrors());
    sig.logInfo.push(getLogInfo(sig.model.bkey, sig.model.name, `${_validationResults.errorCount} validation errors`));
  } else {
    sig.logInfo.push(getLogInfo(sig.model.bkey, sig.model.name, 'ok'));
  }
  return Promise.resolve();
} */

/******************************************************************************************************************* */
// THIS fix function is adapted for each run !!!
// do not forget to adapt the modelValidationType in the calling function adminops.fixModels()
/* export const fixFunction = async (sig: OpSignature): Promise<void> => {
  if (!sig.dataService) return Promise.resolve()
  const _membership = sig.model;
  if (isMembership(_membership) && _membership.modelType === ModelType.Relationship 
    && _membership.category === RelationshipType.Membership && _membership.bkey) {
      const _bexioId = _membership.properties.bexioId;
    // if the membership has a bexioId
    if (_bexioId) {
      // get the corresponding subject
      const _subject = await firstValueFrom(sig.dataService.readModel(CollectionNames.Subject, _membership.subjectKey)) as SubjectModel;
      // add the bexioID into the subject
      _subject.bexioId = _bexioId;
      try {
        console.log(`AOC.fixFunction: updating subject ${_subject.bkey} with bexioId ${_subject.bexioId}`);
        //await sig.dataService.updateModel(ModelValidationType.Subject, _subject);
      }
      catch(error) {
        console.log(`AOC.fixFunction: error updating subject ${_subject.bkey}: `, error);
      }
      // delete the property bexioId from the memberships
      _membership.properties.bexioId = deleteField() as unknown as string;
      try {
        console.log(`AOC.fixFunction: deleting bexioId ${_bexioId} from membership ${_membership.bkey}` )
        //await sig.dataService.updateModel(ModelValidationType.Membership, _membership);
      }
      catch(error) {
        console.log(`AOC.fixFunction: error updating membership ${_membership.bkey}: `, error);
      }
    }
  }
  return Promise.resolve();
} */

 /*    // disable the following lines to avoid updating the model
    try {
      if (modelValidationType === ModelValidationType.Address) { // CollectionGroup
        // BEWARE: this is destructive !
        //await setDoc(doc(getFirestore(), `${CollectionNames.Subject}/${_newModel.parentKey}/${modelValidationType}`, oldModel['bkey']), _newModel);
        // usually, do it non-destructive like this (in this case, _newModel must contain a bkey. This is removed in the updateModel function): 
        // await dataService.updateModel(`${CollectionNames.Subject}/${_newModel.parentKey}/${modelValidationType}`, _newModel);
      } else if (modelValidationType === ModelValidationType.Comment) { // CollectionGroup
        console.log(`set comment on ${_newModel.parentCollection}/${_newModel.parentKey}/${modelValidationType}/${oldModel['bkey']}`);
        // BEWARE: this is destructive !
        //await setDoc(doc(getFirestore(), `${_newModel.parentCollection}/${_newModel.parentKey}/${modelValidationType}`, oldModel['bkey']), _newModel);
        // usually, do it non-destructive like this (in this case, _newModel must contain a bkey. This is removed in the updateModel function):
        // await dataService.updateModel(`${_newModel.parentCollection}/${_newModel.parentKey}/${modelValidationType}`, _newModel);
      } else {    // Collection (in this case, _newModel must contain a bkey. This is removed in the updateModel function)
        // await dataService.updateModel(modelValidationType, model);
      }
      // logInfo.push(getLogInfo(model.bkey, model.name, 'fixed'));  
    }
    catch (error) {
      console.log('error on ' + _newModel.parentKey + '/' + oldModel['bkey'] + ': ', error);
    }
  }
  return Promise.resolve();
} */
/******************************************************************************************************************* */

/*   export const listIbanFunction = async (sig: OpSignature): Promise<void> => {
  const _env = inject(ENV);
  if (isSubject(sig.model)) {
    const _collName = CollectionNames.Subject + '/' + sig.model.bkey + '/' + CollectionNames.Address;
    const _addresses = await firstValueFrom(listModelsBySingleQuery(getFirestore(), _collName, _env.auth.tenantId, 'category', AddressChannel.BankAccount, '==', 'name', 'asc')) as AddressModel[];
    if (_addresses?.length > 0) {
      for (const element of _addresses) {
        console.log(sig.model.bkey, sig.model.firstName + ' ' + sig.model.name, element.name);
        sig.logInfo.push(getLogInfo(sig.model.bkey, sig.model.firstName + ' ' + sig.model.name, element.name));
      }
    }
  }
} */

/* 
export const checkJuniorEntryFunction = async (sig: OpSignature): Promise<void> => {
  if (isMembership(sig.model) && sig.model.subjectType === ModelType.Person && sig.model.priority === 1 && sig.model.subType != ScsMemberType.Junioren) {
    const _refYear = parseInt(sig.model.validFrom.substring(0, 4));
    const _dateOfBirth = sig.model.properties.dateOfBirth;
    if (!_dateOfBirth) {
      sig.logInfo.push(getLogInfo(sig.model.bkey, getFullPersonName(sig.model.subjectName2, sig.model.subjectName), 'SCS member has no dateOfBirth'));
    } else if(getAge(_dateOfBirth, false, _refYear) < 19) {
      const _mCat = getCategoryAbbreviation(ScsMemberTypes, sig.model.subType);
      const _birthYear = parseInt(_dateOfBirth.substring(0, 4));
      const _activEntry = _birthYear + 19 + '0101';
      const _prefix = _mCat + ':' + sig.model.validFrom + '-' + sig.model.validTo + '/A:' + _activEntry + ' -> ';
      if (sig.model.validTo === END_FUTURE_DATE_STR) {
        // if _activEntry > today, then the membership is still active
        if (compareDate(_activEntry, getTodayStr(DateFormat.StoreDate)) > 0) {
          sig.logInfo.push(getLogInfo(sig.model.bkey, getFullPersonName(sig.model.subjectName2, sig.model.subjectName), _prefix + 'J:' + sig.model.validFrom + '-99991231'));
        } else {
          sig.logInfo.push(getLogInfo(sig.model.bkey, getFullPersonName(sig.model.subjectName2, sig.model.subjectName), _prefix + 'J:' + sig.model.validFrom + ', ' + _mCat + ':' + _activEntry + '-99991231'));
        }
      } else 
      if (compareDate(sig.model.validTo, _activEntry) > 0) {    // validTo > _activEntry
        sig.logInfo.push(getLogInfo(sig.model.bkey, getFullPersonName(sig.model.subjectName2, sig.model.subjectName), _prefix + 'J:' + sig.model.validFrom + ', ' + _mCat + ':' + _activEntry + '-' + sig.model.validTo));
      } else {
        sig.logInfo.push(getLogInfo(sig.model.bkey, getFullPersonName(sig.model.subjectName2, sig.model.subjectName), _prefix + 'J:' + sig.model.validFrom + '-' + sig.model.validTo));
      }  
    }
  }
} */

/* export const updateMembershipPrices = async (sig: OpSignature): Promise<void> => {
  if (isMembership(sig.model)) {
    if (compareDate(sig.model.validTo, getTodayStr()) > 0) {  // only currently active memberships should be updated
      if (sig.model.objectKey === OrgKey.SCS) {
        sig.model.price = getScsMembershipPrice(sig.model.subType);
      } else if (sig.model.objectKey === OrgKey.SRV) {
        sig.model.price = getMembershipPrice(sig.model.subType);
      } else {
        sig.model.price = 0;
      }
      sig.logInfo.push(getLogInfo(sig.model.bkey, sig.model.subjectName2 + ' ' + sig.model.subjectName, sig.model.price + ''));
      // tbd: only update for currently active memberships (validTo > today)
      // await dataService.updateModel(modelValidationType, model);
    }
  }
} */
/* 
export const updateMembershipAttributes = async (sig: OpSignature): Promise<void> => {
  const _dataService = sig.dataService;
  if (!_dataService) return Promise.resolve()
  if (isSubject(sig.model) && sig.model.modelType === ModelType.Person && sig.model.bkey) {

    // 1) get all relationships of the subject
    _dataService.listModelsBySingleQuery(CollectionNames.Membership, 'subjectKey', sig.model.bkey, '==', 'validFrom', 'asc').pipe(take(1))
      .subscribe(async (_relationships: BaseModel[]) => {
        console.log('fixing person: ' + sig.model.bkey + '/' + sig.model.firstName + ' ' + sig.model.name);

        console.log('  SCS:');
        updateMembershipAttributesPerOrg(_relationships as RelationshipModel[], OrgKey.SCS, _dataService);

        console.log('  SRV:');
        updateMembershipAttributesPerOrg(_relationships as RelationshipModel[], OrgKey.SRV, _dataService);

        console.log('  Other:');
        updateMembershipAttributesPerOrg(_relationships as RelationshipModel[], OrgKey.Other, _dataService);
      });
  }
} */


/*    private async executeAocOperation(modelValidationType: ModelValidationType, opLabel: string, op: (sig: OpSignature) => Promise<void>): Promise<void> {
      this.logInfo = [];
      let _counter = 0;
      this._logTitle.next(`Reading collection ${modelValidationType}`);
      const _snapshot =  (modelValidationType === ModelValidationType.Address || modelValidationType === ModelValidationType.Comment) ?
        await getDocs(collectionGroup(this.firestore, modelValidationType.toString())) :
        await getDocs(collection(this.firestore, modelValidationType.toString()));
      const _collName = (modelValidationType === ModelValidationType.Address || modelValidationType === ModelValidationType.Comment) ? 'collectionGroup' : 'collection';
      this._logTitle.next(`${opLabel} ${_snapshot.size} items in ${_collName} ${modelValidationType}`);
      _snapshot.forEach((_doc) => {
        //if (_counter > 3) return;
        const _model = _doc.data();
        _model['bkey'] = _doc.id;
        if (modelValidationType === ModelValidationType.Address) {
          // check for parentCollections (we want to ensure that we do not change anything in old Collection subjects. 
          // Only Collection subjects2 should be changed.)
          if (_doc.ref.parent.parent?.parent?.id === CollectionNames.Subject) {
            _counter++;
            op({ modelValidationType: modelValidationType, model: _model, logInfo: this.logInfo, dataService: this.dataService });
          }
        }  else if (modelValidationType === ModelValidationType.Comment) {          
          // CHECK FOR ONLY NEW COLLECTIONS !! (before updating the data))
          // subjects2, resources6, memberships3, ownerships2, applications
          const _parentKey = _doc.ref.parent.parent?.id;
          const _parentCollection = _doc.ref.parent.parent?.parent?.id;
          if (_parentCollection === PersonCollection || _parentCollection === ResourceCollection || 
              _parentCollection === MembershipCollection || _parentCollection === OwnershipCollection) {
            _counter++;
            _model['parentKey'] = _parentKey;
            _model['parentCollection'] = _parentCollection;
            op({ modelValidationType: modelValidationType, model: _model, logInfo: this.logInfo, dataService: this.dataService });
          }
  
        } else {
          _counter++;
          op({ modelValidationType: modelValidationType, model: _model, logInfo: this.logInfo, dataService: this.dataService });
        }
      });
      console.log(_counter + ' models processed.');
      this.logInfo.push(getLogInfo('', '', 'DONE'));
    } */