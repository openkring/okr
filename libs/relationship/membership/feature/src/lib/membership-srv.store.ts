import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { rxResource } from '@angular/core/rxjs-interop';

import { isFirestoreInitializedCheck } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AddressCollection, AddressModel, MembershipCollection, MembershipModel, OwnershipModel, PersonModel, SrvChanges, SrvContact, SrvCountry, SrvIndex, SrvMemberLicenseDetail, SrvMembersAllResult, SrvPreview, SrvUpdateResult } from '@okr/shared-models';
import { classifyPhone, composeSekretariatMail, countryIdOf, DateFormat, debugListLoaded, expectedSrvStatus, fill, getBirthYear, getFullName, getMismatches, getSekretariatCases, getSrvChanges, getSystemQuery, getTodayStr, getYear, isMembership, isPerson, mailtoUrl, makeSrvMatcher, pickSrvMemberships, regasoftDateToStoreDate, srvCategoryOf, srvCreateBlocker, SrvMembershipPick } from '@okr/shared-util-core';

import { copyToClipboardDeferred, showToast } from '@okr/shared-util-angular';
import { OwnershipService } from '@okr/relationship-ownership-data-access';
import { ExternalReportService, MembershipService, SRV_EXTERNAL_ORG } from '@okr/relationship-membership-data-access';
import { PersonService } from '@okr/subject-person-data-access';
import { PERSON_EDIT_MODAL } from '@okr/subject-person-ui';
import { MEMBERSHIP_I18N_KEYS, newMembershipForPerson } from '@okr/relationship-membership-util';
import { MembershipSrvMismatchModal, MembershipSrvPreviewModal } from '@okr/relationship-membership-ui';

import { MembershipEditModal } from './membership-edit.modal';

export { getMismatches };

const PARENT_ORG = 'srv';

// ─── Store state ──────────────────────────────────────────────────────────────

export type MembershipSrvState = {
  index: SrvIndex[];
  searchTerm: string;
  selectedFilter: string;
  regasoftItems: number;
  /** caseKeys already reported to the Sekretariat; null = not read yet (or the read failed). */
  reportedKeys: string[] | null;
  /**
   * true once `buildIndex` completed in this app session. An index loaded from localStorage may be
   * days old; a change set from it could write stale data to Regasoft (spec 1.133 I6).
   */
  builtThisSession: boolean;
  /**
   * Regasoft members who left or died and match none of our members: not shown, but checked by the
   * duplicate guard before a member is created (D8). Filled by `buildIndex`, never stored.
   */
  inactiveIndex: SrvIndex[];
  /** Regasoft's country list from the last index build; empty = unknown (fallback CH = 3). */
  countries: SrvCountry[];
};

