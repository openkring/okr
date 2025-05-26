import { Injectable, computed, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ToastController } from '@ionic/angular/standalone';
import { collection, query } from 'firebase/firestore';
import { collectionData } from 'rxfire/firestore';

import { AddressCollection, AddressModel, PersonCollection, PersonModel, UserCollection, UserModel } from '@bk2/shared/models';
import { FIRESTORE } from '@bk2/shared/config';
import { confirmAction } from '@bk2/shared/i18n';

import { AppStore } from '@bk2/auth/feature';
import { readModel, updateModel } from '@bk2/shared/util';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private readonly appStore = inject(AppStore);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);

  private readonly toastLength = computed(() => this.appStore.toastLength());

  /** a profile can not be created. */

  public readPerson(personKey: string): Observable<PersonModel | undefined> {
    return readModel<PersonModel>(this.firestore, PersonCollection, personKey);
  }

  /**
   * Update the currentUser's profile data in the database with new values.
   * @param person the PersonModel corresponding to the currentUser.
   * @param vm the ProfileFormModel with the new values. It contains data of the currentUser and the person corresponding to it.
   */
  public async update(person: PersonModel, user: UserModel): Promise<void> {
    await updateModel(this.firestore, PersonCollection, person);
    await updateModel(this.firestore, UserCollection, user);
    await confirmAction('@profile.operation.update.conf', true, this.toastController, this.toastLength());
  }

  /** Profile can not be deleted. */

  public listAddresses(person: PersonModel): Observable<AddressModel[]> {
    const _ref = query(collection(this.firestore, `${PersonCollection}/${person.bkey}/${AddressCollection}`));
    return collectionData(_ref, { idField: 'bkey' }) as Observable<AddressModel[]>;
  }
}
