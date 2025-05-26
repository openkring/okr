import { inject, Injectable } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { collection, query } from 'firebase/firestore';
import { collectionData } from 'rxfire/firestore';
import { map, Observable, of } from 'rxjs';

import { AddressService } from '@bk2/address/data-access';
import { saveComment } from '@bk2/comment/util';
import { ENV, FIRESTORE } from '@bk2/shared/config';
import { AddressCollection, AddressModel, GenderType, MembershipCollection, ModelType, PersonCollection, PersonModel, UserModel } from '@bk2/shared/models';

import { convertFormToNewPerson, convertNewPersonFormToEmailAddress, convertNewPersonFormToMembership, convertNewPersonFormToPhoneAddress, convertNewPersonFormToPostalAddress, convertNewPersonFormToWebAddress, PersonNewFormModel } from '@bk2/person/util';
import { addIndexElement, createModel, findByKey, getSystemQuery, searchData, updateModel } from '@bk2/shared/util';

@Injectable({
  providedIn: 'root'
})
export class PersonService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);
  private readonly modalController = inject(ModalController);
  private readonly addressService = inject(AddressService);

  private readonly tenantId = this.env.owner.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  public async create(person: PersonModel, currentUser?: UserModel): Promise<string> {
    person.index = this.getSearchIndex(person);
    const _key = await createModel(this.firestore, PersonCollection, person, this.tenantId, '@subject.person.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, currentUser, PersonCollection, _key, '@comment.operation.initial.conf');
    return _key;    
  }
  
  /**
   * Returns the person with the given unique key.
   * @param key the unique key of the person 
   * @returns an Observable of the person or undefined if not found
   */
  public read(key: string): Observable<PersonModel | undefined> {
    return findByKey<PersonModel>(this.list(), key);    
  }

  /**
   * Finds the first person that matches a given bexioId.
   * To avoid caching issues, we query on the locally cached list (from list()) and do not query the server.
   * @param bexioId the id of the person within Bexio
   * @returns an Observable of the matching person or undefined
   */
  public readPersonByBexioId(bexioId: string): Observable<PersonModel | undefined> {
    if (!bexioId || bexioId.length === 0) return of(undefined);
    return this.list().pipe(
      map((persons: PersonModel[]) => {
        return persons.find((person: PersonModel) => person.bexioId === bexioId);
      }));
  }

  public async update(person: PersonModel, confirmMessage = '@subject.person.operation.update'): Promise<void> {
    person.index = this.getSearchIndex(person);
    await updateModel(this.firestore, PersonCollection, person, confirmMessage, this.toastController);
  }

  public async delete(person: PersonModel): Promise<void> {
    person.isArchived = true;
    await this.update(person, `@subject.person.operation.delete`);
  }

  /*-------------------------- LIST / QUERY  --------------------------------*/
  public list(orderBy = 'lastName', sortOrder = 'asc'): Observable<PersonModel[]> {
    return searchData<PersonModel>(this.firestore, PersonCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- add modal --------------------------------*/
  public async add(currentUser?: UserModel): Promise<void> {
    const _modal = await this.modalController.create({
      component: PersonNewModalComponent
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      const _vm = data as PersonNewFormModel;
      const _personKey = await this.create(convertFormToNewPerson(_vm, this.tenantId), currentUser);
      const _avatarKey = ModelType.Person + '.' + _personKey;
      if ((_vm.email ?? '').length > 0) {
        this.saveAddress(convertNewPersonFormToEmailAddress(_vm, this.tenantId), _avatarKey, currentUser);
      }
      if ((_vm.phone ?? '').length > 0) {
        this.saveAddress(convertNewPersonFormToPhoneAddress(_vm, this.tenantId), _avatarKey, currentUser);
      }
      if ((_vm.web ?? '').length > 0) {
        this.saveAddress(convertNewPersonFormToWebAddress(_vm, this.tenantId), _avatarKey, currentUser);
      }
      if ((_vm.city ?? '').length > 0) {
        this.saveAddress(convertNewPersonFormToPostalAddress(_vm, this.tenantId), _avatarKey, currentUser);
      }
      if (_vm.shouldAddMembership) {
        if ((_vm.orgKey ?? '').length > 0 && (_vm.membershipCategory ?? '').length > 0) {
          await this.saveMembership(_vm, _personKey, currentUser);
        }
      }
    }
  }

  /**
   * Optionally add a membership to a person.
   * We do not want to use MembershipService.create() in order to avoid the dependency to the membership module
   * @param vm  the form data for a new person
   * @param personKey the key of the newly created person
   */
  private async saveMembership(vm: PersonNewFormModel, personKey: string, currentUser?: UserModel): Promise<void> {
    const _membership = convertNewPersonFormToMembership(vm, personKey, this.tenantId);
    _membership.index = 'mn:' + _membership.memberName1 + ' ' + _membership.memberName2 + ' mk:' + _membership.memberKey + ' ok:' + _membership.orgKey;
    const _key = await createModel(this.firestore, MembershipCollection, _membership, this.tenantId, '@membership.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, currentUser, MembershipCollection, _key, '@comment.operation.initial.conf');  
  }

  private saveAddress(address: AddressModel, avatarKey: string, currentUser?: UserModel): void {
    address.parentKey = avatarKey;
    this.addressService.create(address, currentUser);
  }

  /*-------------------------- addresses  --------------------------------*/
  public listAddresses(person: PersonModel): Observable<AddressModel[]> {
    const _ref = query(collection(this.firestore, `${PersonCollection}/${person.bkey}/${AddressCollection}`));
    return collectionData(_ref, { idField: 'bkey' }) as Observable<AddressModel[]>;
  }

  /*-------------------------- search index --------------------------------*/

  /**
   * Create an index entry for a given person based on its values.
   * @param person 
   * @returns the index string
   */
  public getSearchIndex(person: PersonModel): string {
    let _index = '';
    _index = addIndexElement(_index, 'n', person.lastName);
    _index = addIndexElement(_index, 'c', person.fav_city);
    _index = addIndexElement(_index, 'fn', person.firstName);
    _index = addIndexElement(_index, 'g', person.gender === Number(GenderType.Female) ? 'f' : 'm');
    _index = addIndexElement(_index, 'bx', person.bexioId);
    _index = addIndexElement(_index, 'dob', person.dateOfBirth);
    return _index;
  }

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  public getSearchIndexInfo(): string {
    return 'n:name c:city fn:firstName g:m|f dob:dateOfBirth bx:bexioId';
  }
}
