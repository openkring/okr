import { Injectable, inject } from "@angular/core";
import { doc, setDoc } from "firebase/firestore";
import { Observable, of } from "rxjs";

import { readModel, removeKeyFromBkModel } from "@bk2/shared/util-core";
import { FIRESTORE } from "@bk2/shared/config";
import { AvatarCollection, AvatarModel } from "@bk2/shared/models";

export interface UserPhoto {
  filepath: string;
  webviewPath?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AvatarService {
  private readonly firestore = inject(FIRESTORE);

/**
 * Save a model as a new Firestore document into the database. 
 * We use a combination of the modelType and mkey as the document ID.
 * This function uses setdoc() to overwrite a document with the same ID. If the document does not exist, it will be created.
 * If the document does exist, its contents will be overwritten with the newly provided data.
 * @param model the avatar data to save
 * @returns a Promise of the key of the newly stored model
 */
  public async updateOrCreate(avatar: AvatarModel): Promise<string> {
    // we delete the bkey from the model because we don't want to store it in the database (_ref.id is available instead)
    const _storedModel = removeKeyFromBkModel(avatar);
    
    const _ref = doc(this.firestore, AvatarCollection, `${avatar.bkey}`);
    try {
      // we need to convert the custom object to a pure JavaScript object (e.g. arrays)
      await setDoc(_ref, JSON.parse(JSON.stringify(_storedModel)));
      return Promise.resolve(_ref.id);
    }
    catch (_ex) {
      console.error(`AvatarService.updateOrCreate -> ERROR on path=${AvatarCollection}/${_ref.id}:`, _ex);
      return Promise.reject(new Error('Failed to create model'));
    }
  }

    // key  =  ModelType.ModelKey, e.g. 15.1123123asdf
  public read(key: string): Observable<AvatarModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return readModel<AvatarModel>(this.firestore, AvatarCollection, key);
  }
}