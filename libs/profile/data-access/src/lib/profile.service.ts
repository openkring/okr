import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { collection, query } from 'firebase/firestore';
import { collectionData } from 'rxfire/firestore';

import { AddressCollection, AddressModel, PersonCollection, PersonModel, UserCollection, UserModel } from '@bk2/shared/models';
import { FIRESTORE } from '@bk2/shared/config';
import { FirestoreService } from '@bk2/shared/data-access';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly firestore = inject(FIRESTORE);

  /** a profile can not be created nor deleted. */

  public readPerson(personKey: string): Observable<PersonModel | undefined> {
    return this.firestoreService.readModel<PersonModel>(PersonCollection, personKey);
  }

  /**
   * Update the currentUser's profile data in the database with new values.
   * The method does two updates (person and user), saves two comments, and shows one confirmation toast.
   * @param person the PersonModel corresponding to the currentUser.
   * @param user the UserModel corresponding to the currentUser.
   * @param currentUser the UserModel of the currently logged in user, used for logging and confirmation messages.
   * @returns a Promise of the key of the updated person or undefined if the operation failed.
   */
  public async update(person: PersonModel, user: UserModel, currentUser?: UserModel): Promise<string | undefined> {
    // tbd: update person index
    await this.firestoreService.updateModel<PersonModel>(PersonCollection, person, false, undefined, currentUser);
    // tbd: update user index
    await this.firestoreService.updateModel<UserModel>(UserCollection, user, false, '@profile.operation.update.conf', currentUser); 
  }

  /** Profile can not be deleted. */

  public listAddresses(person: PersonModel): Observable<AddressModel[]> {
    const _ref = query(collection(this.firestore, `${PersonCollection}/${person.bkey}/${AddressCollection}`));
    return collectionData(_ref, { idField: 'bkey' }) as Observable<AddressModel[]>;
  }
}
