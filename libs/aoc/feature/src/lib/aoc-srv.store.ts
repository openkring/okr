import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { isFirestoreInitializedCheck } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore, OrgSelectModalComponent } from '@bk2/shared-feature';
import { MembershipCollection, MembershipModel, OrgModel, OwnershipModel, PersonModel } from '@bk2/shared-models';
import { debugListLoaded, getFullName, getSystemQuery, getTodayStr, isAfterOrEqualDate } from '@bk2/shared-util-core';
import { navigateByUrl } from '@bk2/shared-util-angular';
import { OwnershipService } from '@bk2/relationship-ownership-data-access';
import { rxResource } from '@angular/core/rxjs-interop';
import { MemberNewModal, MembershipEditModalComponent } from '@bk2/relationship-membership-feature';
import { AocSrvMismatchModal } from './aoc-srv-mismatch.modal';

// ─── Regasoft contact as returned by the getSrvContacts CF ───────────────────

export interface PersonClub {
  clubId: number;
  clubName: string;
  mainClub: boolean;
}

export interface SrvContact {
  srvId: number;
  serviceId?: number;
  firstName: string;
  lastName: string;
  email: string | null;
  mobile: string | null;
  telefon: string | null;
  dateOfBirth: string;        // StoreDate YYYYMMDD
  gender: number;             // 1=male, 2=female
  membershipType?: string | null;
  nationIOC?: string | null;
  hasNewsletter: boolean;
  mainClub: boolean;
  hasLicense: boolean;
  licenseId?: number | null;
  licenseDate?: string;       // StoreDate YYYYMMDD
  licenseValidUntil?: string; // StoreDate YYYYMMDD
  leavingDate?: string;       // StoreDate YYYYMMDD
  dateOfDeath?: string;       // StoreDate YYYYMMDD
  street?: string | null;
  postcode?: string | null;
  city?: string | null;
  personClubs: PersonClub[];
}

// ─── Index entry ──────────────────────────────────────────────────────────────

export interface SrvIndex {
  key: string;       // getFullName(firstName, lastName).trim().toLowerCase()
  firstName: string;
  lastName: string;

  // Main membership (m prefix) — orgKey = tenantId
  mKey: string;        // m.bkey
  personKey: string;   // m.memberKey
  mDateOfExit: string; // StoreDate
  dateOfBirth: string; // StoreDate
  gender: string;      // 'male' | 'female'
  state: string;       // m.state
  mCategory: string;   // abbreviated category
  mEmail: string;
  mPhone: string;
  mStreet: string;
  mZipCode: string;
  mCity: string;

  // Parent membership (p prefix) — orgKey = 'srv'
  pKey: string;        // p.bkey
  memberId: string;    // p.memberId = SRV serviceId stored in BK
  pDateOfExit: string; // StoreDate
  pState: string;
  pCategory: string;   // abbreviated category

  // Search index field: 'f:firstname l:lastname s:serviceId r:rid'
  indexField: string;

  // Regasoft (r prefix)
  rid: string;           // r.srvId as string
  rServiceId: string;    // r.serviceId as string
  rFirstName: string;
  rLastName: string;
  rEmail: string;
  rPhone: string;        // r.mobile || r.telefon
  rStreet: string;
  rZipCode: string;
  rCity: string;
  rDateOfBirth: string;  // r.dateOfBirth (StoreDate)
  rCategory: string;     // first uppercase char of membershipType
  rDateOfExit: string;   // r.leavingDate || r.dateOfDeath (StoreDate)
  nationIOC: string;
  hasNewsletter: boolean;
  mainClub: boolean;
  otherClubs: string;    // personClubs[*].clubName joined by ', '
  licenseId: string;
  licenseDate: string;            // StoreDate
  licenseValidUntil: string;      // StoreDate
  licenseImage: string | null;
  licenseImageName: string | null;
  licenseImageMimeType: string | null;
}

