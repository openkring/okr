import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { firstValueFrom } from 'rxjs';

import { isFirestoreInitializedCheck } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { LogInfo, logMessage, MembershipCollection, MembershipModel, OrgCollection, OrgModel, PersonCollection, PersonModel } from '@bk2/shared-models';
import { getFullName, getSystemQuery } from '@bk2/shared-util-core';

export interface BexioIndex {
  key: string;      // getFullName(name1, name2).toLowerCase() — join key
  bkey: string;     // BK document key (person.bkey or org.bkey)
  bname1: string;   // first name (person) or company name (org)
  bname2: string;   // last name (person) or '' (org)
  bbexioid: string; // BK-stored bexio ID (from membership.memberBexioId)
  mkey: string;     // membership bkey
  mbexioid: string; // membership.memberBexioId
  bxid: string;     // Bexio contact ID
  bxname1: string;  // Bexio first name (contact.name_2)
  bxname2: string;  // Bexio last/company name (contact.name_1)
  bxStreetName: string;
  bxStreetNumber: string;
  bxZipCode: string;
  bxCity: string;
  bxEmail: string;
  type: 'person' | 'org';
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
  log: LogInfo[];
};

const initialState: AocBexioState = {
  index: [],
  isLoading: false,
  log: [],
};

export const AocBexioStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
  })),
  withComputed(state => ({
    currentUser: computed(() => state.appStore.currentUser()),
  })),
  withMethods(store => ({
    async buildIndex(): Promise<void> {
      if (!isFirestoreInitializedCheck()) return;
      patchState(store, { isLoading: true, log: [], index: [] });

      const tenantId = store.appStore.env.tenantId;
      let log: LogInfo[] = [];

      // 1. Load persons and orgs from AppStore (already in memory)
      const persons = store.appStore.allPersons();
      const orgs = store.appStore.allOrgs();
      log = logMessage(log, `Loaded ${persons.length} persons, ${orgs.length} orgs`);

      // 2. Load memberships for the default org (orgKey === tenantId)
      const allMemberships = await firstValueFrom(
        store.firestoreService.searchData<MembershipModel>(MembershipCollection, getSystemQuery(tenantId), 'memberName2', 'asc')
      );
      const memberships = allMemberships.filter(m => m.orgKey === tenantId);
      log = logMessage(log, `Loaded ${memberships.length} memberships for default org`);

      const index: BexioIndex[] = [];

      // 3. Build index from persons
      for (const person of persons) {
        const membership = memberships.find(m => m.memberKey === person.bkey);
        const bname1 = person.firstName;
        const bname2 = person.lastName;
        const key = getFullName(bname1, bname2).toLowerCase();
        index.push({
          key,
          bkey: person.bkey ?? '',
          bname1,
          bname2,
          bbexioid: membership?.memberBexioId ?? '',
          mkey: membership?.bkey ?? '',
          mbexioid: membership?.memberBexioId ?? '',
          bxid: '',
          bxname1: '',
          bxname2: '',
          bxStreetName: '',
          bxStreetNumber: '',
          bxZipCode: '',
          bxCity: '',
          bxEmail: '',
          type: 'person',
        });
      }

      // 4. Add orgs to index
      for (const org of orgs) {
        const membership = memberships.find(m => m.memberKey === org.bkey);
        const bname1 = org.name;
        const bname2 = '';
        const key = getFullName(bname1, bname2).toLowerCase();
        index.push({
          key,
          bkey: org.bkey ?? '',
          bname1,
          bname2,
          bbexioid: membership?.memberBexioId ?? '',
          mkey: membership?.bkey ?? '',
          mbexioid: membership?.memberBexioId ?? '',
          bxid: '',
          bxname1: '',
          bxname2: '',
          bxStreetName: '',
          bxStreetNumber: '',
          bxZipCode: '',
          bxCity: '',
          bxEmail: '',
          type: 'org',
        });
      }

      // 5. Sort by key
      index.sort((a, b) => a.key.localeCompare(b.key));

      // 5b. Reconcile bbexioid (person/org.bexioId) <-> mbexioid (membership.memberBexioId)
      const currentUser = store.currentUser();
      for (const item of index) {
        if (!item.bkey || !item.mkey) continue; // only reconcile if both BK record and membership exist
        if (item.bbexioid && !item.mbexioid) {
          // person/org has bexioId set, but membership.memberBexioId is missing -> update membership
          const membership = memberships.find(m => m.bkey === item.mkey);
          if (membership) {
            membership.memberBexioId = item.bbexioid;
            await store.firestoreService.updateModel<MembershipModel>(MembershipCollection, membership, false, undefined, currentUser);
            item.mbexioid = item.bbexioid;
            log = logMessage(log, `Updated membership ${item.mkey}: memberBexioId = ${item.bbexioid}`);
          }
        } else if (!item.bbexioid && item.mbexioid) {
          // membership has memberBexioId set, but person/org.bexioId is missing -> update person/org
          if (item.type === 'person') {
            const person = persons.find(p => p.bkey === item.bkey);
            if (person) {
              person.bexioId = item.mbexioid;
              await store.firestoreService.updateModel<PersonModel>(PersonCollection, person, false, undefined, currentUser);
              item.bbexioid = item.mbexioid;
              log = logMessage(log, `Updated person ${item.bkey}: bexioId = ${item.mbexioid}`);
            }
          } else {
            const org = orgs.find(o => o.bkey === item.bkey);
            if (org) {
              org.bexioId = item.mbexioid;
              await store.firestoreService.updateModel<OrgModel>(OrgCollection, org, false, undefined, currentUser);
              item.bbexioid = item.mbexioid;
              log = logMessage(log, `Updated org ${item.bkey}: bexioId = ${item.mbexioid}`);
            }
          }
        }
      }

      // 6. Fetch Bexio contacts via Cloud Function
      try {
        const functions = getFunctions(getApp(), 'europe-west6');
        if (store.appStore.env.useEmulators) {
          connectFunctionsEmulator(functions, 'localhost', 5001);
        }
        const getBexioContacts = httpsCallable<void, BexioContact[]>(functions, 'getBexioContacts');
        const result = await getBexioContacts();
        const contacts = result.data;
        log = logMessage(log, `Loaded ${contacts.length} Bexio contacts`);

        // 7. Join by key: if keys match, enrich existing entry; otherwise add unmatched Bexio contact
        for (const contact of contacts) {
          const bxname1 = contact.name_2 ?? ''; // first name (null for companies)
          const bxname2 = contact.name_1;        // last name or company name
          const bxKey = getFullName(bxname1, bxname2).toLowerCase();
          const item = index.find(i => i.key === bxKey);
          if (item) {
            item.bxid = contact.id + '';
            item.bxname1 = bxname1;
            item.bxname2 = bxname2;
          } else {
            index.push({
              key: bxKey,
              bkey: '',
              bname1: '',
              bname2: '',
              bbexioid: '',
              mkey: '',
              mbexioid: '',
              bxid: contact.id + '',
              bxname1,
              bxname2,
              bxStreetName: contact.street_name,
              bxStreetNumber: contact.house_number,
              bxZipCode: contact.postcode,
              bxCity: contact.city,
              bxEmail: contact.mail,
              type: contact.contact_type_id === 1 ? 'org' : 'person',
            });
          }
        }

        // 8. Sort again by key
        index.sort((a, b) => a.key.localeCompare(b.key));
        log = logMessage(log, `Index built: ${index.length} entries`);
      } catch (e) {
        log = logMessage(log, `getBexioContacts Cloud Function failed: ${e}`);
      }

      patchState(store, { index, isLoading: false, log });
    },

    async addToBexio(item: BexioIndex): Promise<void> {
      const functions = getFunctions(getApp(), 'europe-west6');
      if (store.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      const createBexioContact = httpsCallable<
        { name_1: string; name_2: string | null; street_name: string, house_number: string, postcode: string, city: string, mail: string, contact_type_id: number },
        { id: string }
      >(functions, 'createBexioContact');

      const result = await createBexioContact({
        name_1: item.bname2,                        // last/company name
        name_2: item.bname1 || null,                // first name (null for orgs)
        street_name: item.bxStreetName,
        house_number: item.bxStreetNumber,
        postcode: item.bxZipCode,
        city: item.bxCity,
        mail: item.bxEmail,
        contact_type_id: item.type === 'org' ? 1 : 2,
      });
      const bxid = result.data.id;

      // If Bexio assigned a different ID than stored in BK, update person/org
      if (bxid !== item.bbexioid && item.bkey) {
        const currentUser = store.currentUser();
        if (item.type === 'person') {
          const person = store.appStore.allPersons().find(p => p.bkey === item.bkey);
          if (person) {
            person.bexioId = bxid;
            await store.firestoreService.updateModel<PersonModel>(PersonCollection, person, false, undefined, currentUser);
          }
        } else {
          const org = store.appStore.allOrgs().find(o => o.bkey === item.bkey);
          if (org) {
            org.bexioId = bxid;
            await store.firestoreService.updateModel<OrgModel>(OrgCollection, org, false, undefined, currentUser);
          }
        }
      }

      patchState(store, {
        index: store.index().map(i => i.key === item.key
          ? { ...i, bxid, bxname1: item.bname1, bxname2: item.bname2, bbexioid: bxid }
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
        person.firstName = item.bxname1;
        person.lastName = item.bxname2;
        person.bexioId = item.bxid;
        bkey = await store.firestoreService.createModel<PersonModel>(PersonCollection, person, undefined, currentUser);
      } else {
        const org = new OrgModel(tenantId);
        org.name = item.bxname2;
        org.bexioId = item.bxid;
        bkey = await store.firestoreService.createModel<OrgModel>(OrgCollection, org, undefined, currentUser);
      }

      if (bkey) {
        patchState(store, {
          index: store.index().map(i => i.key === item.key
            ? { ...i, bkey, bbexioid: item.bxid, bname1: item.bxname1, bname2: item.bxname2 }
            : i
          ),
        });
      }
    },
  }))
);
