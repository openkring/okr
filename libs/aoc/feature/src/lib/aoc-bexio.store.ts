import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { I18nService } from '@bk2/shared-i18n';
import { AOC_I18N_KEYS } from '@bk2/aoc-util';
import { getApp } from 'firebase/app';
import { collection, doc, getCountFromServer, getDocs, getDoc, getFirestore, query, where, writeBatch } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { firstValueFrom } from 'rxjs';

import { isFirestoreInitializedCheck } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressCollection, AddressModel, AvatarInfo, InvoiceCollection, MembershipCollection, MembershipModel, OrgCollection, OrgModel, PersonCollection, PersonModel } from '@bk2/shared-models';
import { getCatAbbreviation, getFullName, getSystemQuery, isMembership, isOrg, isPerson } from '@bk2/shared-util-core';
import { ModalController } from '@ionic/angular/standalone';
import { AocBexioContactEditModal } from './aoc-bexio-contact-edit.modal';
import { createFavoriteAddress } from '@bk2/subject-address-util';
import { PersonService } from '@bk2/subject-person-data-access';
import { PersonEditModal } from '@bk2/subject-person-feature';
import { OrgService } from '@bk2/subject-org-data-access';
import { OrgEditModal } from '@bk2/subject-org-feature';
import { MembershipService } from '@bk2/relationship-membership-data-access';
import { MembershipEditModal } from '@bk2/relationship-membership-feature';

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
  phone: string,    // BK favPhone

  // membership
  mkey: string;     // membership bkey
  mname: string;          // membership full name (getFullName(memberName1, memberName2))
  memberModelType: string; // membership.memberModelType ('person' | 'org')
  mbexioId: string; // membership.memberBexioId
  dateOfExit: string;   // exit date, this is needed to finde the current members
  mcat: string;

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
  bx_phone: string;
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
  phone: string,           // landline (or mobile fallback)
  contact_type_id: number; // 1=company, 2=person
}

export type AocBexioState = {
  index: BexioIndex[];
  isLoading: boolean;
  invoiceCount: number;
  lastSyncedAt: string; // "YYYY-MM-DD HH:mm:ss" or ''
  receiverLinkCount: number;    // invoices updated in last linkInvoiceReceivers run, -1 = not run
  receiverPendingCount: number; // invoices still missing a receiver, -1 = not counted yet
  billCount: number;
  lastBillSyncedAt: string; // "YYYY-MM-DD HH:mm:ss" or ''
  vendorLinkedCount: number;   // bills updated in last linkBillVendors run, -1 = not run
  vendorPendingCount: number;  // bills still missing a vendor, -1 = not counted yet
  vendorUnmatched: string[];   // vendor names that could not be matched
  journalCount: number;
  lastJournalSyncedAt: string; // "YYYY-MM-DD HH:mm:ss" or ''
};

const initialState: AocBexioState = {
  index: [],
  isLoading: false,
  invoiceCount: -1,
  lastSyncedAt: '',
  receiverLinkCount: -1,
  receiverPendingCount: -1,
  billCount: -1,
  lastBillSyncedAt: '',
  vendorLinkedCount: -1,
  vendorPendingCount: -1,
  vendorUnmatched: [],
  journalCount: -1,
  lastJournalSyncedAt: '',
};