// ─── Store state ──────────────────────────────────────────────────────────────

// ─── Mismatch detection ───────────────────────────────────────────────────────

export interface SrvMismatch {
  field: string;
  bkValue: string;
  rValue: string;
}

export function getMismatches(item: SrvIndex): SrvMismatch[] {
  if (!item.rid) return []; // no Regasoft record → nothing to compare

  const result: SrvMismatch[] = [];
  const chk = (field: string, bk: string, r: string) => {
    if (r && bk !== r) result.push({ field, bkValue: bk, rValue: r });
  };

  chk('firstName',   item.firstName,   item.rFirstName);
  chk('lastName',    item.lastName,    item.rLastName);
  chk('memberId',    item.memberId,    item.rServiceId);
  chk('email',       item.mEmail,      item.rEmail);
  chk('phone',       item.mPhone,      item.rPhone);
  chk('street',      item.mStreet,     item.rStreet);
  chk('zipCode',     item.mZipCode,    item.rZipCode);
  chk('city',        item.mCity,       item.rCity);
  chk('dateOfBirth', item.dateOfBirth, item.rDateOfBirth);

  if (item.pKey) {
    const expectedCat = item.mainClub ? item.rCategory : 'D';
    if (expectedCat && item.pCategory !== expectedCat) {
      result.push({ field: 'pCategory', bkValue: item.pCategory, rValue: expectedCat });
    }
  }

  return result;
}

// ─── Store state ──────────────────────────────────────────────────────────────

export type AocSrvState = {
  index: SrvIndex[];
  searchTerm: string;
  selectedFilter: string;
  regasoftItems: number;
};

