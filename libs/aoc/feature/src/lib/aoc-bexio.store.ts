import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { firstValueFrom } from 'rxjs';

import { isFirestoreInitializedCheck } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressCollection, AddressModel, MembershipCollection, MembershipModel, OrgCollection, OrgModel, PersonCollection, PersonModel } from '@bk2/shared-models';
import { getFullName, getSystemQuery } from '@bk2/shared-util-core';
import { ModalController } from '@ionic/angular/standalone';
import { AocBexioContactEditModal } from 'libs/aoc/feature/src/lib/aoc-bexio-contact-edit.modal';
import { createFavoriteAddress } from '@bk2/subject-address-util';

export interface BexioIndex {
  // person or org
  key: string;      // getFullName(name1, name2).trim().toLowerCase(), the trim is important to remove the leading bank in orgs
  bkey: string;     // BK document key (person.bkey or org.bkey)
  name1: string;   // first name (person) or '' (org)
  name2: string;   // last name (person) or company name (org)
  type: 'person' | 'org'; 
  bexioId: string; // BK-stored bexio ID (from membership.memberBexioId)
  streetName: string,
  streetNumber: string,
  zipCode: string,
  city: string,
  email: string, 

  // membership
  mkey: string;     // membership bkey
  mbexioId: string; // membership.memberBexioId
  dateOfExit: string;   // exit date, this is needed to finde the current members

  // bexio
  bx_id: string;     // Bexio contact ID
  bx_name1: string;  // Bexio first name (contact.name_2)
  bx_name2: string;  // Bexio last/company name (contact.name_1)
  bx_type: 'person' | 'org';
  bx_streetName: string;
  bx_streetNumber: string;
  bx_zipCode: string;
  bx_city: string;
  bx_email: string;
}

interface BexioContact {
  id: number;
  name_1: string;          // last name or company name
  name_2: string | null;   // first name (null for companies)
  street_name: string,
  house_number: string,
  postcode: string,
  city: string,
  mail: string,
  contact_type_id: number; // 1=company, 2=person
}

export type AocBexioState = {
  index: BexioIndex[];
  isLoading: boolean;
};

const initialState: AocBexioState = {
  index: [],
  isLoading: false,
};