export const AocBexioStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
    personService: inject(PersonService),
    orgService: inject(OrgService),
    membershipService: inject(MembershipService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(AOC_I18N_KEYS),
  })),
  withComputed(state => ({
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId())
  })),
  withMethods(store => ({
    async buildIndex(): Promise<void> {
      if (!isFirestoreInitializedCheck()) return;
      patchState(store, { isLoading: true, index: [] });

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
      //     they live in the separate address collection). Map them by parentKey (person.{bkey} / org.{bkey}).
      const allAddresses = await store.firestoreService.getDataOnce<AddressModel>(AddressCollection, getSystemQuery(store.tenantId()), 'none');
      const favPostalByParent = new Map<string, AddressModel>();
      for (const address of allAddresses) {
        if (address.addressChannel === 'postal' && address.isFavorite) {
          favPostalByParent.set(address.parentKey, address);
        }
      }

      const index: BexioIndex[] = [];

      // 3. Build index from persons
      for (const person of persons) {
        const membership = memberships.find(m => m.memberKey === person.bkey);
        const postal = favPostalByParent.get(`person.${person.bkey}`);
        index.push({
          key: getFullName(person.firstName ?? '', person.lastName ?? '').trim().toLowerCase(),
          bkey: person.bkey ?? '',
          name1: person.firstName ?? '',
          name2: person.lastName ?? '',
          type: 'person',
          bexioId: person.bexioId,
          streetName: postal?.streetName ?? '',
          streetNumber: postal?.streetNumber ?? '',
          zipCode: postal?.zipCode ?? person.favZipCode,
          city: postal?.city ?? '',
          email: person.favEmail,
          phone: person.favPhone,

          mkey: membership?.bkey ?? '',
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
        const membership = memberships.find(m => m.memberKey === org.bkey);
        const postal = favPostalByParent.get(`org.${org.bkey}`);
        index.push({
          key: org.name.toLowerCase(),
          bkey: org.bkey ?? '',
          name1: '',
          name2: org.name,
          type: 'org',
          bexioId: org.bexioId,
          streetName: postal?.streetName ?? '',
          streetNumber: postal?.streetNumber ?? '',
          zipCode: postal?.zipCode ?? org.favZipCode,
          city: postal?.city ?? '',
          email: org.favEmail,
          phone: org.favPhone,

          mkey: membership?.bkey ?? '',
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
        if (!item.bkey || !item.mkey) continue; // only reconcile if both BK record and membership exist
        if (item.bexioId && !item.mbexioId) {
          // person/org has bexioId set, but membership.memberBexioId is missing -> update membership
          const membership = memberships.find(m => m.bkey === item.mkey);
          if (membership) {
            membership.memberBexioId = item.bexioId;
            await store.firestoreService.updateModel<MembershipModel>(MembershipCollection, membership, false, undefined, undefined, currentUser);
            item.mbexioId = item.bexioId;
          }
        } else if (!item.bexioId && item.mbexioId) {
          // membership has memberBexioId set, but person/org.bexioId is missing -> update person/org
          if (item.type === 'person') {
            const person = persons.find(p => p.bkey === item.bkey);
            if (person) {
              person.bexioId = item.mbexioId;
              await store.firestoreService.updateModel<PersonModel>(PersonCollection, person, false, undefined, undefined, currentUser);
              item.bexioId = item.mbexioId;
            }
          } else {
            const org = orgs.find(o => o.bkey === item.bkey);
            if (org) {
              org.bexioId = item.mbexioId;
              await store.firestoreService.updateModel<OrgModel>(OrgCollection, org, false, undefined, undefined, currentUser);
              item.bexioId = item.mbexioId;
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
            item.bx_type = contact.contact_type_id === 1 ? 'org' : 'person',
            item.bx_streetName = contact.street_name,
            item.bx_streetNumber = contact.house_number,
            item.bx_zipCode = contact.postcode,
            item.bx_city = contact.city,
            item.bx_email = contact.mail,
            item.bx_phone = contact.phone
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
          await store.firestoreService.updateModel<PersonModel>(PersonCollection, { ...person, bexioId: bxid }, false, undefined, undefined, currentUser);
        } else {
          console.error('addToBexio: person not found for bkey', item.bkey);
        }
      } else {
        const org = store.appStore.getOrg(item.bkey);
        if (org) {
          await store.firestoreService.updateModel<OrgModel>(OrgCollection, { ...org, bexioId: bxid }, false, undefined, undefined, currentUser);
        } else {
          console.error('addToBexio: org not found for bkey', item.bkey);
        }
      }

      // also update the membership.memberBexioId if a membership exists
      if (item.mkey) {
        const allMemberships = await store.firestoreService.getDataOnce<MembershipModel>(MembershipCollection, getSystemQuery(store.tenantId()), 'memberName2', 'asc');
        const membership = allMemberships.find(m => m.bkey === item.mkey);
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
      let bkey: string | undefined;

      if (item.type === 'person') {
        const person = new PersonModel(store.tenantId());
        person.firstName = item.bx_name1;
        person.lastName = item.bx_name2;
        person.bexioId = item.bx_id;
        bkey = await store.firestoreService.createModel<PersonModel>(PersonCollection, person, undefined, undefined, currentUser);
        const avatarKey = 'person.' + bkey;
        if (item.bx_email) {
          await this.saveAddress(createFavoriteAddress('email', 'home', item.bx_email, store.tenantId()), avatarKey);
        }
        await this.saveAddress(createFavoriteAddress('postal', 'home', item.bx_streetName, store.tenantId(), item.bx_streetNumber, '', item.bx_zipCode, item.bx_city, 'CH'), avatarKey);

      } else {
        const org = new OrgModel(store.tenantId());
        org.name = item.bx_name2;
        org.bexioId = item.bx_id;
        bkey = await store.firestoreService.createModel<OrgModel>(OrgCollection, org, undefined, undefined, currentUser);
        const avatarKey = 'org.' + bkey;
        if (item.bx_email) {
          await this.saveAddress(createFavoriteAddress('email', 'work', item.bx_email, store.tenantId()), avatarKey);
        }
        await this.saveAddress(createFavoriteAddress('postal', 'work', item.bx_streetName, store.tenantId(), item.bx_streetNumber, '', item.bx_zipCode, item.bx_city, 'CH'), avatarKey);
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


    /**
     * Update an existing BK contact (person/org) with the address data from Bexio.
     * The favorite postal and email addresses are updated (or created if missing);
     * the cached fav* fields on the person/org are kept in sync by the address Cloud Function trigger.
     */
    async updateInBk(item: BexioIndex): Promise<void> {
      if (!item.bkey) return;
      const currentUser = store.currentUser();
      const avatarKey = `${item.type}.${item.bkey}`;
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

    async loadInvoiceStats(): Promise<void> {
      try {
        const db = getFirestore(getApp());
        const [snap, configDoc] = await Promise.all([
          getCountFromServer(query(collection(db, InvoiceCollection), where('tenants', 'array-contains', store.tenantId()))),
          getDoc(doc(db, 'config', 'bexioSync')),
        ]);
        patchState(store, {
          invoiceCount: snap.data().count,
          lastSyncedAt: configDoc.data()?.['lastSyncedAt'] ?? '',
        });
      } catch (e) {
        // Transient on Safari: a request aborted mid-load (reload/navigate-away/bfcache) returns an
        // empty body that the Firebase SDK JSON-parses → "Unexpected EOF". ngOnInit calls this
        // fire-and-forget, so an unguarded rejection becomes an unhandled rejection (Sentry noise).
        console.warn('loadInvoiceStats failed (transient, ignored):', e);
      }
    },

    async linkInvoiceReceivers(): Promise<void> {
      const persons = store.appStore.allPersons();
      const orgs = store.appStore.allOrgs();
      if (persons.length === 0 && orgs.length === 0) {
        console.warn('linkInvoiceReceivers: persons/orgs not yet loaded, aborting');
        return;
      }

      // build bexioId -> AvatarInfo lookup from persons and orgs
      const lookup = new Map<string, AvatarInfo>();

      // 1) load all persons with bexioId — normalize key to plain numeric string
      for (const p of persons) {
        if (p.bexioId) {
          const key = String(Number(String(p.bexioId).trim()));
          lookup.set(key, { key: p.bkey ?? '', name1: p.firstName ?? '', name2: p.lastName ?? '', modelType: 'person', type: '', subType: '', label: getFullName(p.firstName ?? '', p.lastName ?? '') });
        }
      }

      // 2) load all orgs with bexioId — normalize key to plain numeric string
      for (const o of orgs) {
        if (o.bexioId) {
          const key = String(Number(o.bexioId.trim()));
          lookup.set(key, { key: o.bkey ?? '', name1: '', name2: o.name ?? '', modelType: 'org', type: '', subType: '', label: o.name ?? '' });
        }
      }

      console.log(`linkInvoiceReceivers: lookup has ${lookup.size} entries (${persons.filter(p => p.bexioId).length} persons, ${orgs.filter(o => o.bexioId).length} orgs)`);

      // 3) load all invoices that still have a notes value (= bexioContactId not yet resolved)
      const db = getFirestore(getApp());
      const invoiceQuery = query(
        collection(db, InvoiceCollection),
        where('tenants', 'array-contains', store.tenantId()),
        where('notes', '!=', '')
      );
      const snapshot = await getDocs(invoiceQuery);
      const pending = snapshot.docs.filter(d => !!d.data()['notes']);

      patchState(store, { receiverPendingCount: pending.length });

      if (pending.length === 0) return;

      // process in batches of 500 (Firestore limit)
      const BATCH_SIZE = 500;
      let linked = 0;
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = pending.slice(i, i + BATCH_SIZE);
        for (const d of chunk) {
          const data = d.data();
          const bexioContactId = String(Number(String(data['notes'] ?? '').trim()));
          const receiver = lookup.get(bexioContactId);
          if (!receiver) {
            console.log(`linkInvoiceReceivers: no match for bexioContactId="${bexioContactId}" (invoice ${data['invoiceId'] ?? d.id})`);
            continue;
          }

          const invoiceId: string = data['invoiceId'] ?? '';
          const totalCents: number = data['totalAmount']?.amount ?? 0;
          const indexStr = `i: ${invoiceId} a: ${(totalCents / 100).toFixed(2)} n: ${receiver.label} bx: ${bexioContactId}`;

          batch.update(d.ref, {
            receiver,
            index: indexStr,
            notes: '',
          });
          linked++;
        }
        await batch.commit();
      }

      patchState(store, { receiverLinkCount: linked, receiverPendingCount: pending.length - linked });
    },

    async syncInvoices(fromDate?: string): Promise<{ count: number }> {
      const functions = getFunctions(getApp(), 'europe-west6');
      if (store.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      const syncBexioInvoicesFn = httpsCallable<{ fromDate?: string }, { count: number }>(functions, 'syncBexioInvoices');
      const result = await syncBexioInvoicesFn(fromDate ? { fromDate } : {});
      return result.data;
    },

    async loadBillStats(): Promise<void> {
      try {
        const db = getFirestore(getApp());
        const [snap, configDoc] = await Promise.all([
          getCountFromServer(query(collection(db, 'bills'), where('tenants', 'array-contains', store.tenantId()))),
          getDoc(doc(db, 'config', 'bexioSync')),
        ]);
        patchState(store, {
          billCount: snap.data().count,
          lastBillSyncedAt: configDoc.data()?.['lastBillSyncedAt'] ?? '',
        });
      } catch (e) {
        console.warn('loadBillStats failed (transient, ignored):', e);
      }
    },

    async syncBills(fromDate?: string): Promise<{ count: number }> {
      const functions = getFunctions(getApp(), 'europe-west6');
      if (store.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      const syncBexioBillsFn = httpsCallable<{ fromDate?: string }, { count: number }>(functions, 'syncBexioBills');
      const result = await syncBexioBillsFn(fromDate ? { fromDate } : {});
      return result.data;
    },

    async loadJournalStats(): Promise<void> {
      try {
        const db = getFirestore(getApp());
        // Bexio journal entries are synced into the native `bookings` collection (the legacy `journallogs` collection was retired).
        const [snap, configDoc] = await Promise.all([
          getCountFromServer(query(collection(db, 'bookings'), where('tenants', 'array-contains', store.tenantId()))),
          getDoc(doc(db, 'config', 'bexioSync')),
        ]);
        patchState(store, {
          journalCount: snap.data().count,
          lastJournalSyncedAt: configDoc.data()?.['lastJournalSyncedAt'] ?? '',
        });
      } catch (e) {
        console.warn('loadJournalStats failed (transient, ignored):', e);
      }
    },

    async syncJournal(): Promise<{ count: number }> {
      const functions = getFunctions(getApp(), 'europe-west6');
      if (store.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      const syncBexioJournalFn = httpsCallable<void, { count: number }>(functions, 'syncBexioJournal');
      const result = await syncBexioJournalFn();
      return result.data;
    },

    async syncAccounts(): Promise<{ groups: number; accounts: number }> {
      const functions = getFunctions(getApp(), 'europe-west6');
      if (store.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      const fn = httpsCallable<void, { groups: number; accounts: number }>(functions, 'syncBexioAccounts');
      const result = await fn();
      return result.data;
    },

    async clearAccountTree(rootName: string): Promise<number> {
      if (!rootName.trim() || !isFirestoreInitializedCheck()) return 0;
      const db = getFirestore(getApp());

      // 1. Find the root document by name + type
      const rootSnap = await getDocs(query(
        collection(db, 'accounts'),
        where('tenants', 'array-contains', store.tenantId()),
        where('name', '==', rootName.trim()),
        where('type', '==', 'root')
      ));
      if (rootSnap.empty) return 0;
      const rootBkey = rootSnap.docs[0].id;

      // 2. BFS to collect all bkeys in the tree
      const allBkeys: string[] = [rootBkey];
      const frontier: string[] = [rootBkey];
      while (frontier.length > 0) {
        // Firestore 'in' supports max 30 values per query
        const chunk = frontier.splice(0, 30);
        const childSnap = await getDocs(query(
          collection(db, 'accounts'),
          where('tenants', 'array-contains', store.tenantId()),
          where('parentId', 'in', chunk)
        ));
        for (const d of childSnap.docs) {
          allBkeys.push(d.id);
          frontier.push(d.id);
        }
      }

      // 3. Delete in batches of 500
      const BATCH_SIZE = 500;
      for (let i = 0; i < allBkeys.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        for (const bkey of allBkeys.slice(i, i + BATCH_SIZE)) {
          batch.delete(doc(db, 'accounts', bkey));
        }
        await batch.commit();
      }
      return allBkeys.length;
    },

    async linkBillVendors(): Promise<void> {
      const persons = store.appStore.allPersons();
      const orgs = store.appStore.allOrgs();
      if (persons.length === 0 && orgs.length === 0) {
        console.warn('linkBillVendors: persons/orgs not yet loaded, aborting');
        return;
      }

      // 1) build name.lowercase -> AvatarInfo lookup
      const lookup = new Map<string, AvatarInfo>();
      for (const p of persons) {
        const name = getFullName(p.firstName ?? '', p.lastName ?? '').trim().toLowerCase();
        if (name) lookup.set(name, { key: p.bkey ?? '', name1: p.firstName ?? '', name2: p.lastName ?? '', modelType: 'person', type: '', subType: '', label: getFullName(p.firstName ?? '', p.lastName ?? '') });
      }
      for (const o of orgs) {
        const name = (o.name ?? '').trim().toLowerCase();
        if (name) lookup.set(name, { key: o.bkey ?? '', name1: '', name2: o.name ?? '', modelType: 'org', type: '', subType: '', label: o.name ?? '' });
      }

      // 2) load all bills with notes (= unresolved vendor name)
      const db = getFirestore(getApp());
      const billQuery = query(
        collection(db, 'bills'),
        where('tenants', 'array-contains', store.tenantId()),
        where('notes', '!=', '')
      );
      const snapshot = await getDocs(billQuery);
      const pending = snapshot.docs.filter(d => !!d.data()['notes']);
      patchState(store, { vendorPendingCount: pending.length, vendorUnmatched: [] });
      if (pending.length === 0) return;

      // 3) match and write
      const BATCH_SIZE = 500;
      let linked = 0;
      const unmatched: string[] = [];
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = pending.slice(i, i + BATCH_SIZE);
        for (const d of chunk) {
          const data = d.data();
          const vendorName = String(data['notes'] ?? '').trim().toLowerCase();
          const vendor = lookup.get(vendorName);
          if (!vendor) {
            if (!unmatched.includes(vendorName)) unmatched.push(vendorName);
            continue;
          }
          const billId: string = data['billId'] ?? '';
          const totalCents: number = data['totalAmount']?.amount ?? 0;
          const indexStr = `i: ${billId} a: ${(totalCents / 100).toFixed(2)} n: ${vendor.label}`;
          batch.update(d.ref, { vendor, index: indexStr, notes: '' });
          linked++;
        }
        await batch.commit();
      }
      patchState(store, { vendorLinkedCount: linked, vendorPendingCount: pending.length - linked, vendorUnmatched: unmatched });
    },

    async edit(bexioIndex: BexioIndex): Promise<void> {
      const modal = await store.modalController.create({
        component: AocBexioContactEditModal,
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
      const person = store.appStore.getPerson(item.bkey);
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
      const org = store.appStore.getOrg(item.bkey);
      if (!org) return;
      const modal = await store.modalController.create({
        component: OrgEditModal,
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

