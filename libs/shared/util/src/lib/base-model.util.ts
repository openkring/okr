import { map, Observable, of } from 'rxjs';
import { ToastController } from '@ionic/angular';
import { docData } from 'rxfire/firestore';
import { collection, deleteDoc, doc, Firestore, setDoc, updateDoc } from 'firebase/firestore';

import { ActionType, BkModel } from '@bk2/shared/models';
import { die, warn } from './log.util';
import { removeKeyFromBkModel, removeUndefinedFields } from './type.util';
import { bkTranslate, confirmAction } from '@bk2/shared/i18n';
import { sortAscending, SortCriteria, sortDescending, SortDirection } from './sort.util';

/*----------------------- CRUD ----------------------------------------------*/

/**
 * Save a model as a new Firestore document into the database. 
 * If bkey is not set, the document ID is automatically assigned, otherwise bkey is used as the document ID in Firestore.
 * This function uses setdoc() to overwrite a document with the same ID. If the document does not exist, it will be created.
 * If the document does exist, its contents will be overwritten with the newly provided data.
 * @param firestore a handle to the Firestore database
 * @param collectionName the name of the Firestore collection to create the model in
 * @param model the data to save
 * @param i18nPrefix The prefix for internationalized confirmation and error messages. 
 * ¨      Expected to have .conf for success and .error for failure translations.
 *        if undefined, no confirmation toast is shown.
 * @param toastController the toast controller to show the confirmation toast
 * @returns a Promise of the key of the newly stored model
 */
export async function createModel(firestore: Firestore, collectionName: string, model: BkModel, tenantId: string, i18nPrefix?: string, toastController?: ToastController): Promise<string> {
  if (!model) die('BaseModelUtil.createModel: model is mandatory.');
  const _prefix = `BaseModelUtil.createModel(${model.bkey})`;
  // If bkey is not set, the document ID is automatically assigned, otherwise bkey is used as the document ID in Firestore.
  const _key = model.bkey;
  const _ref = (!_key || _key.length === 0) ? doc(collection(firestore, collectionName)) : doc(firestore, collectionName, _key);

  // we delete the bkey from the model because we don't want to store it in the database (_ref.id is available instead)
  const _storedModel = removeKeyFromBkModel(model);
  _storedModel.tenants = [tenantId];   // ensure that the tenant is set

  try {
    // we need to convert the custom object to a pure JavaScript object (e.g. arrays)
    await setDoc(_ref, JSON.parse(JSON.stringify(_storedModel)));
    if (i18nPrefix && i18nPrefix.length > 0 && toastController) {
      await confirmAction(bkTranslate(`${i18nPrefix}.conf`), true, toastController);
    }
    return Promise.resolve(_ref.id);
  }
  catch (_ex) {
    console.error(`${_prefix} -> ERROR on path=${collectionName}/${_ref.id}:`, _ex);
    if (i18nPrefix && i18nPrefix.length > 0 && toastController) {
      await confirmAction(bkTranslate(`${i18nPrefix}.error`), true, toastController);
    }
    return Promise.reject(new Error('Failed to create model'));
  }
}

/**
 * Asynchronously creates an object in a specified Firestore collection.
 * Use this method to save any data other than a model. For saving a model, use createModel()
 * 
 * @param {Firestore} firestore - The Firestore instance in which to create the object.
 * @param {string} collectionName - The name of the Firestore collection in which to create the object.
 * @param {object} object - The object data to be created in Firestore.
 * @param {string} key - The unique key for the object in the collection.
 * @param i18nPrefix The prefix for internationalized confirmation and error messages. 
 * ¨      Expected to have .conf for success and .error for failure translations.
 *        if undefined, no confirmation toast is shown.
 * @param toastController the toast controller to show the confirmation toast
 * 
 * @returns {Promise<string>} Returns a promise that resolves with the provided key if the object is successfully created.
 * 
 * @throws {Error} Throws an error if the `object` or `collectionName` is not provided.
 * @throws {Error} Throws an error if there's a problem creating the object in Firestore.
 * 
 * @see Firestore for more details about the Firestore instance.
 * 
 * Note: This function uses `setDoc` and `doc` methods from Firestore SDK.
 */
