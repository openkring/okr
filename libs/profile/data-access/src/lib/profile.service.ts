import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AddressCollection, AddressModel, PersonCollection, PersonModel, UserCollection, UserModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);

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
    return await this.firestoreService.updateModel<UserModel>(UserCollection, user, false, '@profile.operation.update.conf', currentUser);
  }

  /** Profile can not be deleted. */

  public listAddresses(person: PersonModel): Observable<AddressModel[]> {
    const _collection = `${PersonCollection}/${person.bkey}/${AddressCollection}`;
    return this.firestoreService.searchData<AddressModel>(_collection, getSystemQuery(this.env.tenantId), 'name', 'asc');
  }
}
