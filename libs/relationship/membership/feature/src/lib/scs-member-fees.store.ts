import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import {
  MembershipCollection, MembershipModel,
  OwnershipCollection, OwnershipModel,
  ScsMemberFeesModel,
} from '@bk2/shared-models';
import { confirm, showToast } from '@bk2/shared-util-angular';
import {
  DateFormat, debugListLoaded, getSystemQuery, getTodayStr, isAfterDate, nameMatches,
} from '@bk2/shared-util-core';

import { ScsMemberFeeService, convertMembershipToFee, getFeeTotal } from '@bk2/relationship-membership-data-access';
import { MembershipEditModalComponent } from './membership-edit.modal';

export type ScsMemberFeesState = {
  searchTerm: string;
  selectedMcat: string;
  version: number;
};

const initialState: ScsMemberFeesState = {
  searchTerm: '',
  selectedMcat: 'all',
  version: 0,
};

export const _ScsMemberFeesStore = signalStore(
  withState(initialState),
  withProps(() => {
    const appStore = inject(AppStore);
    const functions = getFunctions(getApp(), 'europe-west6');
    if (appStore.env.useEmulators) {
      connectFunctionsEmulator(functions, 'localhost', 5001);
    }
    return {
      scsMemberFeeService: inject(ScsMemberFeeService),
      appStore,
      firestoreService: inject(FirestoreService),
      modalController: inject(ModalController),
      toastController: inject(ToastController),
      alertController: inject(AlertController),
      functions,
    };
  }),

  withProps((store) => ({
    // All memberships of this tenant (active/passive/etc.) — filtered locally
    allMembershipsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        version: store.version(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([]);
        const query = getSystemQuery(store.appStore.tenantId());
        query.push({ key: 'memberModelType', operator: '==', value: 'person' });
        return store.firestoreService.searchData<MembershipModel>(MembershipCollection, query, 'memberName2', 'asc').pipe(
          debugListLoaded('ScsMemberFeesStore.allMemberships', params.currentUser)
        );
      },
    }),

    // All locker ownerships — filtered locally by ownerKey and validTo
    allLockerOwnershipsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        version: store.version(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([]);
        const query = getSystemQuery(store.appStore.tenantId());
        query.push({ key: 'resourceType', operator: '==', value: 'locker' });
        return store.firestoreService.searchData<OwnershipModel>(OwnershipCollection, query, 'ownerName2', 'asc').pipe(
          debugListLoaded('ScsMemberFeesStore.allLockerOwnerships', params.currentUser)
        );
      },
    }),

    // Persisted fee records from scs-memberfees collection
    feeRecordsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        version: store.version(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([]);
        return store.scsMemberFeeService.list();
      },
    }),
  })),

  withComputed((store) => ({
    isLoading: computed(() =>
      store.allMembershipsResource.isLoading() ||
      store.allLockerOwnershipsResource.isLoading() ||
      store.feeRecordsResource.isLoading()
    ),
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId: computed(() => store.appStore.tenantId()),

    // current active+passive memberships of the default org
    defaultOrgMemberships: computed(() => {
      const today = getTodayStr();
      const orgId = store.appStore.defaultOrg()?.bkey ?? store.appStore.tenantId();
      return store.allMembershipsResource.value()?.filter((m: MembershipModel) => 
        m.orgKey === orgId && 
        m.orgModelType === 'org' &&
        isAfterDate(m.dateOfExit, today) &&
        (m.state === 'active' || m.state === 'passive')
      ) ?? [];
    }),

    // SRV memberships indexed by memberKey
    srvMembershipsByKey: computed(() => {
      const today = getTodayStr();
      const map = new Map<string, MembershipModel>();
      store.allMembershipsResource.value()?.filter((m: MembershipModel) => 
        m.orgKey === 'srv' &&
        m.orgModelType === 'org' &&
        isAfterDate(m.dateOfExit, today)
      ).forEach((m: MembershipModel) => map.set(m.memberKey, m));
      return map;
    }),

    // locker ownerships active today, indexed by ownerKey
    lockerOwnerKeys: computed((): Set<string> => {
      const today = getTodayStr(DateFormat.StoreDate);
      const keys = new Set<string>();
      store.allLockerOwnershipsResource.value()?.filter((o: OwnershipModel) => 
        isAfterDate(o.validTo, today)
      ).forEach((o: OwnershipModel) => keys.add(o.ownerKey));
      return keys;
    }),

    // persisted fee records indexed by member key
    feeRecordsByMemberKey: computed(() => {
      const map = new Map<string, ScsMemberFeesModel>();
      store.feeRecordsResource.value()?.forEach((f: ScsMemberFeesModel) => {
        if (f.member?.key) map.set(f.member.key, f);
      });
      return map;
    }),

    mcatScs: computed(() => store.appStore.allCategories()?.find(c => c.name === 'mcat_scs')),
    mcatSrv: computed(() => store.appStore.allCategories()?.find(c => c.name === 'mcat_srv')),
    mcatScsCategory: computed(() => store.appStore.allCategories()?.find(c => c.name === 'mcat_scs')),
  })),

  withComputed((store) => ({
    // Merged list: persisted records take priority; generated models fill in the rest
    feeModels: computed((): ScsMemberFeesModel[] => {
      const currentYear = getTodayStr(DateFormat.Year);
      const tenantId = store.tenantId();
      const srvMap = store.srvMembershipsByKey();
      const lockerKeys = store.lockerOwnerKeys();
      const feeMap = store.feeRecordsByMemberKey();
      const mcatScs = store.mcatScs();
      const mcatSrv = store.mcatSrv();

      return store.defaultOrgMemberships().map((membership: MembershipModel) => {
        const existing = feeMap.get(membership.memberKey);
        if (existing) return existing;
        return convertMembershipToFee(
          membership,
          srvMap.get(membership.memberKey),
          lockerKeys.has(membership.memberKey),
          mcatScs,
          mcatSrv,
          currentYear,
          tenantId
        );
      });
    }),

    membershipsByMemberKey: computed(() => {
      const map = new Map<string, MembershipModel>();
      store.defaultOrgMemberships().forEach((m: MembershipModel) => map.set(m.memberKey, m));
      return map;
    }),

    mcatCategory: computed(() => store.appStore.allCategories()?.find(c => c.name === 'mcat_scs')),
  })),

  withComputed((store) => ({
    filteredFees: computed((): ScsMemberFeesModel[] => {
      const searchTerm = store.searchTerm().toLowerCase();
      const selectedMcat = store.selectedMcat();
      let fees = store.feeModels();
      if (selectedMcat && selectedMcat !== 'all') {
        fees = fees.filter(f => f.category === selectedMcat);
      }
      if (searchTerm) {
        fees = fees.filter(f => nameMatches(f.index, searchTerm));
      }
      return fees;
    }),
  })),

  withMethods((store) => ({
    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },
    setSelectedMcat(selectedMcat: string): void {
      patchState(store, { selectedMcat });
    },
    refreshData(): void {
      patchState(store, { version: store.version() + 1 });
    },

    getTotal(fee: ScsMemberFeesModel): number {
      return getFeeTotal(fee);
    },

    /**
     * Save an edited fee record to Firestore and reload.
     */
    async saveFee(fee: ScsMemberFeesModel): Promise<void> {
      await store.scsMemberFeeService.save(fee, store.appStore.currentUser() ?? undefined);
      patchState(store, { version: store.version() + 1 });
    },

    /**
     * Generate and persist fee records for all default org members that don't have one yet.
     */
    async generateFees(): Promise<void> {
      const confirmed = await confirm(store.alertController, '@finance.scsMemberFee.operation.generate.confirm', true);
      if (!confirmed) return;

      const currentYear = getTodayStr(DateFormat.Year);
      const tenantId = store.tenantId();
      const srvMap = store.srvMembershipsByKey();
      const lockerKeys = store.lockerOwnerKeys();
      const feeMap = store.feeRecordsByMemberKey();
      const mcatScs = store.mcatScs();
      const mcatSrv = store.mcatSrv();
      const currentUser = store.appStore.currentUser() ?? undefined;

      const saves = store.defaultOrgMemberships()
        .filter((m: MembershipModel) => !feeMap.has(m.memberKey))
        .map((m: MembershipModel) => {
          const fee = convertMembershipToFee(
            m,
            srvMap.get(m.memberKey),
            lockerKeys.has(m.memberKey),
            mcatScs,
            mcatSrv,
            currentYear,
            tenantId
          );
          return store.scsMemberFeeService.save(fee, currentUser);
        });

      await Promise.all(saves);
      patchState(store, { version: store.version() + 1 });
      await showToast(store.toastController, '@finance.scsMemberFee.operation.generate.conf');
    },

    /**
     * Delete a fee record (only those already persisted).
     */
    async deleteFee(fee: ScsMemberFeesModel): Promise<void> {
      if (!fee.bkey) return;
      const confirmed = await confirm(store.alertController, '@finance.scsMemberFee.operation.delete.confirm', true);
      if (!confirmed) return;
      await store.scsMemberFeeService.delete(fee, store.appStore.currentUser() ?? undefined);
      patchState(store, { version: store.version() + 1 });
    },

    /**
     * Upload a fee record to Bexio by calling the createBexioInvoice Cloud Function.
     */
    async uploadToBexio(fee: ScsMemberFeesModel): Promise<void> {
      if (!fee.memberBexioId) {
        await showToast(store.toastController, '@finance.scsMemberFee.operation.upload.noBexioId');
        return;
      }
      const fn = httpsCallable<{
        title: string;
        bexioId: string;
        header?: string;
        footer?: string;
        positions?: { text: string; unit_price: number; account_id: number; amount: number }[];
      }, { id: string }>(store.functions, 'createBexioInvoice');

      const total = getFeeTotal(fee);
      const positions = buildBexioPositions(fee);
      await fn({
        title: `Jahresbeitrag ${getTodayStr(DateFormat.Year)} – ${fee.member?.name2 ?? ''}`,
        bexioId: fee.memberBexioId,
        positions,
      });

      // Mark as uploaded
      const updated: ScsMemberFeesModel = { ...fee, state: 'uploaded' };
      await store.scsMemberFeeService.save(updated, store.appStore.currentUser() ?? undefined);
      patchState(store, { version: store.version() + 1 });
      await showToast(store.toastController, '@finance.scsMemberFee.operation.upload.conf');
    },

    /**
     * Download a Bexio invoice PDF for a fee record.
     */
    async downloadPdf(fee: ScsMemberFeesModel): Promise<void> {
      const fn = httpsCallable<{ invoiceId: string }, { content: string }>(
        store.functions, 'showInvoicePdf'
      );
      const memberName = `${fee.member?.name2 ?? ''}_${fee.member?.name1 ?? ''}`;
      const result = await fn({ invoiceId: fee.bkey });
      const bytes = Uint8Array.from(atob(result.data.content), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${memberName}_${getTodayStr(DateFormat.Year)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },

    /**
     * Open the MembershipEditModal for the membership of a fee record.
     */
    async editMembership(fee: ScsMemberFeesModel, readOnly = false): Promise<void> {
      const memberKey = fee.member?.key;
      if (!memberKey) return;
      const membership = store.membershipsByMemberKey().get(memberKey);
      if (!membership) return;
      const mcat = store.mcatCategory();
      if (!mcat) return;
      const modal = await store.modalController.create({
        component: MembershipEditModalComponent,
        componentProps: {
          membership: { ...membership },
          currentUser: store.appStore.currentUser(),
          tags: '',
          priv: store.appStore.privacySettings(),
          mcat,
          isNew: false,
          readOnly,
        },
      });
      await modal.present();
    },
  })),
);