export async function createObject(firestore: Firestore, collectionName: string, object: object, key: string | undefined, i18nPrefix?: string, toastController?: ToastController): Promise<string> {
  if (collectionName?.length === 0) die('BaseModelUtil.createObject: collectionName is mandatory.');
  if (!object) die('BaseModelUtil.createObject: object is mandatory.');
  try {
    // if the key is not set, the document ID is automatically assigned, otherwise the given key is used as the document ID in Firestore.
    const _ref = key?.length === 0 ? doc(collection(firestore, collectionName)) : doc(firestore, `${collectionName}/${key}`);
    await setDoc(_ref, object);
    if (i18nPrefix && i18nPrefix.length > 0 && toastController) {
      await confirmAction(bkTranslate(`${i18nPrefix}.conf`), true, toastController);
    }
    return Promise.resolve(_ref.id);
  }
  catch (_ex) {
    console.error(`BaseModelUtil.createObject(${collectionName}, ${key}) -> ERROR: `, _ex);
    if (i18nPrefix && i18nPrefix.length > 0 && toastController) {
      await confirmAction(bkTranslate(`${i18nPrefix}.error`), true, toastController);
    }
    return Promise.reject(new Error('Failed to create object'));
  }
}

/**
 * Lookup a model in the Firestore database and return it as an Observable.
 * @param firestore a handle to the Firestore database
 * @param collectionName the name of the Firestore collection (this can be a path e.g. subjects/SUBJECTKEY/addresses)
 * @param key the key of the document in the database
 */
export function readModel<T>(firestore: Firestore, collectionName: string, key: string | undefined): Observable<T | undefined> {
  if (!collectionName || collectionName.length === 0) die('BaseModelUtil.readModel: collectionName is mandatory');
  if (!key) die('BaseModelUtil.readModel: key is mandatory');
  try {
    // we need to add the firestore document id as bkey into the model
    return docData(doc(firestore, `${collectionName}/${key}`), { idField: 'bkey' }) as Observable<T>;
  }
  catch (_ex) {
    console.error(`BaseModelUtil.readModel(${collectionName}/${key}) -> ERROR: `, _ex);
    return of(undefined);
  }
}

export function enforceReadModel<T>(firestore: Firestore, collectionName: string, key: string): Observable<T> {
  return (docData(doc(firestore, `${collectionName}/${key}`), { idField: 'bkey' }) as Observable<T>)
    .pipe(map((model) => model ?? die(`Model ${collectionName}/${key} not found`)));
}

/**
 * Lookup an object in the Firestore database and return it as an Observable.
 * @param firestore a handle to the Firestore database
 * @param collectionName the name of the Firestore collection (this can be a path)
 * @param key the key of the document in the database
 */
export function readObject<T>(firestore: Firestore, collectionName: string, key: string): Observable<T> {
  if (!collectionName) die('BaseModelUtil.readObject: collectionName is mandatory');
  if (!key) die('BaseModelUtil.readObject: key is mandatory');
  try {
    return docData(doc(firestore, `${collectionName}/${key}`)) as Observable<T>;
  }
  catch (_ex) {
    console.error(`BaseModelUtil.readObject(${collectionName}/${key}) -> ERROR: `, _ex);
    return die('Failed to read object');
  }
}

/**
 * Update the document with id=uid with the given document.
 * Update is for non-destructive updates, ie. it updates the current value
 * within the database with the new value specified as the parameter.
 * @param firestore a handle to the Firestore database
 * @param collectionName the name of the Firestore collection to update the model in
 * @param model the changed model document to save
 * @param i18nPrefix The prefix for internationalized confirmation and error messages. 
 * ¨      Expected to have .conf for success and .error for failure translations.
 *        if undefined, no confirmation toast is shown.
 * @param toastController the toast controller to show the confirmation toast
 * @returns a Promise of the key of the updated model
 */
