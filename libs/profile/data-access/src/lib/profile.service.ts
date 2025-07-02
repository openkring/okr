import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ToastController } from '@ionic/angular/standalone';
import { collection, query } from 'firebase/firestore';
import { collectionData } from 'rxfire/firestore';

import { AddressCollection, AddressModel, PersonCollection, PersonModel, UserCollection, UserModel } from '@bk2/shared/models';
import { ENV, FIRESTORE } from '@bk2/shared/config';
import { readModel, updateModel } from '@bk2/shared/util-core';
import { confirmAction } from '@bk2/shared/util-angular';

import { bkTranslate } from '@bk2/shared/i18n';
import { saveComment } from '@bk2/comment/util';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);
  private readonly env = inject(ENV);

  /** a profile can not be created nor deleted. */

  public readPerson(personKey: string): Observable<PersonModel | undefined> {
    return readModel<PersonModel>(this.firestore, PersonCollection, personKey);
  }

  /**
   * Update the currentUser's profile data in the database with new values.
   * @param person the PersonModel corresponding to the currentUser.
   * @param vm the ProfileFormModel with the new values. It contains data of the currentUser and the person corresponding to it.
   */
  public async update(person: PersonModel, user: UserModel, currentUser?: UserModel): Promise<string> {
   try {
      // update person
      const _personKey = await updateModel(this.firestore, PersonCollection, person);
      await saveComment(this.firestore, this.env.tenantId, currentUser, PersonCollection, _personKey, '@comment.operation.update.conf');

      // update user
      const _userKey = await updateModel(this.firestore, UserCollection, user);
      await saveComment(this.firestore, this.env.tenantId, currentUser, UserCollection, _userKey, '@comment.operation.update.conf');

      await confirmAction(bkTranslate('@profile.operation.update.conf'), true, this.toastController);
      return _personKey;    
    }
    catch (error) {
      await confirmAction(bkTranslate('@profile.operation.update.error'), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }    
  }

  /** Profile can not be deleted. */

  public listAddresses(person: PersonModel): Observable<AddressModel[]> {
    const _ref = query(collection(this.firestore, `${PersonCollection}/${person.bkey}/${AddressCollection}`));
    return collectionData(_ref, { idField: 'bkey' }) as Observable<AddressModel[]>;
  }
}