const initialState: AocSrvState = {
  index: [],
  searchTerm: '',
  selectedFilter: 'all',
  regasoftItems: 0
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function memberCatAbbr(category: string): string {
  const map: Record<string, string> = {
    active: 'A', passive: 'P', junior: 'J', double: 'D', candidate: 'C',
  };
  return map[category] ?? '';
}

function buildIndexEntry(
  m: MembershipModel | undefined,
  p: MembershipModel | undefined,
  r: SrvContact | undefined,
  person: PersonModel | undefined,
): SrvIndex {
  const firstName = m?.memberName1 ?? r?.firstName ?? p?.memberName1 ?? '';
  const lastName  = m?.memberName2 ?? r?.lastName  ?? p?.memberName2 ?? '';
  const serviceIdPart = (r?.serviceId != null ? String(r.serviceId) : '') || (p?.memberId ?? '');
  const ridPart       = r ? String(r.srvId) : '';
  return {
    key:        getFullName(firstName, lastName).trim().toLowerCase(),
    indexField: `f:${firstName} l:${lastName} s:${serviceIdPart} r:${ridPart}`.toLowerCase(),
    firstName,
    lastName,

    mKey:        m?.bkey ?? '',
    personKey:   m?.memberKey ?? '',
    mDateOfExit: m?.dateOfExit ?? '',
    dateOfBirth: m?.memberDateOfBirth ?? '',
    gender:      m?.memberType ?? '',
    state:       m?.state ?? '',
    mCategory:   memberCatAbbr(m?.category ?? ''),
    mEmail:      person?.favEmail ?? '',
    mPhone:      person?.favPhone ?? '',
    mStreet:     person ? `${person.favStreetName} ${person.favStreetNumber}`.trim() : '',
    mZipCode:    person?.favZipCode ?? '',
    mCity:       person?.favCity ?? '',

    pKey:        p?.bkey ?? '',
    memberId:    p?.memberId ?? '',
    pDateOfExit: p?.dateOfExit ?? '',
    pState:      p?.state ?? '',
    pCategory:   memberCatAbbr(p?.category ?? ''),

    rid:              r ? String(r.srvId) : '',
    rServiceId:       r?.serviceId != null ? String(r.serviceId) : '',
    rFirstName:       r?.firstName ?? '',
    rLastName:        r?.lastName ?? '',
    rEmail:           r?.email ?? '',
    rPhone:           r?.mobile || r?.telefon || '',
    rStreet:          r?.street ?? '',
    rZipCode:         r?.postcode ?? '',
    rCity:            r?.city ?? '',
    rDateOfBirth:     r?.dateOfBirth ?? '',
    rCategory:        r?.membershipType ? r.membershipType.charAt(0).toUpperCase() : '',
    rDateOfExit:      r?.leavingDate || r?.dateOfDeath || '',
    nationIOC:        r?.nationIOC ?? '',
    hasNewsletter:    r?.hasNewsletter ?? false,
    mainClub:         r?.mainClub ?? false,
    otherClubs:       r?.personClubs?.map(c => c.clubName).join(', ') ?? '',
    licenseId:            r?.licenseId != null ? String(r.licenseId) : '',
    licenseDate:          r?.licenseDate ?? '',
    licenseValidUntil:    r?.licenseValidUntil ?? '',
    licenseImage:         null,
    licenseImageName:     null,
    licenseImageMimeType: null,
  };
}

function storageKey(tenantId: string): string {
  return `bk2-aoc-srv-index-${tenantId}`;
}

function stripForStorage(entry: SrvIndex): Omit<SrvIndex, 'licenseImage' | 'licenseImageName' | 'licenseImageMimeType'> & { licenseImage: null; licenseImageName: null; licenseImageMimeType: null } {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { licenseImage, licenseImageName, licenseImageMimeType, ...rest } = entry;
  return { ...rest, licenseImage: null, licenseImageName: null, licenseImageMimeType: null };
}

function saveIndex(tenantId: string, index: SrvIndex[]): void {
  try {
    localStorage.setItem(storageKey(tenantId), JSON.stringify(index.map(stripForStorage)));
  } catch { /* SSR/quota */ }
}

function loadIndex(tenantId: string): SrvIndex[] {
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    return raw ? (JSON.parse(raw) as SrvIndex[]) : [];
  } catch { return []; }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const AocSrvStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    router: inject(Router),
    ownershipService: inject(OwnershipService),
  })),

  withComputed(state => ({
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId:    computed(() => state.appStore.tenantId()),
  })),

  // Main memberships: orgKey = tenantId (SCS members)
  withProps((store) => ({
    mainMembershipsResource: rxResource({
      params: () => ({ currentUser: store.currentUser(), tenantId: store.tenantId() }),
      stream: ({ params }) => {
        const query = getSystemQuery(params.tenantId);
        query.push({ key: 'orgKey',          operator: '==', value: params.tenantId });
        query.push({ key: 'memberModelType', operator: '==', value: 'person' });
        query.push({ key: 'orgModelType',    operator: '==', value: 'org' });
        return store.firestoreService
          .searchData<MembershipModel>(MembershipCollection, query, 'memberName2', 'asc')
          .pipe(debugListLoaded<MembershipModel>('AocSrvStore.mainMemberships', params.currentUser));
      },
    }),
  })),

  // Parent memberships: orgKey = 'srv' (SRV federation memberships)
  withProps((store) => ({
    parentMembershipsResource: rxResource({
      params: () => ({ currentUser: store.currentUser() }),
      stream: ({ params }) => {
        const query = getSystemQuery(store.tenantId());
        query.push({ key: 'orgKey',          operator: '==', value: 'srv' });
        query.push({ key: 'memberModelType', operator: '==', value: 'person' });
        query.push({ key: 'orgModelType',    operator: '==', value: 'org' });
        return store.firestoreService
          .searchData<MembershipModel>(MembershipCollection, query, 'memberName2', 'asc')
          .pipe(debugListLoaded<MembershipModel>('AocSrvStore.parentMemberships', params.currentUser));
      },
    }),
  })),


  withComputed(state => ({
    // Filter Firestore streams to currently active members
    mainMemberships: computed(() =>
      (state.mainMembershipsResource.value() ?? [])
        .filter((m: MembershipModel) => isAfterOrEqualDate(m.dateOfExit, getTodayStr()))
    ),
    parentMemberships: computed(() =>
      (state.parentMembershipsResource.value() ?? [])
        .filter((m: MembershipModel) => isAfterOrEqualDate(m.dateOfExit, getTodayStr()))
    ),
    isLoading: computed(() =>
      state.mainMembershipsResource.isLoading() || state.parentMembershipsResource.isLoading()
    ),
    foreignNationMembers: computed(() =>
      state.index().filter(i => !!i.nationIOC && i.nationIOC !== 'SUI')
    ),
    clubMembers: computed(() =>
      state.index().filter(i => !!i.otherClubs)
    ),
    mcat:    computed(() => state.appStore.allCategories()?.find(c => c.name === 'mcat_scs')),
    genders: computed(() => state.appStore.getCategory('gender')),
  })),

  withMethods(store => ({

    setSearchTerm(searchTerm: string) { patchState(store, { searchTerm }); },
    setFilter(selectedFilter: string) { patchState(store, { selectedFilter }); },
    resetIndex() {
      patchState(store, { index: [] });
      try { localStorage.removeItem(storageKey(store.tenantId())); } catch { /* SSR */ }
    },
    loadIndexFromStorage() {
      const index = loadIndex(store.tenantId());
      if (index.length > 0) {
        const regasoftItems = index.filter(i => !!i.rid).length;
        patchState(store, { index, regasoftItems });
      }
    },

    async buildIndex(): Promise<void> {
      if (!isFirestoreInitializedCheck()) return;

      const mainMemberships   = store.mainMemberships();
      const parentMemberships = store.parentMemberships();

      // ── Lookup maps ──────────────────────────────────────────────────────
      const parentByMemberKey = new Map<string, MembershipModel>();
      for (const p of parentMemberships) parentByMemberKey.set(p.memberKey, p);

      // ── Fetch Regasoft contacts ──────────────────────────────────────────
      const functions = getFunctions(getApp(), 'europe-west6');
      if (store.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      let regasoftContacts: SrvContact[] = [];
      try {
        const fn = httpsCallable<void, SrvContact[]>(functions, 'getSrvContacts');
        const result = await fn();
        regasoftContacts = result.data;
        patchState(store, { regasoftItems: regasoftContacts.length });
        console.log(`AocSrvStore.buildIndex: ${regasoftContacts.length} Regasoft contacts loaded`);
      } catch (e) {
        console.error('AocSrvStore.buildIndex: getSrvContacts failed', e);
      }

      const regasoftByServiceId = new Map<string, SrvContact>();
      const regasoftByName      = new Map<string, SrvContact>();
      for (const r of regasoftContacts) {
        if (r.serviceId != null) regasoftByServiceId.set(String(r.serviceId), r);
        const nameKey = getFullName(r.firstName, r.lastName).trim().toLowerCase();
        if (!regasoftByName.has(nameKey)) regasoftByName.set(nameKey, r);
      }

      const processedParentKeys    = new Set<string>();
      const processedRegasoftIds   = new Set<number>();
      const index: SrvIndex[] = [];

      // ── Process main memberships ─────────────────────────────────────────
      for (const m of mainMemberships) {
        const p = parentByMemberKey.get(m.memberKey);
        if (p?.bkey) processedParentKeys.add(p.bkey);

        let r: SrvContact | undefined;
        if (p?.memberId) r = regasoftByServiceId.get(p.memberId);
        if (!r) {
          const nameKey = getFullName(m.memberName1, m.memberName2).trim().toLowerCase();
          r = regasoftByName.get(nameKey);
        }
        if (r) processedRegasoftIds.add(r.srvId);

        const person = store.appStore.getPerson(m.memberKey);
        index.push(buildIndexEntry(m, p, r, person));
      }

      // ── Orphan parent memberships (no matching main) ─────────────────────
      for (const p of parentMemberships) {
        if (p.bkey && processedParentKeys.has(p.bkey)) continue;

        let r: SrvContact | undefined;
        if (p.memberId) r = regasoftByServiceId.get(p.memberId);
        if (!r) {
          const nameKey = getFullName(p.memberName1, p.memberName2).trim().toLowerCase();
          r = regasoftByName.get(nameKey);
        }
        if (r) processedRegasoftIds.add(r.srvId);

        index.push(buildIndexEntry(undefined, p, r, undefined));
      }

      // ── Orphan Regasoft contacts (no matching main or parent) ────────────
      for (const r of regasoftContacts) {
        if (processedRegasoftIds.has(r.srvId)) continue;
        index.push(buildIndexEntry(undefined, undefined, r, undefined));
      }

      index.sort((a, b) => {
        const nameA = a.lastName || a.rLastName;
        const nameB = b.lastName || b.rLastName;
        return nameA.localeCompare(nameB);
      });

      // ── Enrich license dates from member detail endpoint ─────────────────
      const licensedRids = index
        .filter(i => !!i.licenseDate && !!i.rid)
        .map(i => Number(i.rid))
        .filter(n => n > 0);
      if (licensedRids.length > 0) {
        try {
          const detailFn = httpsCallable<{ rids: number[] }, { rid: number; licenseDate: string; licenseValidUntil: string; licenseImage: string | null; licenseImageName: string | null; licenseImageMimeType: string | null }[]>(
            functions, 'getSrvMemberDetail'
          );
          const detailResult = await detailFn({ rids: licensedRids });
          const detailMap = new Map(detailResult.data.map(d => [d.rid, d]));
          for (const entry of index) {
            const detail = detailMap.get(Number(entry.rid));
            if (detail) {
              entry.licenseDate          = detail.licenseDate;
              entry.licenseValidUntil    = detail.licenseValidUntil;
              entry.licenseImage         = detail.licenseImage;
              entry.licenseImageName     = detail.licenseImageName;
              entry.licenseImageMimeType = detail.licenseImageMimeType;
            }
          }
          console.log(`AocSrvStore.buildIndex: enriched ${detailResult.data.length} license details`);
        } catch (e) {
          console.error('AocSrvStore.buildIndex: getSrvMemberDetail failed', e);
        }
      }

      console.log(`AocSrvStore.buildIndex: index built with ${index.length} entries`);
      patchState(store, { index });
      saveIndex(store.tenantId(), index);
    },

    async showRegasoftDetail(item: SrvIndex): Promise<void> {
      const mismatches = getMismatches(item);
      if (mismatches.length === 0) return;
      const modal = await store.modalController.create({
        component: AocSrvMismatchModal,
        componentProps: { item, mismatches },
      });
      await modal.present();
    },

    async createLicense(item: SrvIndex): Promise<void> {
      const ownership = new OwnershipModel(store.tenantId());
      ownership.ownerKey       = item.personKey;
      ownership.ownerModelType = 'person';
      ownership.ownerName1     = item.firstName;
      ownership.ownerName2     = item.lastName;
      ownership.ownerType      = item.gender;
      ownership.resourceKey    = item.licenseId;
      ownership.resourceName   = `SRV Lizenz ${item.licenseId}`;
      ownership.resourceModelType = 'resource';
      ownership.resourceType   = 'legaldoc';
      ownership.resourceSubType = 'license';
      ownership.validFrom      = item.licenseDate;
      ownership.validTo        = item.licenseValidUntil;
      await store.ownershipService.create(ownership, store.appStore.currentUser() ?? undefined);
    },

    downloadLicense(item: SrvIndex): void {
      if (!item.licenseImage) return;
      const mimeType = item.licenseImageMimeType ?? 'application/octet-stream';
      const name     = item.licenseImageName     ?? `license_${item.rid}`;
      const binary   = atob(item.licenseImage);
      const bytes    = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mimeType });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },

    async addClubMembership(item: SrvIndex): Promise<void> {
      const orgModal = await store.modalController.create({
        component: OrgSelectModalComponent,
        cssClass: 'list-modal',
        componentProps: { selectedTag: 'selectable', currentUser: store.appStore.currentUser() },
      });
      await orgModal.present();
      const { data: org, role } = await orgModal.onWillDismiss<OrgModel>();
      if (role !== 'confirm' || !org) return;

      const mcat = store.mcat();
      const genders = store.genders();
      if (!mcat || !genders) return;

      const modal = await store.modalController.create({
        component: MemberNewModal,
        componentProps: {
          currentUser: store.appStore.currentUser(),
          mcat,
          tags: store.appStore.getTags('membership'),
          tenantId: store.tenantId(),
          genders,
          org,
        },
      });
      await modal.present();
    },

    async editPerson(item: SrvIndex): Promise<void> {
      await navigateByUrl(store.router, `/person/${item.mKey}`);
    },

    async editScsMember(mKey: string): Promise<void> {
      const membership = store.mainMemberships().find(m => m.bkey === mKey);
      const mcat = store.mcat();
      if (!membership || !mcat) return;
      const modal = await store.modalController.create({
        component: MembershipEditModalComponent,
        componentProps: {
          membership: { ...membership },
          currentUser: store.appStore.currentUser(),
          tags: store.appStore.getTags('membership'),
          priv: store.appStore.privacySettings(),
          mcat,
          isNew: false,
          readOnly: false,
        },
      });
      await modal.present();
    },

    async editSrvMember(pKey: string): Promise<void> {
      const membership = store.parentMemberships().find(m => m.bkey === pKey);
      const mcat = store.mcat();
      if (!membership || !mcat) return;
      const modal = await store.modalController.create({
        component: MembershipEditModalComponent,
        componentProps: {
          membership: { ...membership },
          currentUser: store.appStore.currentUser(),
          tags: store.appStore.getTags('membership'),
          priv: store.appStore.privacySettings(),
          mcat,
          isNew: false,
          readOnly: false,
        },
      });
      await modal.present();
    },

    async addToRegasoft(item: SrvIndex): Promise<void> {
      const functions = getFunctions(getApp(), 'europe-west6');
      if (store.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      const fn = httpsCallable<object, { id: string }>(functions, 'createSrvContact');
      const p = store.appStore.getPerson(item.personKey);
      let srvId: string;
      try {
        const result = await fn({
          firstName:      item.firstName,
          lastName:       item.lastName,
          fullname:       `${item.lastName} ${item.firstName}`.trim(),
          dateOfBirth:    item.dateOfBirth,
          gender:         item.gender === 'female' ? 2 : 1,
          email:          p?.favEmail || null,
          mobile:         p?.favPhone || null,
          membershipType: item.state === 'passive' ? 'Passive' : 'Active',
          nationIOC:      'SUI',
          language:       0,
          hasNewsletter:  true,
          hasLicense:     false,
          street:         p ? `${p.favStreetName} ${p.favStreetNumber}`.trim() || null : null,
          streetAdditional: null,
          postcode:       p?.favZipCode || null,
          city:           p?.favCity || null,
          countryName:    p?.favCountryCode ? 'Schweiz' : null,
          countryId:      p?.favCountryCode || null,
          telefon:        null,
        });
        srvId = String(result.data.id);
      } catch (e) {
        console.error('AocSrvStore.addToRegasoft: createSrvContact failed', e);
        throw e;
      }

      patchState(store, {
        index: store.index().map(i => i.key === item.key
          ? { ...i, memberId: srvId, rid: srvId, rServiceId: srvId, rFirstName: item.firstName, rLastName: item.lastName }
          : i
        ),
      });
    },

    async updateRegasoft(item: SrvIndex): Promise<void> {
      console.log('updateRegasoft is not yet implemented');
    }
  }))
);