export const AocBexioStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController)
  })),
  withComputed(state => ({
    currentUser: computed(() => state.appStore.currentUser()),
  })),
  withMethods(store => ({
    async buildIndex(): Promise<void> {
      if (!isFirestoreInitializedCheck()) return;
      patchState(store, { isLoading: true, index: [] });

      const tenantId = store.appStore.env.tenantId;

      // 1. Load persons and orgs from AppStore (already in memory)
      const persons = store.appStore.allPersons();
      const orgs = store.appStore.allOrgs();
      console.log(`Loaded ${persons.length} persons, ${orgs.length} orgs`);

      // 2. Load memberships for the default org (orgKey === tenantId)
      const allMemberships = await firstValueFrom(
        store.firestoreService.searchData<MembershipModel>(MembershipCollection, getSystemQuery(tenantId), 'memberName2', 'asc')
      );
      console.log('all memberships: ' + allMemberships.length);
      const memberships = allMemberships.filter(m => m.orgKey === tenantId); // only members of defaultOrg
      console.log(`Loaded ${memberships.length} memberships for default org`);

      const index: BexioIndex[] = [];

      // 3. Build index from persons
      for (const person of persons) {
        const membership = memberships.find(m => m.memberKey === person.bkey);
        index.push({
          key: getFullName(person.firstName ?? '', person.lastName ?? '').trim().toLowerCase(),
          bkey: person.bkey ?? '',
          name1: person.firstName ?? '',
          name2: person.lastName ?? '',
          type: 'person',
          bexioId: person.bexioId,
          streetName: person.favStreetName,
          streetNumber: person.favStreetNumber,
          zipCode: person.favZipCode,
          city: person.favCity,
          email: person.favEmail,

          mkey: membership?.bkey ?? '',
          mbexioId: membership?.memberBexioId ?? '',
          dateOfExit: membership?.dateOfExit ?? '',

          bx_id: '',
          bx_name1: '',
          bx_name2: '',
          bx_type: 'person',
          bx_streetName: '',
          bx_streetNumber: '',
          bx_zipCode: '',
          bx_city: '',
          bx_email: ''
        });
      }
      console.log(index.length + ' person-members of defaultOrg in index.');

      // 4. Add orgs to index
      let i = 0;
      for (const org of orgs) {
        const membership = memberships.find(m => m.memberKey === org.bkey);
        index.push({
          key: org.name.toLowerCase(),
          bkey: org.bkey ?? '',
          name1: '',
          name2: org.name,
          type: 'org',
          bexioId: org.bexioId,
          streetName: org.favStreetName,
          streetNumber: org.favStreetNumber,
          zipCode: org.favZipCode,
          city: org.favCity,
          email: org.favEmail,
          
          mkey: membership?.bkey ?? '',
          mbexioId: membership?.memberBexioId ?? '',
          dateOfExit: '',  // not needed for orgs

          bx_id: '',
          bx_name1: '',
          bx_name2: '',
          bx_type: 'org',
          bx_streetName: '',
          bx_streetNumber: '',
          bx_zipCode: '',
          bx_city: '',
          bx_email: ''
        });
        i++;
      }
      console.log('added ' + i + ' org-members of defaultOrg into index; total is now ' + index.length);

      // 5. Sort by name2
      index.sort((a, b) => a.name2.localeCompare(b.name2));

      // 5b. Reconcile bbexioid (person/org.bexioId) <-> mbexioid (membership.memberBexioId)
      const currentUser = store.currentUser();
      for (const item of index) {
        if (!item.bkey || !item.mkey) continue; // only reconcile if both BK record and membership exist
        if (item.bexioId && !item.mbexioId) {
          // person/org has bexioId set, but membership.memberBexioId is missing -> update membership
          const membership = memberships.find(m => m.bkey === item.mkey);
          if (membership) {
            membership.memberBexioId = item.bexioId;
            await store.firestoreService.updateModel<MembershipModel>(MembershipCollection, membership, false, undefined, currentUser);
            item.mbexioId = item.bexioId;
            console.log(`Updated membership ${item.mkey}: memberBexioId = ${item.bexioId}`);
          }
        } else if (!item.bexioId && item.mbexioId) {
          // membership has memberBexioId set, but person/org.bexioId is missing -> update person/org
          if (item.type === 'person') {
            const person = persons.find(p => p.bkey === item.bkey);
            if (person) {
              person.bexioId = item.mbexioId;
              await store.firestoreService.updateModel<PersonModel>(PersonCollection, person, false, undefined, currentUser);
              item.bexioId = item.mbexioId;
              console.log(`Updated person ${item.bkey}: bexioId = ${item.mbexioId}`);
            }
          } else {
            const org = orgs.find(o => o.bkey === item.bkey);
            if (org) {
              org.bexioId = item.mbexioId;
              await store.firestoreService.updateModel<OrgModel>(OrgCollection, org, false, undefined, currentUser);
              item.bexioId = item.mbexioId;
              console.log(`Updated org ${item.bkey}: bexioId = ${item.mbexioId}`);
            }
          }
        }
      }
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
        console.log(`Loaded ${contacts.length} Bexio contacts`);

        // log entries that have a bexioId set, to verify reconciliation worked
        const withId = index.filter(i => !!i.bexioId);
        console.log(`Entries with bexioId: ${withId.map(i => `${i.key}=${i.bexioId}`).join(', ') || 'none'}`);

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
            item.bx_type = contact.contact_type_id === 1 ? 'org' : 'person',
            item.bx_streetName = contact.street_name,
            item.bx_streetNumber = contact.house_number,
            item.bx_zipCode = contact.postcode,
            item.bx_city = contact.city,
            item.bx_email = contact.mail
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
              console.log(`Enriched by name key (bexioId mismatch): ${bxKey}`);
            } else {
              index.push({
                key: bxKey,
                bkey: '',
                name1: '',
                name2: '',
                type: contact.contact_type_id === 1 ? 'org' : 'person',
                bexioId: '',
                streetName: '',
                streetNumber: '',
                zipCode: '',
                city: '',
                email: '',

                mkey: '',
                mbexioId: '',
                dateOfExit: '',

                bx_id: contact.id + '',
                bx_name1: bxname1,
                bx_name2: bxname2,
                bx_type: contact.contact_type_id === 1 ? 'org' : 'person',
                bx_streetName: contact.street_name,
                bx_streetNumber: contact.house_number,
                bx_zipCode: contact.postcode,
                bx_city: contact.city,
                bx_email: contact.mail,
              });
            }
          }
        }

        // 8. Sort again by name2
        index.sort((a, b) => a.name2.localeCompare(b.name2));
        console.log(`Index built: ${index.length} entries`);
      } catch (e) {
        console.log(`getBexioContacts Cloud Function failed: ${e}`);
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
        const person = store.appStore.getPerson(item.bkey);
        if (person) {
          await store.firestoreService.updateModel<PersonModel>(PersonCollection, { ...person, bexioId: bxid }, false, undefined, currentUser);
        } else {
          console.error('addToBexio: person not found for bkey', item.bkey);
        }
      } else {
        const org = store.appStore.getOrg(item.bkey);
        if (org) {
          await store.firestoreService.updateModel<OrgModel>(OrgCollection, { ...org, bexioId: bxid }, false, undefined, currentUser);
        } else {
          console.error('addToBexio: org not found for bkey', item.bkey);
        }
      }

      // also update the membership.memberBexioId if a membership exists
      if (item.mkey) {
        const tenantId = store.appStore.env.tenantId;
        const allMemberships = await firstValueFrom(
          store.firestoreService.searchData<MembershipModel>(MembershipCollection, getSystemQuery(tenantId), 'memberName2', 'asc')
        );
        const membership = allMemberships.find(m => m.bkey === item.mkey);
        if (membership) {
          await store.firestoreService.updateModel<MembershipModel>(MembershipCollection, { ...membership, memberBexioId: bxid }, false, undefined, currentUser);
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
      const tenantId = store.appStore.env.tenantId;
      const currentUser = store.currentUser();
      let bkey: string | undefined;

      if (item.type === 'person') {
        const person = new PersonModel(tenantId);
        person.firstName = item.bx_name1;
        person.lastName = item.bx_name2;
        person.favEmail = item.bx_email;
        person.favStreetName = item.bx_streetName;
        person.favStreetNumber = item.bx_streetNumber;
        person.favZipCode = item.bx_zipCode;
        person.favCity = item.bx_city;
        person.favCountryCode = 'CH';
        person.bexioId = item.bx_id;
        bkey = await store.firestoreService.createModel<PersonModel>(PersonCollection, person, undefined, currentUser);
        const avatarKey = 'person.' + bkey;
        if (person.favEmail) {
          await this.saveAddress(createFavoriteAddress('email', 'home', person.favEmail, tenantId), avatarKey);
        }
        await this.saveAddress(createFavoriteAddress('postal', 'home', person.favStreetName, tenantId, person.favStreetNumber, '', person.favZipCode, person.favCity, person.favCountryCode), avatarKey);

      } else {
        const org = new OrgModel(tenantId);
        org.name = item.bx_name2;
        org.favEmail = item.bx_email;
        org.favStreetName = item.bx_streetName;
        org.favStreetNumber = item.bx_streetNumber;
        org.favZipCode = item.bx_zipCode;
        org.favCity = item.bx_city;
        org.favCountryCode = 'CH';
        org.bexioId = item.bx_id;
        bkey = await store.firestoreService.createModel<OrgModel>(OrgCollection, org, undefined, currentUser);
        const avatarKey = 'org.' + bkey;
        if (org.favEmail) {
          await this.saveAddress(createFavoriteAddress('email', 'work', org.favEmail, tenantId), avatarKey);
        }
        await this.saveAddress(createFavoriteAddress('postal', 'work', org.favStreetName, tenantId, org.favStreetNumber, '', org.favZipCode, org.favCity, org.favCountryCode), avatarKey);
      }

      if (bkey) {
        patchState(store, {
          index: store.index().map(i => i.key === item.key
            ? { ...i, 
              bkey, 
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
      }
    },


    async saveAddress(address: AddressModel, avatarKey: string): Promise<string | undefined> {
      address.parentKey = avatarKey;
      return await store.firestoreService.createModel<AddressModel>(AddressCollection, address, undefined, store.currentUser());
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
        component: AocBexioContactEditModal,
        cssClass: 'wide-modal',
        componentProps: {
          bexioIndex,
          currentUser: store.currentUser(),
          tenantId: store.appStore.tenantId(),
        }
      });
      await modal.present();
      const { role } = await modal.onWillDismiss();
      if (role === 'create') {
        await this.addToBexio(bexioIndex);
      } else if (role === 'update') {
        await this.updateInBexio(bexioIndex);
      } else if (role === 'download') {
        await this.addToBk(bexioIndex);
      }
    }
  }))
);

