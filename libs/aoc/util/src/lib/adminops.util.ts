import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { ToastController } from '@ionic/angular/standalone';

import { FirebaseUserModel, LogInfo, PersonModel, UserModel } from '@bk2/shared-models';
import { error, showToast } from '@bk2/shared-util-angular';
import { die, generateRandomString } from '@bk2/shared-util-core';
import { getApp } from 'firebase/app';

export function getLogInfo(key: string | undefined, name: string | undefined, message: string, isVerbose = true): LogInfo {
  if (isVerbose === true) console.log(`${key}/${name}: ${message}`);
  return {
    id: key ?? '',
    name: name ?? '',
    message: message,
  };
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength (Firebase minimum: 6 characters)
 */
export function isValidPassword(password: string): boolean {
  return !!password && password.length >= 6;
}

/**
 * Create a new Firebase account with the given email address.
 * @param toastController used to show a toast message
 * @param loginEmail the login email address of the new user
 * @param password the password of the new user account
 * @param displayName the display name of the new user account, by default the login email is used
 * @returns the uid of the new Firebase account or undefined if there was an error.
 */
export async function createFirebaseAccount(toastController: ToastController, loginEmail: string, password: string, displayName?: string): Promise<string | undefined> {
  try {
    if (!isValidPassword(password)) {
      await showToast(toastController, 'adminops.util.createFirebaseAccount: password must be at least 6 characters');
      return undefined;
    }
    if (!displayName || displayName.length === 0) {
      displayName = loginEmail;
    }

    // Get a reference to the Firebase Functions service.
    const functions = getFunctions(getApp(), 'europe-west6');
    //if (store.appStore.env.useEmulators) {
    //  connectFunctionsEmulator(functions, 'localhost', 5001);
    //}
    const _createFirebaseUserFunction = httpsCallable(functions, 'createFirebaseUser');
    const _result = await _createFirebaseUserFunction({ email: loginEmail, password, displayName });
    const _data = _result.data as { uid: string };

    await showToast(toastController, '@auth.operation.create.confirmation');
    console.log(`adminops.util.createFirebaseAccount: successfully created user ${_data.uid} for ${loginEmail}`);
    return _data.uid;
  } catch (_ex) {
    error(toastController, 'adminops.util.createFirebaseAccount:  -> error: ' + JSON.stringify(_ex));
  }
}

/**
 * Look for a user with the given loginEmail and return its firebase uid.
 * @param loginEmail the login email address of the new user
 * @returns the firebase user id
 */
export async function getUidByEmail(loginEmail: string): Promise<string | undefined> {
  try {
    // Get a reference to the Firebase Functions service.
    const functions = getFunctions(getApp(), 'europe-west6');
    //if (store.appStore.env.useEmulators) {
    //  connectFunctionsEmulator(functions, 'localhost', 5001);
    //}
    const _getUidByEmailFunction = httpsCallable(functions, 'getUidByEmail');
    const _result = await _getUidByEmailFunction({ email: loginEmail });
    const _data = _result.data as { uid: string };
    console.log(`adminops.util.getUidByEmail: received uid ${_data.uid} for ${loginEmail}`);
    return _data.uid;
  } catch (error) {
    console.error('adminops.util.getUidByEmail:  -> error: ' + JSON.stringify(error));
  }
}

/**
 * Lookup a firebase user by its uid.
 * @param uid the firebase user id
 * @returns limited user data to avoid exposing sensitive data
 */
export async function getFirebaseUser(uid: string): Promise<FirebaseUserModel | undefined> {
  try {
    // Get a reference to the Firebase Functions service.
    const functions = getFunctions(getApp(), 'europe-west6');
    //if (store.appStore.env.useEmulators) {
    //  connectFunctionsEmulator(functions, 'localhost', 5001);
    //}
    const _getFirebaseUserFunction = httpsCallable(functions, 'getFirebaseUser');
    const _result = await _getFirebaseUserFunction({ uid });
    const _fbUser = _result.data as FirebaseUserModel;
    console.log(`adminops.util.getFirebaseUser: received firebase user`, _fbUser);
    return _fbUser;
  } catch (error) {
    console.error('adminops.util.getFirebaseUser:  -> error: ' + JSON.stringify(error));
  }
}

/**
 * Set a new password for the firebase user with a given uid.
 * @param uid the firebase user id of the user to set its password for
 * @param password the new password
 */
export async function setPassword(uid: string, password: string, useEmulators = false): Promise<void> {
  try {
    // Get a reference to the Firebase Functions service.
    const functions = getFunctions(getApp(), 'europe-west6');
    if (useEmulators) {
      connectFunctionsEmulator(functions, 'localhost', 5001);
    }
    const _setPasswordFunction = httpsCallable(functions, 'setPassword');
    await _setPasswordFunction({ uid, password });
    console.log(`adminops.util.setPassword: setting new password for user ${uid}`);
  } catch (error) {
    console.error('adminops.util.setPassword:  -> error: ' + JSON.stringify(error));
  }
}

/**
 * Set a new loginEmail for the firebase user with a given uid.
 * @param uid the firebase user id of the user to set its password for
 * @param email the new login email
 */
export async function setLoginEmail(uid: string, email: string): Promise<void> {
  try {
    const functions = getFunctions(getApp(), 'europe-west6');
    //if (store.appStore.env.useEmulators) {
    //  connectFunctionsEmulator(functions, 'localhost', 5001);
    //}
    const _setLoginEmailFunction = httpsCallable(functions, 'setLoginEmail');
    await _setLoginEmailFunction({ uid, email });
    console.log(`adminops.util.setLoginEmail: setting new email for user ${uid}`);
  } catch (error) {
    console.error('adminops.util.setLoginEmail:  -> error: ' + JSON.stringify(error));
  }
}

/**
 * Update an existing firebase user. This can also be used to change the users loginEmail.
 * @param uid the firebase user id of the user to set its password for
 * @param fbUser the FirebaseUserModel data structure (it needs to be complete and is saved as is)
 */
export async function updateFirebaseUser(fbUser: FirebaseUserModel, useEmulator = true): Promise<void> {
  try {
    const functions = getFunctions(getApp(), 'europe-west6');
    if (useEmulator) {
      connectFunctionsEmulator(functions, 'localhost', 5001);
    }
    const _updateFirebaseUserFunction = httpsCallable(functions, 'updateFirebaseUser');
    await _updateFirebaseUserFunction(fbUser);
    console.log(`adminops.util.updateFirebaseUser: user ${fbUser.uid} updated.`);
  } catch (error) {
    console.error('adminops.util.updateFirebaseUser:  -> error: ' + JSON.stringify(error));
  }
}

/**
 * Generates a password.
 * By default, the password is a 12 char long random string.
 * Optionally, a password can be preset.
 * @param password the preset password
 */
export function generatePassword(password?: string): string {
  return !password || password.length === 0 ? generateRandomString(12) : password;
}

/**
 * Create a user that corresponds to the given person. This is used when registering a new user.
 * @param person the person that the user should be created for
 * @returns user model that corresponds to the given person
 */
export function createUserFromPerson(person: PersonModel, tenantId: string): UserModel {
  if (!person.bkey) die('AdminOpsUtil.createUserFromPerson: person must have a bkey.');
  const _user = new UserModel(tenantId);
  _user.loginEmail = person.favEmail;
  _user.personKey = person.bkey;
  _user.firstName = person.firstName;
  _user.lastName = person.lastName;
  _user.gravatarEmail = person.favEmail;
  _user.roles = { registered: true };
  return _user;
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
  if (isMembership(_membership) && _membership.modelType === 'relationship' 
    && _membership.category === 'membership' && _membership.bkey) {
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
  if (isMembership(sig.model) && sig.model.subjectType === 'person' && sig.model.priority === 1 && sig.model.subType != ScsMemberType.Junioren) {
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
  if (isSubject(sig.model) && sig.model.modelType === 'person' && sig.model.bkey) {

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
