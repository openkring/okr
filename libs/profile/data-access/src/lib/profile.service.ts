import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { AddressCollection, AddressModel, PersonCollection, PersonModel, UserCollection, UserModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';

import { getPersonIndex } from '@bk2/subject-person-util';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    update_conf:  PFX + 'operation.update.conf',
    update_error: PFX + 'operation.update.error',
  });

  /** a profile can not be created nor deleted. */

  public readPerson(personKey: string): Observable<PersonModel | undefined> {
    return this.firestoreService.readModel<PersonModel>(PersonCollection, personKey);
  }

  /**
   * Update the currentUser and the corresponding person with the changed profile data.
   * The method does two updates (person and user), saves two comments, and shows one confirmation toast.
   * @param person the PersonModel corresponding to the currentUser.
   * @param user the UserModel corresponding to the currentUser.
   * @returns a Promise of the key of the updated person or undefined if the operation failed.
   */
  public async update(person: PersonModel, user: UserModel): Promise<string | undefined> {
    let uid: string | undefined = undefined;
    if (person && user) {
      person.index = getPersonIndex(person);
      uid = await this.firestoreService.updateModel<PersonModel>(PersonCollection, person, false, undefined, undefined, user);
      await this.firestoreService.updateModel<UserModel>(UserCollection, user, false,
        this.i18n.update_conf(), this.i18n.update_error(), user);
    }
    return uid;
  }

  /** Profile can not be deleted. */

  public listAddresses(person: PersonModel): Observable<AddressModel[]> {
    const collection = `${PersonCollection}/${person.bkey}/${AddressCollection}`;
    return this.firestoreService.searchData<AddressModel>(collection, getSystemQuery(this.env.tenantId), 'name', 'asc');
  }
}