/**
 * Build Bexio invoice positions from a ScsMemberFeesModel.
 */
function buildBexioPositions(fee: ScsMemberFeesModel): { text: string; unit_price: number; account_id: number; amount: number }[] {
  const positions: { text: string; unit_price: number; account_id: number; amount: number }[] = [];
  const addPos = (text: string, unit_price: number, account_id = 159) => {
    if (unit_price !== 0) positions.push({ text, unit_price, account_id, amount: 1 });
  };

  addPos('Jahresbeitrag SCS', fee.jb);
  addPos('Jahresbeitrag SRV', fee.srv, 159);
  addPos('Jahresbeitrag BEV', fee.bev, 159);
  addPos('Eintrittsgeld', fee.entryFee, 159);
  addPos('Schliessfach', fee.locker, 284);
  addPos('Hallentraining', fee.hallenTraining, 284);
  addPos('Skiff', fee.skiff, 284);
  addPos('Skiff-Versicherung', fee.skiffInsurance, 284);
  if (fee.rebate > 0) addPos(`Rabatt (${fee.rebateReason})`, -fee.rebate, 159);
  return positions;
}

@Injectable({ providedIn: 'root' })
export class ScsMemberFeesStore extends _ScsMemberFeesStore {
  constructor() { super(); }
}
