import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { doc } from 'firebase/firestore';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { ExportFormat, INVOICE_STATE, MembershipCollection, MembershipModel, OwnershipCollection, OwnershipModel, ScsMemberFeesCollection, ScsMemberFeesModel } from '@bk2/shared-models';
import { confirm, exportXlsx, showToast } from '@bk2/shared-util-angular';
import { DateFormat, debugListLoaded, generateRandomString, getDataRow, getSystemQuery, getTodayStr, getYear, isAfterDate, nameMatches } from '@bk2/shared-util-core';

import { ActivityService } from '@bk2/activity-data-access';

import { ScsMemberFeeService, convertMembershipToFee, getFeeTotal, getTemplateId } from '@bk2/relationship-membership-data-access';
import { MembershipEditModalComponent } from './membership-edit.modal';
import { ScsMemberFeeInvoiceIdModal } from './scs-member-fee-invoice-id.modal';
import { ScsMemberFeeUploadModal } from './scs-member-fee-upload.modal';
import { ScsMemberFeesTotalsModal } from './scs-member-fees-totals.modal';
import { ExportFormats } from '@bk2/shared-categories';

export type ScsMemberFeesState = {
  searchTerm: string;
  selectedMcat: string;
  selectedState: string;
  version: number;
};

const initialState: ScsMemberFeesState = {
  searchTerm: '',
  selectedMcat: 'all',
  selectedState: 'all',
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
      activityService: inject(ActivityService),
      modalController: inject(ModalController),
      toastController: inject(ToastController),
      alertController: inject(AlertController),
      functions,
    };
  }),

  withProps((state) => ({
    // All memberships of this tenant (active/passive/etc.) — filtered locally
    allMembershipsResource: rxResource({
      params: () => ({
        currentUser: state.appStore.currentUser(),
        version: state.version(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([]);
        const query = getSystemQuery(state.appStore.tenantId());
        query.push({ key: 'memberModelType', operator: '==', value: 'person' });
        return state.firestoreService.searchData<MembershipModel>(MembershipCollection, query, 'memberName2', 'asc').pipe(
          debugListLoaded('ScsMemberFeesStore.allMemberships', params.currentUser)
        );
      },
    }),

    // All locker ownerships — filtered locally by ownerKey and validTo
    allLockerOwnershipsResource: rxResource({
      params: () => ({
        currentUser: state.appStore.currentUser(),
        version: state.version(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([]);
        const query = getSystemQuery(state.appStore.tenantId());
        query.push({ key: 'resourceType', operator: '==', value: 'locker' });
        return state.firestoreService.searchData<OwnershipModel>(OwnershipCollection, query, 'ownerName2', 'asc').pipe(
          debugListLoaded('ScsMemberFeesStore.allLockerOwnerships', params.currentUser)
        );
      },
    }),

    // Persisted fee records from scs-memberfees collection
    feeRecordsResource: rxResource({
      params: () => ({
        currentUser: state.appStore.currentUser(),
        version: state.version(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([]);
        return state.scsMemberFeeService.list();
      },
    }),
  })),

  withComputed((state) => ({
    isLoading: computed(() =>
      state.allMembershipsResource.isLoading() ||
      state.allLockerOwnershipsResource.isLoading() ||
      state.feeRecordsResource.isLoading()
    ),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),

    // current active+passive memberships of the default org
    defaultOrgMemberships: computed(() => {
      const today = getTodayStr();
      const orgId = state.appStore.defaultOrg()?.bkey ?? state.appStore.tenantId();
      return state.allMembershipsResource.value()?.filter((m: MembershipModel) => 
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
      state.allMembershipsResource.value()?.filter((m: MembershipModel) => 
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
      state.allLockerOwnershipsResource.value()?.filter((o: OwnershipModel) => 
        isAfterDate(o.validTo, today)
      ).forEach((o: OwnershipModel) => keys.add(o.ownerKey));
      return keys;
    }),

    // persisted fee records indexed by member key
    feeRecordsByMemberKey: computed(() => {
      const map = new Map<string, ScsMemberFeesModel>();
      state.feeRecordsResource.value()?.forEach((f: ScsMemberFeesModel) => {
        if (f.member?.key) map.set(f.member.key, f);
      });
      return map;
    }),

    mcatScs: computed(() => state.appStore.allCategories()?.find(c => c.name === 'mcat_scs')),
    mcatSrv: computed(() => state.appStore.allCategories()?.find(c => c.name === 'mcat_srv')),
    mcatScsCategory: computed(() => state.appStore.allCategories()?.find(c => c.name === 'mcat_scs')),
  })),

  withComputed((state) => ({
    // Merged list: persisted records take priority; generated models fill in the rest
    allFees: computed((): ScsMemberFeesModel[] => {
      const currentYear = getTodayStr(DateFormat.Year);
      const tenantId = state.tenantId();
      const srvMap = state.srvMembershipsByKey();
      const lockerKeys = state.lockerOwnerKeys();
      const feeMap = state.feeRecordsByMemberKey();
      const mcatScs = state.mcatScs();
      const mcatSrv = state.mcatSrv();

      return state.defaultOrgMemberships().map((membership: MembershipModel) => {
        const existing = feeMap.get(membership.memberKey);
        if (existing) return existing;
        return convertMembershipToFee(
          membership,
          srvMap.get(membership.memberKey),
          lockerKeys.has(membership.memberKey),
          mcatScs,
          mcatSrv,
          tenantId
        );
      });
    }),

    membershipsByMemberKey: computed(() => {
      const map = new Map<string, MembershipModel>();
      state.defaultOrgMemberships().forEach((m: MembershipModel) => map.set(m.memberKey, m));
      return map;
    }),

    mcatCategory: computed(() => state.appStore.allCategories()?.find(c => c.name === 'mcat_scs')),
  })),

  withComputed((state) => ({
      filteredFees: computed(() => {
        return state.allFees()?.filter((fee: ScsMemberFeesModel) => 
          nameMatches(fee.index, state.searchTerm()) &&
          nameMatches(fee.category, state.selectedMcat()) &&
          nameMatches(fee.state, state.selectedState()))
      })
  })),

  withMethods((state) => ({
    setSearchTerm(searchTerm: string): void {
      patchState(state, { searchTerm });
    },

    setSelectedMcat(selectedMcat: string): void {
      patchState(state, { selectedMcat });
    },

    setSelectedState(selectedState: string): void {
      patchState(state, { selectedState });
    },

    refreshData(): void {
      patchState(state, { version: state.version() + 1 });
    },

    getTotal(fee: ScsMemberFeesModel): number {
      return getFeeTotal(fee);
    },

    /**
     * Save an edited fee record to Firestore and reload.
     */
    async saveFee(fee: ScsMemberFeesModel): Promise<void> {
      await state.scsMemberFeeService.save(fee, state.appStore.currentUser() ?? undefined);
      patchState(state, { version: state.version() + 1 });
    },

    /**
     * Generate and persist fee records for all default org members that don't have one yet.
     */
    async generateFees(): Promise<void> {
      const confirmed = await confirm(state.alertController, '@finance.scsMemberFee.operation.generate.confirm', true);
      if (!confirmed) return;

      const tenantId = state.tenantId();
      const srvMap = state.srvMembershipsByKey();
      const lockerKeys = state.lockerOwnerKeys();
      const feeMap = state.feeRecordsByMemberKey();
      const mcatScs = state.mcatScs();
      const mcatSrv = state.mcatSrv();
      const currentUser = state.appStore.currentUser() ?? undefined;

      const members = state.defaultOrgMemberships().filter((m: MembershipModel) => !feeMap.has(m.memberKey));
      const saves = members.map((m: MembershipModel) => {
          const fee = convertMembershipToFee(
            m,
            srvMap.get(m.memberKey),
            lockerKeys.has(m.memberKey),
            mcatScs,
            mcatSrv,
            tenantId
          );
          return state.scsMemberFeeService.save(fee, currentUser, false);
      });
      const msg = 'generated ' + members.length + ' scs member fees.';
      state.activityService.log('membership', 'create', currentUser, msg);

      await Promise.all(saves);
      patchState(state, { version: state.version() + 1 });
      await showToast(state.toastController, '@finance.scsMemberFee.operation.generate.conf');
    },

    async showTotals(): Promise<void> {
      const modal = await state.modalController.create({
        component: ScsMemberFeesTotalsModal,
        componentProps: {
          fees: state.filteredFees(),
        },
      });
      await modal.present();
    },

    async archive(): Promise<void> {
      const confirmed = await confirm(state.alertController, '@finance.scsMemberFee.operation.archive.confirm', true);
      if (!confirmed) return;

      const fees = state.filteredFees();
      const batch = state.firestoreService.getBatch();
      for (const fee of fees) {
        if (!fee.bkey) continue;
        const ref = doc(state.firestoreService.firestore, `${ScsMemberFeesCollection}/${fee.bkey}`);
        batch.update(ref, { isArchived: true });
      }
      await batch.commit();
      patchState(state, { version: state.version() + 1 });
      await showToast(state.toastController, '@finance.scsMemberFee.operation.archive.conf');
    },

    async export(type: string): Promise<void> {
      if (type === 'raw') {
        const fees = state.filteredFees();
        let keys: (keyof ScsMemberFeesModel)[] = [];
        const table: string[][] = [];
        const fn = generateRandomString(10) + '.' + ExportFormats[ExportFormat.XLSX].abbreviation;
        let tableName = '';
        keys = Object.keys(new ScsMemberFeesModel(state.appStore.tenantId())) as (keyof ScsMemberFeesModel)[];
        table.push(keys);
        for (const fee of fees) {
          table.push(getDataRow<ScsMemberFeesModel>(fee, keys));
        }
        exportXlsx(table, fn, 'Jahresbeitragsrechnungen');
      }
    },

    /**
     * Delete a fee record (only those already persisted).
     */
    async deleteFee(fee: ScsMemberFeesModel): Promise<void> {
      if (!fee.bkey) return;
      const confirmed = await confirm(state.alertController, '@finance.scsMemberFee.operation.delete.confirm', true);
      if (!confirmed) return;
      await state.scsMemberFeeService.delete(fee, state.appStore.currentUser() ?? undefined);
      patchState(state, { version: state.version() + 1 });
    },

    async setStatus(fee: ScsMemberFeesModel, status: INVOICE_STATE): Promise<void> {
      if (!fee.bkey) return;
      const updated: ScsMemberFeesModel = { ...fee, state: status };
      await state.scsMemberFeeService.save(updated, state.appStore.currentUser() ?? undefined);
      patchState(state, { version: state.version() + 1 });
      await showToast(state.toastController, '@finance.scsMemberFee.operation.update.conf');
    },

    /**
     * Upload a fee record to Bexio by calling the createBexioInvoice Cloud Function.
     */
    async uploadToBexio(fee: ScsMemberFeesModel): Promise<void> {
      if (!fee.memberBexioId) {
        await showToast(state.toastController, '@finance.scsMemberFee.operation.upload.noBexioId');
        return;
      }

      const positions = buildBexioPositions(fee);
      if (fee.templateId?.length === 0) {
          fee.templateId = getTemplateId(fee.category);
      }
      const modal = await state.modalController.create({
        component: ScsMemberFeeUploadModal,
        componentProps: { fee, positions },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<{ header: string; footer: string }>();
      if (role !== 'confirm' || !data) return;

      const fn = httpsCallable<{
        title: string;
        bexioId: string;
        header?: string;
        footer?: string;
        template_slug: string;
        positions?: { text: string; unit_price: number; account_id: number; amount: number }[];
      }, { id: string }>(state.functions, 'createBexioInvoice');

      const result = await fn({
        title: `Jahresbeitrag ${getYear()}`,
        bexioId: fee.memberBexioId,
        header: data.header,
        footer: data.footer,
        template_slug: fee.templateId,
        positions,
      });

      // Mark as uploaded and store the Bexio invoice ID
      const updated: ScsMemberFeesModel = { ...fee, state: 'uploaded', invoiceBexioId: String(result.data.id) };
      await state.scsMemberFeeService.save(updated, state.appStore.currentUser() ?? undefined);
      patchState(state, { version: state.version() + 1 });
      await showToast(state.toastController, '@finance.scsMemberFee.operation.upload.conf');
    },

    /**
     * Download a Bexio invoice PDF for a fee record.
     * If invoiceBexioId is not yet stored, prompts the user to enter it and persists it first.
     */
    async downloadPdf(fee: ScsMemberFeesModel): Promise<void> {
      let invoiceBexioId = fee.invoiceBexioId;

      if (!invoiceBexioId) {
        const modal = await state.modalController.create({
          component: ScsMemberFeeInvoiceIdModal,
          componentProps: { fee },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<{ invoiceId: string }>();
        if (role !== 'confirm' || !data?.invoiceId) return;
        invoiceBexioId = data.invoiceId;
        const updated: ScsMemberFeesModel = { ...fee, invoiceBexioId };
        await state.scsMemberFeeService.save(updated, state.appStore.currentUser() ?? undefined);
        patchState(state, { version: state.version() + 1 });
      }

      const fn = httpsCallable<{ invoiceId: string }, { content: string }>(
        state.functions, 'showInvoicePdf'
      );
      const memberName = `${fee.member?.name2 ?? ''}_${fee.member?.name1 ?? ''}`;
      const result = await fn({ invoiceId: invoiceBexioId });
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
      const membership = state.membershipsByMemberKey().get(memberKey);
      if (!membership) return;
      const mcat = state.mcatCategory();
      if (!mcat) return;
      const modal = await state.modalController.create({
        component: MembershipEditModalComponent,
        componentProps: {
          membership: { ...membership },
          currentUser: state.appStore.currentUser(),
          tags: '',
          priv: state.appStore.privacySettings(),
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
  const addPos = (text: string, unit_price: number, account_id: number) => {
    if (unit_price !== 0) positions.push({ text, unit_price, account_id, amount: 1 });
  };

  let mcat: string;
  switch (fee.category) {
    case 'active': mcat = 'Aktiv A1'; break;
    case 'active2': mcat = 'Aktiv A2'; break;
    case 'active3': mcat = 'Aktiv A3'; break;
    case 'free': mcat = 'Freimitglied'; break;
    case 'junior': mcat = 'Jugendliche'; break;
    case 'honorary': mcat = 'Ehrenmitglied'; break;
    case 'candidate':  mcat = 'Kandidierende'; break;
    case 'passive': mcat = 'Passive'; break;
    default: mcat = ''; break;
  }

  addPos('SCS Jahresbeitrag ' + mcat, fee.jb, 159);
  addPos('SRV Verbandsbeitrag', fee.srv, 284);
  addPos('Getränke 2025', fee.bev, 306);
  addPos('Einmalige Eintrittsgebühr', fee.entryFee, 158);
  addPos('Miete Garderobenkasten', fee.locker, 286);
  addPos('Hallentraining', fee.hallenTraining, 289);
  addPos('Miete Skiff Lagerplatz', fee.skiff, 286);
  addPos('Anteil Skiff-Versicherung', fee.skiffInsurance, 165);
  if (fee.rebate > 0) addPos(`Rabatt (${fee.rebateReason})`, -fee.rebate, 159);
  return positions;
}

@Injectable({ providedIn: 'root' })
export class ScsMemberFeesStore extends _ScsMemberFeesStore {
  constructor() { super(); }
}