const initialState: MembershipSrvState = {
  index: [],
  inactiveIndex: [],
  countries: [],
  searchTerm: '',
  selectedFilter: 'all',
  regasoftItems: 0,
  reportedKeys: null,
  builtThisSession: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function memberCatAbbr(category: string): string {
  const map: Record<string, string> = {
    active: 'A', active2: 'A', active3: 'A', honorary: 'A', free: 'A', passive: 'P', junior: 'J', double: 'D', candidate: 'K',
  };
  return map[category] ?? '';
}

/**
 * Abbreviation of an SRV membership category (`mcat_srv`). Unlike the club's categories, honorary
 * is its own SRV category `E`, the value `srvCategoryOf('Honorary')` compares with (spec 1.133 C2).
 */
function parentCatAbbr(category: string): string {
  const map: Record<string, string> = { active: 'A', junior: 'J', double: 'D', honorary: 'E', passive: 'P' };
  return map[category] ?? '';
}

/** Regasoft gender code → index value (1 male, 2 female, anything else unknown). */
function genderOf(code: number | null | undefined): string {
  return code === 1 ? 'male' : code === 2 ? 'female' : '';
}

/** The Regasoft-side status/contact fields of an index entry, from a (mapped) member detail. */
type SrvRegasoftFields = Pick<SrvMemberLicenseDetail,
  'gender' | 'mobile' | 'telefon' | 'countryId' | 'entryDate' | 'inactiveDate' | 'dateOfDeath' | 'leavingDate'>;

function regasoftFieldsOf(d: SrvRegasoftFields): Partial<SrvIndex> {
  return {
    rGender:       genderOf(d.gender),
    rMobile:       d.mobile ?? '',
    rTelefon:      d.telefon ?? '',
    rCountryId:    String(d.countryId ?? ''),
    rLeavingDate:  d.leavingDate ?? '',
    rDateOfDeath:  d.dateOfDeath ?? '',
    rInactiveDate: d.inactiveDate ?? '',
    rEntryDate:    d.entryDate ?? '',
    rDateOfExit:   d.leavingDate || d.dateOfDeath || '',   // passive (inactiveDate) is not an exit
  };
}

/**
 * The index fields a raw Regasoft record (as `updateSrvContact` returns it in `after`) changes:
 * same mapping as the detail enrichment, with the ISO datetimes converted to StoreDates.
 */
function indexPatchFromRaw(rec: Record<string, unknown>): Partial<SrvIndex> {
  const str = (k: string) => (typeof rec[k] === 'string' ? (rec[k] as string) : '');
  const num = (k: string) => (typeof rec[k] === 'number' ? (rec[k] as number) : null);
  const date = (k: string) => regasoftDateToStoreDate(str(k));
  return {
    ...regasoftFieldsOf({
      gender: num('gender') ?? 0, mobile: str('mobile'), telefon: str('telefon'), countryId: num('countryId'),
      entryDate: date('entryDate'), inactiveDate: date('inactiveDate'), dateOfDeath: date('dateOfDeath'), leavingDate: date('leavingDate'),
    }),
    rFirstName:   str('firstName'),
    rLastName:    str('lastName'),
    rEmail:       str('email'),
    rStreet:      str('street'),
    rZipCode:     str('postcode'),
    rCity:        str('city'),
    rDateOfBirth: date('birthday'),
    rDetailLoaded: true,   // the record read back is the complete detail record
  };
}

function buildIndexEntry(
  m: MembershipModel | undefined,
  p: MembershipModel | undefined,
  r: SrvContact | undefined,
  person: PersonModel | undefined,
  postal?: AddressModel,
  dob = '',                                       // full dob from the vault (spec 1.19 Phase 4)
  dod = '',                                       // full dod from the vault
  contact?: { email: string; phone: string },     // from the address-directory projection
  countries: readonly SrvCountry[] = []           // Regasoft's country list (spec 1.133 C3)
): SrvIndex {
  const mPassiveSince = m && m.category === 'passive' ? (m.dateOfEntry ?? '') : '';
  const firstName = m?.memberName1 ?? r?.firstName ?? p?.memberName1 ?? '';
  const lastName  = m?.memberName2 ?? r?.lastName  ?? p?.memberName2 ?? '';
  const serviceIdPart = (r?.serviceId != null ? String(r.serviceId) : '') || (p?.memberId ?? '');
  const ridPart       = r ? String(r.srvId) : '';
  return {
    key:        getFullName(firstName, lastName).trim().toLowerCase(),
    indexField: `f:${firstName} l:${lastName} s:${serviceIdPart} r:${ridPart}`.toLowerCase(),
    firstName,
    lastName,

    mKey:        m?.okey ?? '',
    personKey:   m?.memberKey ?? '',
    mDateOfExit: m?.dateOfExit ?? '',
    dateOfBirth: dob,
    gender:      m?.memberType ?? '',
    state:       m?.state ?? '',
    mCategory:   memberCatAbbr(m?.category ?? ''),
    mEmail:      contact?.email ?? '',
    mPhone:      contact?.phone ?? '',
    mStreet:     postal ? `${postal.streetName} ${postal.streetNumber}`.trim() : '',
    mZipCode:    postal?.zipCode ?? person?.favZipCode ?? '',
    mCity:       postal?.city ?? '',
    mCountryCode:  postal?.countryCode ?? '',
    mCountryId:    String(countryIdOf(postal?.countryCode ?? '', countries) ?? ''),
    mDateOfDeath:  dod,
    mPassiveSince,

    pKey:        p?.okey ?? '',
    memberId:    p?.memberId ?? '',
    pDateOfExit: p?.dateOfExit ?? '',
    pState:      p?.state ?? '',
    pCategory:   parentCatAbbr(p?.category ?? ''),

    rid:              r ? String(r.srvId) : '',
    rServiceId:       r?.serviceId != null ? String(r.serviceId) : '',
    rFirstName:       r?.firstName ?? '',
    rLastName:        r?.lastName ?? '',
    rEmail:           r?.email ?? '',
    rGender:          genderOf(r?.gender),
    rMobile:          r?.mobile ?? '',
    rTelefon:         r?.telefon ?? '',
    rStreet:          r?.street ?? '',
    rZipCode:         r?.postcode ?? '',
    rCity:            r?.city ?? '',
    rCountryId:       '',
    rDateOfBirth:     r?.dateOfBirth ?? '',
    rCategory:        srvCategoryOf(r?.membershipType),
    rDateOfExit:      r?.leavingDate || r?.dateOfDeath || '',
    rLeavingDate:     r?.leavingDate ?? '',
    rDateOfDeath:     r?.dateOfDeath ?? '',
    rInactiveDate:    '',
    rEntryDate:       '',
    nationIOC:        r?.nationIOC ?? '',
    hasNewsletter:    r?.hasNewsletter ?? false,
    mainClub:         r?.mainClub ?? false,
    clubs:            r?.clubs?.map(c => c.clubName) ?? [],
    licenseId:            r?.licenseId != null ? String(r.licenseId) : '',
    licenseValidUntil:    r?.licenseValidUntil ?? '',
    licenseImage:         null,
    licenseImageName:     null,
    licenseImageMimeType: null,
    rDetailLoaded:        false,   // set by the detail enrichment in buildIndex
  };
}

/** Fill the Regasoft detail fields of an index entry (from `/all`, spec 1.133 C1). */
function applyDetail(entry: SrvIndex, detail: SrvMemberLicenseDetail): void {
  entry.hasNewsletter      = detail.hasNewsletter;
  entry.rStreet            = detail.street;
  entry.rZipCode           = detail.postcode;
  entry.rCity              = detail.city;
  entry.licenseId          = detail.licenseId;
  entry.licenseValidUntil  = detail.licenseValidUntil;
  entry.licenseImage       = detail.licenseImage;
  entry.licenseImageName   = detail.licenseImageName;
  entry.licenseImageMimeType = detail.licenseImageMimeType;
  Object.assign(entry, regasoftFieldsOf(detail));
  entry.clubs              = detail.clubs.map(c => c.mainClub ? '!' + c.clubName : c.clubName);
  entry.rDetailLoaded      = true;
}

function storageKey(tenantId: string): string {
  return `okr-aoc-srv-index-v4-${tenantId}`;   // v4: entries carry mCountryId and the C2 categories (spec 1.133)
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
    localStorage.removeItem(`okr-aoc-srv-index-${tenantId}`);      // v1 cache lacks the 1.133 fields
    localStorage.removeItem(`okr-aoc-srv-index-v2-${tenantId}`);   // v2 cache lacks rDetailLoaded
    localStorage.removeItem(`okr-aoc-srv-index-v3-${tenantId}`);   // v3 cache lacks mCountryId, honorary is 'H'
    const raw = localStorage.getItem(storageKey(tenantId));
    return raw ? (JSON.parse(raw) as SrvIndex[]) : [];
  } catch { return []; }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const MembershipSrvStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    personService: inject(PersonService),
    membershipService: inject(MembershipService),
    externalReportService: inject(ExternalReportService),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    alertController: inject(AlertController),
    router: inject(Router),
    ownershipService: inject(OwnershipService),
    i18nService: inject(I18nService),
    personEditModal: inject(PERSON_EDIT_MODAL, { optional: true }),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(MEMBERSHIP_I18N_KEYS),
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
          .pipe(debugListLoaded<MembershipModel>('MembershipSrvStore.mainMemberships', params.currentUser));
      },
    }),
  })),

  // Parent memberships: orgKey = PARENT_ORG 
  withProps((store) => ({
    parentMembershipsResource: rxResource({
      params: () => ({ currentUser: store.currentUser() }),
      stream: ({ params }) => {
        const query = getSystemQuery(store.tenantId());
        query.push({ key: 'orgKey',          operator: '==', value: PARENT_ORG });
        query.push({ key: 'memberModelType', operator: '==', value: 'person' });
        query.push({ key: 'orgModelType',    operator: '==', value: 'org' });
        return store.firestoreService
          .searchData<MembershipModel>(MembershipCollection, query, 'memberName2', 'asc')
          .pipe(debugListLoaded<MembershipModel>('MembershipSrvStore.parentMemberships', params.currentUser));
      },
    }),
  })),


  withComputed(state => ({
    // One membership per person: the one in force today (a category change entered in advance
    // leaves two current ones; the future category must not reach Regasoft early, spec 1.133 C2).
    mainPicks: computed(() =>
      pickSrvMemberships(state.mainMembershipsResource.value() ?? [], getTodayStr(DateFormat.StoreDate))
    ),
    parentPicks: computed(() =>
      pickSrvMemberships(state.parentMembershipsResource.value() ?? [], getTodayStr(DateFormat.StoreDate))
    ),
  })),

  withComputed(state => ({
    // The current (not ended) members
    mainMemberships: computed(() => state.mainPicks().filter(p => !p.ended).map(p => p.membership)),
    parentMemberships: computed(() => state.parentPicks().filter(p => !p.ended).map(p => p.membership)),
    isLoading: computed(() =>
      state.mainMembershipsResource.isLoading() || state.parentMembershipsResource.isLoading()
    ),
    foreignNationMembers: computed(() =>
      state.index().filter(i => !!i.nationIOC && i.nationIOC !== 'SUI')
    ),
    doubleMembers: computed(() =>
      state.index().filter(i => (i && i.clubs.length > 1))
    ),
    /** Sekretariat cases (spec 1.133 §8) not yet marked in `external-reports`. Unknown marks count as «not reported». */
    openSekretariatCases: computed(() => {
      const reported = new Set(state.reportedKeys() ?? []);
      return getSekretariatCases(state.index()).filter(c => !reported.has(c.caseKey));
    }),
    mcat:    computed(() => state.appStore.allCategories()?.find(c => c.name === 'mcat_scs')),
    genders: computed(() => state.appStore.getCategory('gender')),
  })),

  withComputed(state => ({
    /** Regasoft record ids with at least one open Sekretariat case: the entries of the `sekretariat` filter. */
    sekretariatRids: computed(() => new Set(state.openSekretariatCases().map(c => c.externalRef))),
  })),

  withMethods(store => ({

    setSearchTerm(searchTerm: string) { patchState(store, { searchTerm }); },
    setFilter(selectedFilter: string) { patchState(store, { selectedFilter }); },
    resetIndex() {
      patchState(store, { index: [], inactiveIndex: [], builtThisSession: false });
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

      // One pick per person: the membership in force today, else the last one (possibly ended).
      const mainPicks   = store.mainPicks();
      const parentPicks = store.parentPicks();

      // ── Lookup maps ──────────────────────────────────────────────────────
      const parentByMemberKey = new Map<string, SrvMembershipPick<MembershipModel>>();
      for (const pick of parentPicks) parentByMemberKey.set(pick.membership.memberKey, pick);

      // ── Fetch Regasoft contacts ──────────────────────────────────────────
      const functions = getFunctions(getApp(), 'europe-west6');
      if (store.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      // One call: current members and members who left, both with the full detail, and the
      // country list (spec 1.133 C1, C3). Replaces the member list plus one detail read per member.
      let all: SrvMembersAllResult;
      try {
        const fn = httpsCallable<{ op: string }, SrvMembersAllResult>(functions, 'srv');
        all = (await fn({ op: 'getSrvMembersAll' })).data;
      } catch (e) {
        console.error('MembershipSrvStore.buildIndex: getSrvMembersAll failed', e);
        // Without the Regasoft side every row would read «nur in BK»: say why and leave the index as it was.
        await showToast(store.toastController, store.i18n.srv_index_error());
        return;
      }
      const countries = all.countries;
      const regasoftContacts: SrvContact[] = all.members.filter(m => m.active).map(m => m.contact);
      const leftContacts: SrvContact[]     = all.members.filter(m => !m.active).map(m => m.contact);
      const detailByRid = new Map(all.members.map(m => [m.contact.srvId, m.detail]));
      patchState(store, { regasoftItems: regasoftContacts.length, countries });
      console.log(`MembershipSrvStore.buildIndex: ${regasoftContacts.length} current and ${leftContacts.length} former Regasoft members, ${countries.length} countries`);

      // Matching rules (re-join, ended members, birth date for members who left): makeSrvMatcher.
      const findRegasoft = makeSrvMatcher(regasoftContacts, leftContacts);

      const processedParentKeys    = new Set<string>();
      const processedRegasoftIds   = new Set<number>();
      const index: SrvIndex[] = [];

      // Batch-load all favorite postal addresses once for the whole index build
      const postalQuery = getSystemQuery(store.tenantId());
      postalQuery.push({ key: 'addressChannel', operator: '==', value: 'postal' });
      postalQuery.push({ key: 'isFavorite', operator: '==', value: true });
      const allPostalAddresses = await store.firestoreService.getDataOnce<AddressModel>(AddressCollection, postalQuery, 'none');
      const postalByPersonKey = new Map<string, AddressModel>();
      for (const a of allPostalAddresses) {
        if (a.parentKey?.startsWith('person.')) {
          postalByPersonKey.set(a.parentKey.substring('person.'.length), a);
        }
      }

      // Batch-load all dob vault addresses once (spec 1.19 Phase 4: dob lives only in
      // the vault; the AOC console runs as admin = privileged, raw read is allowed)
      const dobQuery = getSystemQuery(store.tenantId());
      dobQuery.push({ key: 'addressChannel', operator: '==', value: 'dob' });
      const allDobAddresses = await store.firestoreService.getDataOnce<AddressModel>(AddressCollection, dobQuery, 'none');
      const dobByPersonKey = new Map<string, string>();
      for (const a of allDobAddresses) {
        if (a.parentKey?.startsWith('person.')) {
          dobByPersonKey.set(a.parentKey.substring('person.'.length), a.dob ?? '');
        }
      }

      // Batch-load all dod vault addresses once, exactly like dob
      const dodQuery = getSystemQuery(store.tenantId());
      dodQuery.push({ key: 'addressChannel', operator: '==', value: 'dod' });
      const allDodAddresses = await store.firestoreService.getDataOnce<AddressModel>(AddressCollection, dodQuery, 'none');
      const dodByPersonKey = new Map<string, string>();
      for (const a of allDodAddresses) {
        if (a.parentKey?.startsWith('person.')) {
          dodByPersonKey.set(a.parentKey.substring('person.'.length), a.dod ?? '');
        }
      }

      // ── Process main memberships ─────────────────────────────────────────
      for (const { membership: m, ended } of mainPicks) {
        const parentPick = parentByMemberKey.get(m.memberKey);
        // A current member takes only a current parent membership; an ended one also an ended
        // parent membership, which still holds the SRV number that links the Regasoft record.
        const p = parentPick && (!parentPick.ended || ended) ? parentPick.membership : undefined;

        const r = findRegasoft({
          memberId: p?.memberId, firstName: m.memberName1, lastName: m.memberName2,
          dateOfBirth: dobByPersonKey.get(m.memberKey) ?? '', ended,
        });
        // An ended membership stays in the index only while Regasoft still lists the member as
        // current, so its exit and death dates reach Regasoft (spec 1.133 I1); otherwise it is gone.
        if (ended && !r) continue;
        if (parentPick?.membership.okey) processedParentKeys.add(parentPick.membership.okey);
        if (r) processedRegasoftIds.add(r.srvId);

        const person = store.appStore.getPerson(m.memberKey);
        const postal = postalByPersonKey.get(m.memberKey);
        const dob = dobByPersonKey.get(m.memberKey) ?? '';
        const dod = dodByPersonKey.get(m.memberKey) ?? '';
        const directory = store.appStore.getDirectoryEntry(`person.${m.memberKey}`);
        const contact = { email: directory?.favEmail ?? '', phone: directory?.favPhone ?? '' };
        index.push(buildIndexEntry(m, p, r, person, postal, dob, dod, contact, countries));
      }

      // ── Orphan parent memberships (no matching main) ─────────────────────
      for (const { membership: p, ended } of parentPicks) {
        if (p.okey && processedParentKeys.has(p.okey)) continue;

        const r = findRegasoft({ memberId: p.memberId, firstName: p.memberName1, lastName: p.memberName2, ended });
        if (ended && !r) continue;
        if (r) processedRegasoftIds.add(r.srvId);

        index.push(buildIndexEntry(undefined, p, r, undefined));
      }

      // ── Orphan Regasoft contacts (no matching main or parent) ────────────
      for (const r of regasoftContacts) {
        if (processedRegasoftIds.has(r.srvId)) continue;
        index.push(buildIndexEntry(undefined, undefined, r, undefined));
      }
      // Members who left and match none of ours: not listed, only kept for the duplicate guard (D8).
      const inactiveIndex = leftContacts
        .filter(r => !processedRegasoftIds.has(r.srvId))
        .map(r => buildIndexEntry(undefined, undefined, r, undefined));

      index.sort((a, b) => {
        const nameA = a.lastName || a.rLastName;
        const nameB = b.lastName || b.rLastName;
        return nameA.localeCompare(nameB);
      });

      // ── Regasoft detail: every record from /all carries it ──────────────
      for (const entry of [...index, ...inactiveIndex]) {
        const detail = entry.rid ? detailByRid.get(Number(entry.rid)) : undefined;
        if (detail) applyDetail(entry, detail);
      }
      const multiClubs = index.filter(i => i.clubs.length > 1).length;
      console.log(`MembershipSrvStore.buildIndex: ${multiClubs} entries with more than one club`);

      console.log(`MembershipSrvStore.buildIndex: index built with ${index.length} entries`);
      patchState(store, { index, inactiveIndex, builtThisSession: true });
      saveIndex(store.tenantId(), index);
    },

    async showRegasoftDetail(item: SrvIndex): Promise<void> {
      const modal = await store.modalController.create({
        component: MembershipSrvMismatchModal,
        cssClass: 'wide-modal',
        componentProps: { item },
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

    async editPerson(item: SrvIndex): Promise<void> {
      const person = store.appStore.getPerson(item.personKey);
      if (person && store.personEditModal) {
        const PersonEditModal = await store.personEditModal();
        const modal = await store.modalController.create({
          component: PersonEditModal,
          componentProps: {
              person,
              currentUser: store.currentUser(),
              tagModel: 'person',
              tenantId: store.tenantId(),
              genders: store.appStore.getCategory('gender'),
              readOnly: false
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data) {
          if (isPerson(data, store.tenantId()))
            await store.personService.update(data, store.currentUser());
        }
      }
    },

    async editMember(mKey: string): Promise<void> {
      const membership = (store.mainMembershipsResource.value() ?? []).find(m => m.okey === mKey);
      const mcat = store.mcat();
      if (!membership || !mcat) return;
      const modal = await store.modalController.create({
        component: MembershipEditModal,
        cssClass: 'auto-height-modal',
        componentProps: {
          membership: { ...membership },
          currentUser: store.appStore.currentUser(),
          tagModel: 'membership',
          priv: store.appStore.privacySettings(),
          mcat,
          isNew: false,
          readOnly: false,
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        if (isMembership(data, store.tenantId())) {
          store.membershipService.update(data, store.currentUser());
        }
      }
    },

    async editParentMember(pKey: string): Promise<void> {
      const membership = (store.parentMembershipsResource.value() ?? []).find(m => m.okey === pKey);
      const mcat = store.mcat();
      if (!membership || !mcat) return;
      const modal = await store.modalController.create({
        component: MembershipEditModal,
        cssClass: 'auto-height-modal',
        componentProps: {
          membership: { ...membership },
          currentUser: store.appStore.currentUser(),
          tagModel: 'membership',
          priv: store.appStore.privacySettings(),
          mcat,
          isNew: false,
          readOnly: false,
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        if (isMembership(data, store.tenantId())) {
          store.membershipService.update(data, store.currentUser());
        }
      }
    },

    async createParentMember(item: SrvIndex): Promise<void> {
      const person = store.appStore.getPerson(item.personKey);
      const org = store.appStore.getOrg(PARENT_ORG);
      if (person && org) {
        const cat = store.appStore.getCategoryItemByAbbreviation('mcat_' + org.okey, item.rCategory);
        if (!cat) {
          // An unknown Regasoft membership type gives no category (srvCategoryOf): say so instead of doing nothing.
          await showToast(store.toastController, store.i18n.srv_parent_category_unknown());
          return;
        }
        const defaultDateOfEntry = getYear() + '0101'; // first day of the current year
        const membership = newMembershipForPerson(person, org.okey, org.name, cat, defaultDateOfEntry, getBirthYear(item.dateOfBirth));
        membership.memberId = item.rServiceId;
        store.membershipService.create(membership, store.currentUser());
        store.parentMembershipsResource.reload();
      }
    },

    /**
     * Create the member in Regasoft (spec 1.133, D8/D9). Currently unreachable: the button is hidden
     * and the `srv` function rejects creates until `POST` has been probed (Q7). A record in Regasoft
     * can never be deleted, so the guard runs first: no SRV number without a Regasoft link, no
     * duplicate by name + birth date, then an explicit confirmation of the main-club effect.
     */
    async addToRegasoft(item: SrvIndex): Promise<void> {
      // Only from an index built in this session: a stored one lacks the members who left (the
      // duplicate guard below) and the country list, and a record in Regasoft can never be deleted.
      if (!store.builtThisSession()) {
        await showToast(store.toastController, store.i18n.srv_update_stale());
        return;
      }
      // Members who left count as duplicates too (D8); they are only known after an index build.
      const blocker = srvCreateBlocker(item, [...store.index(), ...store.inactiveIndex()]);
      if (blocker === 'hasSrvNumber') {
        await showToast(store.toastController, store.i18n.srv_create_blocked_srvnumber());
        return;
      }
      if (blocker === 'duplicate') {
        await showToast(store.toastController, store.i18n.srv_create_blocked_duplicate());
        return;
      }

      const alert = await store.alertController.create({
        header: store.i18n.srv_regasoft_add(),
        message: store.i18n.srv_create_mainclub_warning(),
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.srv_regasoft_add(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;

      const functions = getFunctions(getApp(), 'europe-west6');
      if (store.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      const fn = httpsCallable<{ op: string } & Record<string, unknown>, { id: string }>(functions, 'srv');

      // Only what Regasoft accepts on a POST (server: buildSrvCreatePayload). Not sent: fullname,
      // membershipType, nationIOC, language, hasNewsletter, hasLicense, countryName, streetAdditional.
      // A new member is neither exited nor deceased, so only the passive status is derived.
      const phoneClass = item.mPhone ? classifyPhone(item.mPhone) : null;
      const countryId = countryIdOf(item.mCountryCode, store.countries());
      const { inactiveDate } = expectedSrvStatus({
        dateOfDeath: '', dateOfExit: '', category: item.mCategory, passiveSince: item.mPassiveSince, today: getTodayStr(DateFormat.StoreDate),
      });
      try {
        const result = await fn({
          op:          'createSrvContact',
          firstName:   item.firstName,
          lastName:    item.lastName,
          dateOfBirth: item.dateOfBirth,
          gender:      item.gender === 'female' ? 2 : 1,
          email:       item.mEmail || null,
          mobile:      phoneClass === 'mobile' ? item.mPhone : null,
          telefon:     phoneClass === 'telefon' ? item.mPhone : null,
          street:      item.mStreet || null,
          postcode:    item.mZipCode || null,
          city:        item.mCity || null,
          countryId:   countryId === null ? null : String(countryId),
          inactiveDate: inactiveDate || null,
        });
        const srvId = String(result.data.id);
        const index = store.index().map(i => i.key === item.key
          ? { ...i, memberId: srvId, rid: srvId, rServiceId: srvId, rFirstName: item.firstName, rLastName: item.lastName }
          : i
        );
        patchState(store, { index });
        saveIndex(store.tenantId(), index);
        await showToast(store.toastController, store.i18n.srv_create_done());
      } catch (e) {
        // e.g. failed-precondition while the server still blocks Regasoft creates
        console.error('MembershipSrvStore.addToRegasoft: createSrvContact failed', e);
        await showToast(store.toastController, store.i18n.srv_create_error());
      }
    },

    /**
     * Update a Regasoft member from our data (spec 1.133): change set → server preview →
     * confirmation → update. Nothing is sent without the user's confirmation, nor from an index
     * that was not built in this app session.
     */
    async updateRegasoft(item: SrvIndex): Promise<void> {
      if (!item.rid) return;
      // Only from an index built in this session: a cached one may hold outdated club data (I6).
      if (!store.builtThisSession()) {
        await showToast(store.toastController, store.i18n.srv_update_stale());
        return;
      }
      const changes = getSrvChanges(item, getTodayStr(DateFormat.StoreDate));
      if (Object.keys(changes).length === 0) {
        await showToast(store.toastController, store.i18n.srv_preview_nothing());
        return;
      }

      const functions = getFunctions(getApp(), 'europe-west6');
      if (store.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      const input = { srvId: Number(item.rid), changes };

      try {
        const previewFn = httpsCallable<{ op: string; srvId: number; changes: SrvChanges }, SrvPreview>(functions, 'srv');
        const preview = (await previewFn({ op: 'previewSrvUpdate', ...input })).data;

        const modal = await store.modalController.create({
          component: MembershipSrvPreviewModal,
          cssClass: 'wide-modal',
          componentProps: { preview, i18n: store.i18n },
        });
        await modal.present();
        const { role } = await modal.onDidDismiss();
        if (role !== 'confirm') return;

        const updateFn = httpsCallable<{ op: string; srvId: number; changes: SrvChanges }, SrvUpdateResult>(functions, 'srv');
        const { after, written, ignored } = (await updateFn({ op: 'updateSrvContact', ...input })).data;

        // Show the new Regasoft values in the row without rebuilding the index.
        const patch = indexPatchFromRaw(after);
        const index = store.index().map(i => i.rid === item.rid ? { ...i, ...patch } : i);
        patchState(store, { index });
        saveIndex(store.tenantId(), index);

        // One message: what was written, plus the fields Regasoft did not take over.
        let message = fill(store.i18n.srv_update_done(), { count: written.length });
        if (ignored.length > 0) {
          message += ' ' + fill(store.i18n.srv_update_ignored(), { fields: ignored.join(', ') });
        }
        await showToast(store.toastController, message);
      } catch (e) {
        // e.g. failed-precondition while the server still blocks Regasoft writes
        console.error('MembershipSrvStore.updateRegasoft failed', e);
        await showToast(store.toastController, store.i18n.srv_update_error());
      }
    }
  })),

  // Sekretariat report (spec 1.133 §8): what the Regasoft API cannot do goes to the SRV Sekretariat
  // by mail; the sent cases are marked in `external-reports`. A second block, because it calls
  // `refreshReported` (methods of one block cannot see each other).
  withMethods(store => ({

    /** Reads the already reported cases. A failed read leaves `reportedKeys` null and says so. */
    async refreshReported(): Promise<boolean> {
      try {
        const marks = await store.externalReportService.listReported(store.tenantId(), SRV_EXTERNAL_ORG);
        patchState(store, { reportedKeys: marks.map(m => m.caseKey) });
        return true;
      } catch (e) {
        console.error('MembershipSrvStore.refreshReported failed', e);
        patchState(store, { reportedKeys: null });
        return false;
      }
    },
  })),

  withMethods(store => ({

    /**
     * Opens a mail draft with all cases not reported yet, then asks whether it was sent and only then
     * marks the cases. Everything up to the draft runs synchronously inside the click (a clipboard write
     * needs the user gesture), so the marks must already be loaded; otherwise they are read first.
     */
    async reportToSekretariat(): Promise<void> {
      if (store.reportedKeys() === null && !(await store.refreshReported())) {
        await showToast(store.toastController, store.i18n.srv_sekretariat_error());
        return;
      }
      const cases = store.openSekretariatCases();
      if (cases.length === 0) {
        await showToast(store.toastController, store.i18n.srv_sekretariat_none());
        return;
      }

      const mail = composeSekretariatMail(cases, store.appStore.appConfig().appName);
      const url = mailtoUrl(mail);
      if (url) {
        window.location.href = url;
      } else {
        // Too long for a mailto: draft (the first report holds the backlog): the text goes to the
        // clipboard, the draft carries the subject only. The write starts before anything is awaited.
        const copied = copyToClipboardDeferred(Promise.resolve(mail.body));
        window.location.href = `mailto:?subject=${encodeURIComponent(mail.subject)}`;
        try {
          await copied;
        } catch (e) {
          console.error('MembershipSrvStore.reportToSekretariat: clipboard failed', e);
          await showToast(store.toastController, store.i18n.srv_sekretariat_clipboard_error());
          return;
        }
        await showToast(store.toastController, store.i18n.srv_sekretariat_clipboard());
      }

      const alert = await store.alertController.create({
        header: store.i18n.srv_sekretariat_action(),
        message: store.i18n.srv_sekretariat_sent(),
        buttons: [
          { text: store.i18n.srv_sekretariat_no(), role: 'cancel' },
          { text: store.i18n.srv_sekretariat_yes(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;

      try {
        await store.externalReportService.markReported(store.tenantId(), cases, getTodayStr(DateFormat.StoreDate));
        await store.refreshReported();
        await showToast(store.toastController, store.i18n.srv_sekretariat_marked());
      } catch (e) {
        console.error('MembershipSrvStore.reportToSekretariat: markReported failed', e);
        await showToast(store.toastController, store.i18n.srv_sekretariat_mark_error());
      }
    },
  }))
);