export async function updateModel(firestore: Firestore, collectionName: string, model: BkModel, i18nPrefix?: string, toastController?: ToastController): Promise<string> {
  if (!model) die('BaseModelUtil.updateModel: model is mandatory.');
  if (!model.tenants || model.tenants.length === 0) die('BaseModelUtil.updateModel: model.tenants is mandatory.');

  const _key = model.bkey;
  if (!_key || _key.length === 0) die('BaseModelUtil.updateModel: model.bkey is mandatory.');

  const _prefix = `BaseModelUtil.updateModel(${_key})`;
  const _path = `${collectionName}/${_key}`;

  // we delete attribute bkey from the model because we don't want to store it in the database (_ref.id is available instead)
  const _storedModel = removeKeyFromBkModel(structuredClone(model));
  const _updateModel = removeUndefinedFields(_storedModel);
  try {
    await updateDoc(doc(firestore, _path), {..._updateModel});
    if (i18nPrefix && i18nPrefix.length > 0 && toastController) {
      await confirmAction(bkTranslate(`${i18nPrefix}.conf`), true, toastController);
    }
    return Promise.resolve(_key);
  }
  catch (_ex) {
    console.error(`${_prefix} -> ERROR: `, _ex);
    if (i18nPrefix && i18nPrefix.length > 0 && toastController) {
      await confirmAction(bkTranslate(`${i18nPrefix}.error`), true, toastController);
    }
    return Promise.reject(new Error('Failed to update model'));
  }
}

/**
 * 
 * @param firestore a handle to the Firestore database
 * @param collectionName the name of the Firestore collection to update the object in
 * @param key the document id of the object in the database
 * @param object the object with the new values
 * @param i18nPrefix The prefix for internationalized confirmation and error messages. 
 * ¨      Expected to have .conf for success and .error for failure translations.
 *        if undefined, no confirmation toast is shown.
 * @param toastController the toast controller to show the confirmation toast
 * @returns a Promise of the key of the updated object
 */
export async function updateObject(firestore: Firestore, collectionName: string, key: string, object: unknown, i18nPrefix?: string, toastController?: ToastController): Promise<string> {
  if (collectionName?.length === 0) die('BaseModelUtil.updateObject: collectionName is mandatory.');
  if (key?.length === 0) die('BaseModelUtil.updateObject: key is mandatory.');
  if (!object) die('BaseModelUtil.updateObject: object is mandatory.');
  const _path = `${collectionName}/${key}`;
  try {
    await updateDoc(doc(firestore, _path), object);
    if (i18nPrefix && i18nPrefix.length > 0 && toastController) {
      await confirmAction(bkTranslate(`${i18nPrefix}.conf`), true, toastController);
    }
    return Promise.resolve(key);
  }
  catch (_ex) {
    console.error(`BaseModelUtil.updateObject(${_path}) -> ERROR: `, _ex);
    if (i18nPrefix && i18nPrefix.length > 0 && toastController) {
      await confirmAction(bkTranslate(`${i18nPrefix}.error`), true, toastController);
    }
    return Promise.reject(new Error('Failed to update object'));
  }
}

/**
 * Asynchronously updates an existing model or creates a new model in a specified Firestore collection. 
 * Provides feedback either through internationalized messages or console logs.
 * Optionally navigates to a specified URL after the operation.
 * 
 * @param {Firestore} firestore - The Firestore instance where the model resides.
 * @param {string} collectionName - The name of the Firestore collection.
 * @param {BaseModel} model - The model instance to be updated or created.
 * @param {ActionType} action - The type of action, either 'Create' or 'Update'.
 * @param i18nPrefix The prefix for internationalized confirmation and error messages. 
 * ¨      Expected to have .conf for success and .error for failure translations.
 *        if undefined, no confirmation toast is shown.
 * @param toastController the toast controller to show the confirmation toast
 * 
 * @returns {Promise<void>} Returns a promise that resolves once the operation and optional navigation are completed.
 * @throws {Error} Throws an error if there's an issue updating or creating the model in Firestore.
 * 
 * @see Firestore for more details on the Firestore instance.
 * @see BaseModel for details on the model structure.
 * @see ToastController for feedback display details.
 * @see Router for navigation details.
 */
export async function updateOrCreateModel(firestore: Firestore, collectionName: string, model: BkModel, action: ActionType, tenantId: string, i18nPrefix?: string, toastController?: ToastController): Promise<string> {
  try {
    const _key = (action === ActionType.Create) ? 
        await createModel(firestore, collectionName, model, tenantId) : 
        await updateModel(firestore, collectionName, model);
      if (i18nPrefix && i18nPrefix.length > 0 && toastController) {
        confirmAction(i18nPrefix + '.conf', true, toastController);    
      }
      return Promise.resolve(_key);
  }
  catch (_ex) {
    if (!i18nPrefix || i18nPrefix.length === 0 || !toastController) {
      console.warn('ERROR updateOrCreateModel: ', _ex);
    } else {
      confirmAction(i18nPrefix + '.error', true, toastController);
    }
    return Promise.reject(new Error('Failed to update or create model'));
  }
}

