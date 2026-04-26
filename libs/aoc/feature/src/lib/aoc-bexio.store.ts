import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { collection, doc, getCountFromServer, getDocs, getDoc, getFirestore, query, where, writeBatch } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { firstValueFrom } from 'rxjs';

import { isFirestoreInitializedCheck } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { AddressCollection, AddressModel, AvatarInfo, InvoiceCollection, MembershipCollection, MembershipModel, OrgCollection, OrgModel, PersonCollection, PersonModel } from '@bk2/shared-models';
import { getCatAbbreviation, getFullName, getSystemQuery } from '@bk2/shared-util-core';
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
    modalController: inject(ModalController)
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
      console.log(`Loaded ${persons.length} persons, ${orgs.length} orgs`);

      // 2. Load memberships for the default org (orgKey === tenantId)
      const allMemberships = await firstValueFrom(
        store.firestoreService.searchData<MembershipModel>(MembershipCollection, getSystemQuery(store.tenantId()), 'memberName2', 'asc')
      );
      console.log('all memberships: ' + allMemberships.length);
      const memberships = allMemberships.filter(m => m.orgKey === store.tenantId()); // only members of defaultOrg
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
          mcat: this.getCategoryAbbreviation(membership?.category ?? ''),

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
          mcat: this.getCategoryAbbreviation(membership?.category ?? ''),

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
        const allMemberships = await firstValueFrom(
          store.firestoreService.searchData<MembershipModel>(MembershipCollection, getSystemQuery(store.tenantId()), 'memberName2', 'asc')
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
          await this.saveAddress(createFavoriteAddress('email', 'home', person.favEmail, store.tenantId()), avatarKey);
        }
        await this.saveAddress(createFavoriteAddress('postal', 'home', person.favStreetName, store.tenantId(), person.favStreetNumber, '', person.favZipCode, person.favCity, person.favCountryCode), avatarKey);

      } else {
        const org = new OrgModel(store.tenantId());
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
          await this.saveAddress(createFavoriteAddress('email', 'work', org.favEmail, store.tenantId()), avatarKey);
        }
        await this.saveAddress(createFavoriteAddress('postal', 'work', org.favStreetName, store.tenantId(), org.favStreetNumber, '', org.favZipCode, org.favCity, org.favCountryCode), avatarKey);
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

    async loadInvoiceStats(): Promise<void> {
      const db = getFirestore(getApp());
      const [snap, configDoc] = await Promise.all([
        getCountFromServer(collection(db, InvoiceCollection)),
        getDoc(doc(db, 'config', 'bexioSync')),
      ]);
      patchState(store, {
        invoiceCount: snap.data().count,
        lastSyncedAt: configDoc.data()?.['lastSyncedAt'] ?? '',
      });
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
      const db = getFirestore(getApp());
      const [snap, configDoc] = await Promise.all([
        getCountFromServer(collection(db, 'bills')),
        getDoc(doc(db, 'config', 'bexioSync')),
      ]);
      patchState(store, {
        billCount: snap.data().count,
        lastBillSyncedAt: configDoc.data()?.['lastBillSyncedAt'] ?? '',
      });
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
      const db = getFirestore(getApp());
      const [snap, configDoc] = await Promise.all([
        getCountFromServer(collection(db, 'journallogs')),
        getDoc(doc(db, 'config', 'bexioSync')),
      ]);
      patchState(store, {
        journalCount: snap.data().count,
        lastJournalSyncedAt: configDoc.data()?.['lastJournalSyncedAt'] ?? '',
      });
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
      } else if (role === 'download') {
        await this.addToBk(bexioIndex);
      }
    }
  }))
);

