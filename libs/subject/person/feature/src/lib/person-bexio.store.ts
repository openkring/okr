import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { I18nService } from '@okr/shared-i18n';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { firstValueFrom } from 'rxjs';

import { isFirestoreInitializedCheck } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { AddressCollection, AddressModel, MembershipCollection, MembershipModel, OrgCollection, OrgModel, PersonCollection, PersonModel } from '@okr/shared-models';
import { getCatAbbreviation, getFullName, getSystemQuery, isMembership, isOrg, isPerson } from '@okr/shared-util-core';
import { ModalController, ToastController } from '@ionic/angular';
import { showToast } from '@okr/shared-util-angular';
import { PersonBexioContactModal } from '@okr/subject-person-ui';
import { BexioIndex, PERSON_I18N_KEYS } from '@okr/subject-person-util';
import { ORG_EDIT_MODAL } from '@okr/subject-org-ui';
import { createFavoriteAddress } from '@okr/subject-address-util';
import { PersonService } from '@okr/subject-person-data-access';
import { PersonEditModal } from './person-edit.modal';
import { OrgService } from '@okr/subject-org-data-access';
import { MembershipService } from '@okr/relationship-membership-data-access';
import { MembershipEditModal } from '@okr/relationship-membership-feature';

interface BexioContact {
  id: number;
  name_1: string;          // last name or company name
  name_2: string | null;   // first name (null for companies)
  street_name: string,
  house_number: string,
  postcode: string,
  city: string,
  mail: string,
  phone: string,           // landline (or mobile fallback)
  contact_type_id: number; // 1=company, 2=person
}

export type PersonBexioState = {
  index: BexioIndex[];
  indexError: string; // '' = no error; otherwise the message to show next to the index
  isLoading: boolean;
};

const initialState: PersonBexioState = {
  index: [],
  indexError: '',
  isLoading: false,
};