/**
 * Delete the model.
 * We don't delete models permanently. Instead we archive the models.
 * Admin can still find the archived models in the database.
 * Admin user may also permanently delete archived models directly in the database.
 *
 * @param firestore a handle to the Firestore database
 * @param collectionName the name of the Firestore collection to delete the model from
 * @param model the model document to delete
 * @param i18nPrefix The prefix for internationalized confirmation and error messages. 
 * ¨      Expected to have .conf for success and .error for failure translations.
 *        if undefined, no confirmation toast is shown.
 * @param toastController the toast controller to show the confirmation toast
 * @returns a void Promise
 */
export async function deleteModel(firestore: Firestore, collectionName: string, model: BkModel, i18nPrefix?: string, toastController?: ToastController): Promise<void> {
  model.isArchived = true;
  await updateModel(firestore, collectionName, model, i18nPrefix, toastController);
}

/**
 * Delete an object in the database.
 * Objects are directly and permanently deleted in the database.

 * @param firestore a handle to the Firestore database
 * @param collectionName the name of the Firestore collection to delete the model from
 * @param key the document id of the object in the database
 * @param i18nPrefix The prefix for internationalized confirmation and error messages. 
 * ¨      Expected to have .conf for success and .error for failure translations.
 *        if undefined, no confirmation toast is shown.
 * @param toastController the toast controller to show the confirmation toast
 * @returns a void Promise
 */
export async function deleteObject(firestore: Firestore, collectionName: string, key: string, i18nPrefix?: string, toastController?: ToastController): Promise<void> {
  const _path = `${collectionName}/${key}`;
  try {
    await deleteDoc(doc(firestore, _path));
    if (i18nPrefix && i18nPrefix.length > 0 && toastController) {
      confirmAction(i18nPrefix + '.conf', true, toastController);    
    }
    return Promise.resolve();
  }
  catch (_ex) {
    if (!i18nPrefix || i18nPrefix.length === 0 || !toastController) {
      console.warn(`BaseModelUtil.deleteObject(${_path}): ERROR: `, _ex);
    } else {
      confirmAction(i18nPrefix + '.error', true, toastController);
    }
    return Promise.reject(new Error('Failed to delete object'));
    }
}

export function reduceYearFieldName(yearFieldName: string | undefined): string | undefined {
  if (!yearFieldName || yearFieldName.length === 0) return undefined;
  if (yearFieldName === 'dateOfFoundation') return 'dateOfBirth';   // map dateOfFoundation to dateOfBirth
  if (yearFieldName === 'dateOfLiquidation') return 'dateOfDeath';  // map dateOfLiquidation to dateOfDeath
  return yearFieldName;
}

/*-------------------------SORT --------------------------------------------*/
export function sortModels(models: BkModel[], sortCriteria: SortCriteria): BkModel[] {
  switch(sortCriteria.direction) {
    case SortDirection.Ascending: return sortAscending(models, sortCriteria.field, sortCriteria.typeIsString);
    case SortDirection.Descending: return sortDescending(models, sortCriteria.field, sortCriteria.typeIsString);
    default: return models;
  }
}

/*-------------------------HELPERS --------------------------------------------*/

export function checkKey(model: BkModel, key?: string): BkModel {
  if (!model.bkey || model.bkey.length === 0) {
    warn('base-model.util.checkKey(): bkey is empty');
  }
  if (key && model.bkey !== key) {
    warn(`base-model.util.checkKey(): bkey mismatch: ${model.bkey} !== ${key}`);
    model.bkey = key;
  }
  return model;
}

/* ---------------------- Index operations -------------------------------*/
export function addIndexElement(index: string, key: string, value: string | number | boolean): string {
  if (!value || !key || key.length === 0) {
    return index;
  }
  if (typeof (value) === 'string') {
    if (value.length === 0 || (value.length === 1 && value.startsWith(' '))) {
      return index;
    }
  }
  return `${index} ${key}:${value}`;
}