export const PersonBexioStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    i18nService: inject(I18nService),
    personService: inject(PersonService),
    orgService: inject(OrgService),
    membershipService: inject(MembershipService),
    orgEditModal: inject(ORG_EDIT_MODAL, { optional: true }),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(PERSON_I18N_KEYS),
  })),
  withComputed(state => ({
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId())
  })),
  withMethods(store => ({
    async buildIndex(): Promise<void> {
      if (!isFirestoreInitializedCheck()) return;
      patchState(store, { isLoading: true, index: [], indexError: '' });

      // 1. Load persons and orgs from AppStore (already in memory)
      const persons = store.appStore.allPersons();
      const orgs = store.appStore.allOrgs();

      // 2. Load memberships and addresses with one-shot getDataOnce reads (NOT firstValueFrom(searchData)).
      //    searchData returns a real-time onSnapshot stream: its first emission can be an empty/partial
      //    cache snapshot (fromCache) before the server snapshot arrives — always so on Safari/Firefox,
      //    which use memoryLocalCache and are therefore cold on every reload. firstValueFrom would grab
      //    that partial snapshot, leaving addresses empty -> every row flagged as an address mismatch.
      //    getDataOnce returns a consistent server snapshot when online, so the index is built once, correctly.

      // 2a. Load memberships for the default org (orgKey === tenantId)
      const allMemberships = await store.firestoreService.getDataOnce<MembershipModel>(MembershipCollection, getSystemQuery(store.tenantId()), 'none');
      const memberships = allMemberships.filter(m => m.orgKey === store.tenantId()); // only members of defaultOrg

      // 2b. Load favorite postal addresses (street/number/zip/city are no longer cached on person/org,
      //     they live in the separate address collection). Map them by parentKey (person.{okey} / org.{okey}).
      const allAddresses = await store.firestoreService.getDataOnce<AddressModel>(AddressCollection, getSystemQuery(store.tenantId()), 'none');
      const favPostalByParent = new Map<string, AddressModel>();
      // favEmail/favPhone were stripped from persons/orgs (spec 1.19 Phase 4) —
      // resolve the favorites from the already-loaded addresses instead.
      const favEmailByParent = new Map<string, string>();
      const favPhoneByParent = new Map<string, string>();
      for (const address of allAddresses) {
        if (!address.isFavorite) continue;
        if (address.addressChannel === 'postal') favPostalByParent.set(address.parentKey, address);
        if (address.addressChannel === 'email') favEmailByParent.set(address.parentKey, address.email ?? '');
        if (address.addressChannel === 'phone') favPhoneByParent.set(address.parentKey, address.phone ?? '');
      }

      const index: BexioIndex[] = [];

      // 3. Build index from persons
      for (const person of persons) {
        const membership = memberships.find(m => m.memberKey === person.okey);
        const postal = favPostalByParent.get(`person.${person.okey}`);
        index.push({
          key: getFullName(person.firstName ?? '', person.lastName ?? '').trim().toLowerCase(),
          okey: person.okey ?? '',
          name1: person.firstName ?? '',
          name2: person.lastName ?? '',
          type: 'person',
          bexioId: person.bexioId,
          streetName: postal?.streetName ?? '',
          streetNumber: postal?.streetNumber ?? '',
          zipCode: postal?.zipCode ?? person.favZipCode,
          city: postal?.city ?? '',
          email: favEmailByParent.get(`person.${person.okey}`) ?? '',
          phone: favPhoneByParent.get(`person.${person.okey}`) ?? '',

          mkey: membership?.okey ?? '',
          mname: membership ? getFullName(membership.memberName1, membership.memberName2) : '',
          memberModelType: membership?.memberModelType ?? '',
          mbexioId: membership?.memberBexioId ?? '',
          dateOfExit: membership?.dateOfExit ?? '',
          mcat: this.getCategoryAbbreviation(membership?.category ?? ''),

          bx_id: '',
          bx_name1: '',
          bx_name2: '',
          bx_type: 'person',
          bx_streetName: '',
          bx_streetNumber: '',
          bx_zipCode: '',
          bx_city: '',
          bx_email: '',
          bx_phone: ''
        });
      }

      // 4. Add orgs to index
      let i = 0;
      for (const org of orgs) {
        const membership = memberships.find(m => m.memberKey === org.okey);
        const postal = favPostalByParent.get(`org.${org.okey}`);
        index.push({
          key: org.name.toLowerCase(),
          okey: org.okey ?? '',
          name1: '',
          name2: org.name,
          type: 'org',
          bexioId: org.bexioId,
          streetName: postal?.streetName ?? '',
          streetNumber: postal?.streetNumber ?? '',
          zipCode: postal?.zipCode ?? org.favZipCode,
          city: postal?.city ?? '',
          email: favEmailByParent.get(`org.${org.okey}`) ?? '',
          phone: favPhoneByParent.get(`org.${org.okey}`) ?? '',

          mkey: membership?.okey ?? '',
          mname: membership ? getFullName(membership.memberName1, membership.memberName2) : '',
          memberModelType: membership?.memberModelType ?? '',
          mbexioId: membership?.memberBexioId ?? '',
          dateOfExit: '',  // not needed for orgs
          mcat: this.getCategoryAbbreviation(membership?.category ?? ''),

          bx_id: '',
          bx_name1: '',
          bx_name2: '',
          bx_type: 'org',
          bx_streetName: '',
          bx_streetNumber: '',
          bx_zipCode: '',
          bx_city: '',
          bx_email: '',
          bx_phone: ''
        });
        i++;
      }

      // 5. Sort by name2
      index.sort((a, b) => a.name2.localeCompare(b.name2));

      // 5b. Reconcile bbexioid (person/org.bexioId) <-> mbexioid (membership.memberBexioId)
      const currentUser = store.currentUser();
      for (const item of index) {
        if (!item.okey || !item.mkey) continue; // only reconcile if both BK record and membership exist
        if (item.bexioId && !item.mbexioId) {
          // person/org has bexioId set, but membership.memberBexioId is missing -> update membership
          const membership = memberships.find(m => m.okey === item.mkey);
          if (membership) {
            membership.memberBexioId = item.bexioId;
            await store.firestoreService.updateModel<MembershipModel>(MembershipCollection, membership, false, undefined, undefined, currentUser);
            item.mbexioId = item.bexioId;
          }
        } else if (!item.bexioId && item.mbexioId) {
          // membership has memberBexioId set, but person/org.bexioId is missing -> update person/org
          if (item.type === 'person') {
            const person = persons.find(p => p.okey === item.okey);
            if (person) {
              person.bexioId = item.mbexioId;
              await store.firestoreService.updateModel<PersonModel>(PersonCollection, person, false, undefined, undefined, currentUser);
              item.bexioId = item.mbexioId;
            }
          } else {
            const org = orgs.find(o => o.okey === item.okey);
            if (org) {
              org.bexioId = item.mbexioId;
              await store.firestoreService.updateModel<OrgModel>(OrgCollection, org, false, undefined, undefined, currentUser);
              item.bexioId = item.mbexioId;
            }
          }
        }
      }
      // 5b wrote persons/orgs one at a time inside the loop above (bexioId reconciliation) —
      // reload the AppStore reference data ONCE here, after the whole reconcile pass, not per record.
      store.appStore.reloadPersons();
      store.appStore.reloadOrgs();
      // now we have a list of persons and orgs with bexioId that matches with the memberships
      console.log('now we have ' + index.length + ' persons and orgs with bexioId that matches with the memberships.');

      // 6. Fetch Bexio contacts via Cloud Function
      try {
        const functions = getFunctions(getApp(), 'europe-west6');
        if (store.appStore.env.useEmulators) {
          connectFunctionsEmulator(functions, 'localhost', 5001);
        }
        const getBexioContacts = httpsCallable<void, BexioContact[]>(functions, 'getBexioContacts');
        const result = await getBexioContacts();
        const contacts = result.data;

        // log entries that have a bexioId set, to verify reconciliation worked
        const withId = index.filter(i => !!i.bexioId);

        // 7. Join by key: primary = bexioId match, fallback = name key (only when bexioId missing)
        for (const contact of contacts) {
          const bxname1 = contact.name_2 ?? ''; // first name (null for companies)
          const bxname2 = contact.name_1;        // last name or company name
          const bxKey = getFullName(bxname1, bxname2).trim().toLowerCase();
          const contactIdStr = String(contact.id);
          const item = index.find(i => !!i.bexioId && String(i.bexioId) === contactIdStr)
            ?? index.find(i => !i.bexioId && i.key === bxKey);
          if (!item) {
            console.log(`No match for Bexio contact ${contactIdStr} "${bxname1} ${bxname2}" (key="${bxKey}")`);
          }
          if (item) {
            item.bx_id = contact.id + '';
            item.bx_name1 = bxname1;
            item.bx_name2 = bxname2;
            item.bx_type = contact.contact_type_id === 1 ? 'org' : 'person';
            item.bx_streetName = contact.street_name;
            item.bx_streetNumber = contact.house_number;
            item.bx_zipCode = contact.postcode;
            item.bx_city = contact.city;
            item.bx_email = contact.mail;
            item.bx_phone = contact.phone;
          } else {
            // Before adding as orphan, check if a name-key entry already exists (unmatched due to bexioId mismatch)
            // If so, enrich it rather than creating a duplicate key
            const nameKeyEntry = index.find(i => i.key === bxKey);
            if (nameKeyEntry) {
              nameKeyEntry.bx_id = contact.id + '';
              nameKeyEntry.bx_name1 = bxname1;
              nameKeyEntry.bx_name2 = bxname2;
              nameKeyEntry.bx_type = contact.contact_type_id === 1 ? 'org' : 'person';
              nameKeyEntry.bx_streetName = contact.street_name;
              nameKeyEntry.bx_streetNumber = contact.house_number;
              nameKeyEntry.bx_zipCode = contact.postcode;
              nameKeyEntry.bx_city = contact.city;
              nameKeyEntry.bx_email = contact.mail;
              nameKeyEntry.bx_phone = contact.phone;
              console.log(`Enriched by name key (bexioId mismatch): ${bxKey}`);
            } else {
              index.push({
                key: bxKey,
                okey: '',
                name1: '',
                name2: '',
                type: contact.contact_type_id === 1 ? 'org' : 'person',
                bexioId: '',
                streetName: '',
                streetNumber: '',
                zipCode: '',
                city: '',
                email: '',
                phone: '',

                mkey: '',
                mname: '',
                memberModelType: '',
                mbexioId: '',
                dateOfExit: '',
                mcat: '',

                bx_id: contact.id + '',
                bx_name1: bxname1,
                bx_name2: bxname2,
                bx_type: contact.contact_type_id === 1 ? 'org' : 'person',
                bx_streetName: contact.street_name,
                bx_streetNumber: contact.house_number,
                bx_zipCode: contact.postcode,
                bx_city: contact.city,
                bx_email: contact.mail,
                bx_phone: contact.phone,
              });
            }
          }
        }

        // 8. Sort again by name2
        index.sort((a, b) => a.name2.localeCompare(b.name2));
        console.log(`Index built: ${index.length} entries`);
      } catch (e) {
        // A failing Bexio fetch must not look like an empty result: the index still
        // renders (BK data is valid), but the bx_* columns stay empty, so say why.
        const code = (e as { code?: string }).code ?? '';
        const message = code === 'functions/failed-precondition'
          ? store.i18n.bexio_index_error_credentials()
          : store.i18n.bexio_index_error_fetch();
        console.error(`getBexioContacts Cloud Function failed: ${e}`);
        patchState(store, { indexError: message });
        showToast(store.toastController, message);
      }

      patchState(store, { index, isLoading: false });
    },

    async addToBexio(item: BexioIndex): Promise<void> {
      const functions = getFunctions(getApp(), 'europe-west6');
      if (store.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      const createBexioContactFn = httpsCallable<
        { name_1: string; name_2: string | null; street_name: string, house_number: string, postcode: string, city: string, mail: string, contact_type_id: number },
        { id: string }
      >(functions, 'createBexioContact');

      let bxid: string;
      try {
        const result = await createBexioContactFn({
          name_1: item.name2,                        // last/company name
          name_2: item.name1 || null,                // first name (null for orgs)
          street_name: item.streetName,
          house_number: item.streetNumber,
          postcode: item.zipCode,
          city: item.city,
          mail: item.email,
          contact_type_id: item.type === 'org' ? 1 : 2,
        });
        bxid = String(result.data.id);
      } catch (e) {
        console.error('addToBexio: createBexioContact failed', e);
        throw e;
      }

      // write the bexioId back into the person or org (use a copy — signal state is immutable)
      const currentUser = store.currentUser();
      if (item.type === 'person') {
        const person = store.appStore.getPerson(item.okey);
        if (person) {
          await store.firestoreService.updateModel<PersonModel>(PersonCollection, { ...person, bexioId: bxid }, false, undefined, undefined, currentUser);
        } else {
          console.error('addToBexio: person not found for okey', item.okey);
        }
      } else {
        const org = store.appStore.getOrg(item.okey);
        if (org) {
          await store.firestoreService.updateModel<OrgModel>(OrgCollection, { ...org, bexioId: bxid }, false, undefined, undefined, currentUser);
        } else {
          console.error('addToBexio: org not found for okey', item.okey);
        }
      }

      // also update the membership.memberBexioId if a membership exists
      if (item.mkey) {
        const allMemberships = await store.firestoreService.getDataOnce<MembershipModel>(MembershipCollection, getSystemQuery(store.tenantId()), 'memberName2', 'asc');
        const membership = allMemberships.find(m => m.okey === item.mkey);
        if (membership) {
          await store.firestoreService.updateModel<MembershipModel>(MembershipCollection, { ...membership, memberBexioId: bxid }, false, undefined, undefined, currentUser);
        }
      }

      patchState(store, {
        index: store.index().map(i => i.key === item.key
          ? { ...i,
              bx_id: bxid,
              bx_name1: item.name1,
              bx_name2: item.name2,
              bx_type: item.type,
              bx_streetName: item.streetName,
              bx_streetNumber: item.streetNumber,
              bx_zipCode: item.zipCode,
              bx_city: item.city,
              bx_email: item.email,
              bexioId: bxid,
              mbexioId: bxid,
            }
          : i
        ),
      });
      if (item.type === 'person') {
        store.appStore.reloadPersons();
      } else {
        store.appStore.reloadOrgs();
      }
    },

    getCategoryAbbreviation(mcat: string): string {
      const cat = store.appStore.getCategory('mcat_' + store.tenantId());
      return getCatAbbreviation(cat, mcat);
    },

    async updateInBexio(item: BexioIndex): Promise<void> {
      const functions = getFunctions(getApp(), 'europe-west6');
      if (store.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      const updateBexioContact = httpsCallable<
        { id: string; name_1: string; name_2: string | null; street_name: string, house_number: string, postcode: string, city: string, mail: string, contact_type_id: number },
        { id: string }
      >(functions, 'updateBexioContact');

      await updateBexioContact({
        id: item.bx_id,
        name_1: item.name2,
        name_2: item.name1 || null,
        street_name: item.streetName,
        house_number: item.streetNumber,
        postcode: item.zipCode,
        city: item.city,
        mail: item.email,
        contact_type_id: item.type === 'org' ? 1 : 2,
      });

      patchState(store, {
        index: store.index().map(i => i.key === item.key
          ? {
              ...i,
              bx_name1: item.name1,
              bx_name2: item.name2,
              bx_type: item.type,
              bx_streetName: item.streetName,
              bx_streetNumber: item.streetNumber,
              bx_zipCode: item.zipCode,
              bx_city: item.city,
              bx_email: item.email,
            }
          : i
        ),
      });
    },

    async addToBk(item: BexioIndex): Promise<void> {
      const currentUser = store.currentUser();
      let okey: string | undefined;

      if (item.type === 'person') {
        const person = new PersonModel(store.tenantId());
        person.firstName = item.bx_name1;
        person.lastName = item.bx_name2;
        person.bexioId = item.bx_id;
        okey = await store.firestoreService.createModel<PersonModel>(PersonCollection, person, undefined, undefined, currentUser);
        const avatarKey = 'person.' + okey;
        if (item.bx_email) {
          await this.saveAddress(createFavoriteAddress('email', 'home', item.bx_email, store.tenantId()), avatarKey);
        }
        await this.saveAddress(createFavoriteAddress('postal', 'home', item.bx_streetName, store.tenantId(), item.bx_streetNumber, '', item.bx_zipCode, item.bx_city, 'CH'), avatarKey);

      } else {
        const org = new OrgModel(store.tenantId());
        org.name = item.bx_name2;
        org.bexioId = item.bx_id;
        okey = await store.firestoreService.createModel<OrgModel>(OrgCollection, org, undefined, undefined, currentUser);
        const avatarKey = 'org.' + okey;
        if (item.bx_email) {
          await this.saveAddress(createFavoriteAddress('email', 'work', item.bx_email, store.tenantId()), avatarKey);
        }
        await this.saveAddress(createFavoriteAddress('postal', 'work', item.bx_streetName, store.tenantId(), item.bx_streetNumber, '', item.bx_zipCode, item.bx_city, 'CH'), avatarKey);
      }

      if (okey) {
        patchState(store, {
          index: store.index().map(i => i.key === item.key
            ? { ...i, 
              okey, 
              name1: item.bx_name1, 
              name2: item.bx_name2,
              type: item.bx_type,
              bexioId: item.bx_id, 
              streetName: item.bx_streetName,
              streetNumber: item.bx_streetNumber,
              zipCode: item.bx_zipCode,
              city: item.bx_city,
              email: item.bx_email,
              //mkey,
              mbexioId: item.bx_id
            }
            : i
          ),
        });
        if (item.type === 'person') {
          store.appStore.reloadPersons();
        } else {
          store.appStore.reloadOrgs();
        }
        store.appStore.watchDirectoryEntry(`${item.type}.${okey}`);
      }
    },


    /**
     * Update an existing BK contact (person/org) with the address data from Bexio.
     * The favorite postal and email addresses are updated (or created if missing);
     * the cached fav* fields on the person/org are kept in sync by the address Cloud Function trigger.
     */
    async updateInBk(item: BexioIndex): Promise<void> {
      if (!item.okey) return;
      const currentUser = store.currentUser();
      const avatarKey = `${item.type}.${item.okey}`;
      const usage = item.type === 'org' ? 'work' : 'home';

      // load this contact's addresses
      const query = getSystemQuery(store.tenantId());
      query.push({ key: 'parentKey', operator: '==', value: avatarKey });
      const addresses = await store.firestoreService.getDataOnce<AddressModel>(AddressCollection, query, 'none');

      // postal: update the favorite postal address, or create one if none exists yet
      const postal = addresses.find(a => a.addressChannel === 'postal' && a.isFavorite);
      if (postal) {
        await store.firestoreService.updateModel<AddressModel>(AddressCollection, {
          ...postal,
          streetName: item.bx_streetName,
          streetNumber: item.bx_streetNumber,
          zipCode: item.bx_zipCode,
          city: item.bx_city,
        }, false, undefined, undefined, currentUser);
      } else if (item.bx_streetName || item.bx_zipCode || item.bx_city) {
        await this.saveAddress(createFavoriteAddress('postal', usage, item.bx_streetName, store.tenantId(), item.bx_streetNumber, '', item.bx_zipCode, item.bx_city, 'CH'), avatarKey);
      }

      // email: update the favorite email address, or create one if none exists yet
      if (item.bx_email) {
        const email = addresses.find(a => a.addressChannel === 'email' && a.isFavorite);
        if (email) {
          await store.firestoreService.updateModel<AddressModel>(AddressCollection, { ...email, email: item.bx_email }, false, undefined, undefined, currentUser);
        } else {
          await this.saveAddress(createFavoriteAddress('email', usage, item.bx_email, store.tenantId()), avatarKey);
        }
      }

      // reflect the new BK values in the in-memory index
      patchState(store, {
        index: store.index().map(i => i.key === item.key
          ? { ...i,
              streetName: item.bx_streetName,
              streetNumber: item.bx_streetNumber,
              zipCode: item.bx_zipCode,
              city: item.bx_city,
              email: item.bx_email,
            }
          : i
        ),
      });
      store.appStore.watchDirectoryEntry(avatarKey);
    },

    async saveAddress(address: AddressModel, avatarKey: string): Promise<string | undefined> {
      address.parentKey = avatarKey;
      return await store.firestoreService.createModel<AddressModel>(AddressCollection, address, undefined, undefined, store.currentUser());
    },

    compareAddressData(item: BexioIndex): boolean {
      const norm = (v: string | null | undefined) => (v ?? '').trim();
      return norm(item.name1) === norm(item.bx_name1)
        && norm(item.name2) === norm(item.bx_name2)
        && norm(item.streetName) === norm(item.bx_streetName)
        && norm(item.streetNumber) === norm(item.bx_streetNumber)
        && norm(item.zipCode) === norm(item.bx_zipCode)
        && norm(item.city) === norm(item.bx_city)
        && norm(item.email) === norm(item.bx_email);
    },

    async edit(bexioIndex: BexioIndex): Promise<void> {
      const modal = await store.modalController.create({
        component: PersonBexioContactModal,
        cssClass: 'wide-modal',
        componentProps: {
          bexioIndex,
          currentUser: store.currentUser(),
          tenantId: store.tenantId(),
        }
      });
      await modal.present();
      const { role } = await modal.onWillDismiss();
      if (role === 'create') {
        await this.addToBexio(bexioIndex);
      } else if (role === 'update') {
        await this.updateInBexio(bexioIndex);
      } else if (role === 'updateBk') {
        await this.updateInBk(bexioIndex);
      } else if (role === 'download') {
        await this.addToBk(bexioIndex);
      } else if (role === 'editPerson') {
        await this.editPerson(bexioIndex);
      } else if (role === 'editOrg') {
        await this.editOrg(bexioIndex);
      } else if (role === 'editMembership') {
        await this.editMembership(bexioIndex);
      }
    },

    /** Open the standard person edit modal for the BK person behind this index entry. */
    async editPerson(item: BexioIndex): Promise<void> {
      const person = store.appStore.getPerson(item.okey);
      if (!person) return;
      const modal = await store.modalController.create({
        component: PersonEditModal,
        componentProps: {
          person,
          currentUser: store.currentUser(),
          tags: store.appStore.getTags('person'),
          tenantId: store.tenantId(),
          genders: store.appStore.getCategory('gender'),
          readOnly: false,
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && isPerson(data, store.tenantId())) {
        await store.personService.update(data, store.currentUser());
      }
    },

    /** Open the standard org edit modal for the BK org behind this index entry. */
    async editOrg(item: BexioIndex): Promise<void> {
      const org = store.appStore.getOrg(item.okey);
      if (!org) return;
      if (!store.orgEditModal) { console.warn('PersonBexioStore.editOrg: ORG_EDIT_MODAL is not provided by this app'); return; }
      const modal = await store.modalController.create({
        component: await store.orgEditModal(),
        componentProps: {
          org,
          currentUser: store.currentUser(),
          resource: store.appStore.defaultResource(),
          tags: store.appStore.getTags('org'),
          tenantId: store.tenantId(),
          types: store.appStore.getCategory('org_type'),
          readOnly: false,
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && isOrg(data, store.tenantId())) {
        await store.orgService.update(data, store.currentUser());
      }
    },

    /** Open the standard membership edit modal for the membership behind this index entry. */
    async editMembership(item: BexioIndex): Promise<void> {
      if (!item.mkey) return;
      const membership = await firstValueFrom(store.firestoreService.readModel<MembershipModel>(MembershipCollection, item.mkey));
      if (!membership) return;
      const modal = await store.modalController.create({
        component: MembershipEditModal,
        cssClass: 'auto-height-modal',
        componentProps: {
          membership: { ...membership },
          currentUser: store.currentUser(),
          tags: store.appStore.getTags('membership'),
          priv: store.appStore.privacySettings(),
          mcat: store.appStore.getCategory('mcat_' + store.tenantId()),
          isNew: false,
          readOnly: false,
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && isMembership(data, store.tenantId())) {
        await store.membershipService.update(data, store.currentUser());
      }
    }
  }))
);

