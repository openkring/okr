import { computed, inject, Injectable, Signal } from '@angular/core';
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
import { ExportFormats } from '@bk2/shared-categories';
import { I18nService } from '@bk2/shared-i18n';

import { ActivityService } from '@bk2/activity-data-access';
import { ScsMemberFeeService, convertMembershipToFee, getFeeTotal, getTemplateId } from '@bk2/relationship-membership-data-access';

import { MembershipEditModal } from './membership-edit.modal';
import { ScsMemberFeeInvoiceIdModal } from './scs-member-fee-invoice-id.modal';
import { ScsMemberFeeUploadModal } from './scs-member-fee-upload.modal';
import { ScsMemberFeesTotalsModal } from './scs-member-fees-totals.modal';
import { PFX } from './scope';

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

const SCS_MEMBER_FEES_I18N_KEYS = {
  view_label:                     PFX + 'view.label',

  invoice_edit:                   PFX + 'invoice.edit',
  invoice_upload:                 PFX + 'invoice.upload',
  invoice_download:               PFX + 'invoice.download',
  invoice_paid:                   PFX + 'invoice.paid',
  invoice_delete:                 PFX + 'invoice.delete',
  invoice_state:                  PFX + 'invoice.state',
  person_edit:                    PFX + 'person.edit',
  member_edit:                    PFX + 'member.edit',

  rebate_label:                   PFX + 'rebate.label',
  rebate_placeholder:             PFX + 'rebate.placeholder',
  rebate_helper:                  PFX + 'rebate.helper',
  rebate_reason:                  PFX + 'rebate.reason',

  notes_label:                    PFX + 'notes.label',
  notes_placeholder:              PFX + 'notes.placeholder',

  archive_confirm:      PFX + 'scsMemberFee.archive.confirm',
  archive_conf:         PFX + 'scsMemberFee.archive.conf',
  delete_label:         PFX + 'scsMemberFee.delete.label',
  delete_confirm:       PFX + 'scsMemberFee.delete.confirm',
  delete_error:         PFX + 'scsMemberFee.delete.error',
  delete_conf:          PFX + 'scsMemberFee.delete.conf',
  generate_confirm:     PFX + 'scsMemberFee.generate.confirm',
  generate_conf:        PFX + 'scsMemberFee.generate.conf',
  update_label:         PFX + 'scsMemberFee.update.label',
  update_conf:          PFX + 'scsMemberFee.update.conf',
  download_enterInvoiceId: PFX + 'scsMemberFee.download.enterInvoiceId',
  upload_label:         PFX + 'scsMemberFee.upload.label',
  upload_conf:          PFX + 'scsMemberFee.upload.conf',
  upload_noBexioId:     PFX + 'scsMemberFee.upload.noBexioId',
  totals_label:         PFX + 'scsMemberFee.totals.label',
  export_title:         PFX + 'scsMemberFee.export_title',
  list_title:           PFX + 'scsMemberFee.list.title',
  list_empty:           PFX + 'scsMemberFee.list.empty',

  jb:                   PFX + 'scsMemberFee.jb.label',
  jb_placeholder:       PFX + 'scsMemberFee.jb.placeholder',
  jb_helper:            PFX + 'scsMemberFee.jb.helper',

  jbp:                  PFX + 'scsMemberFee.jbp.label',
  jbp_placeholder:      PFX + 'scsMemberFee.jbp.placeholder',
  jbp_helper:           PFX + 'scsMemberFee.jbp.helper',

  entryFee:             PFX + 'scsMemberFee.entryFee.label',
  entryFee_placeholder: PFX + 'scsMemberFee.entryFee.placeholder',
  entryFee_helper:      PFX + 'scsMemberFee.entryFee.helper',

  locker:               PFX + 'scsMemberFee.locker.label',
  locker_placeholder:   PFX + 'scsMemberFee.locker.placeholder',
  locker_helper:        PFX + 'scsMemberFee.locker.helper',

  skiff:                PFX + 'scsMemberFee.skiff.label',
  skiff_placeholder:    PFX + 'scsMemberFee.skiff.placeholder',
  skiff_helper:         PFX + 'scsMemberFee.skiff.helper',

  skiffInsurance:       PFX + 'scsMemberFee.skiffInsurance.label',
  skiffInsurance_placeholder:   PFX + 'scsMemberFee.skiffInsurance.placeholder',
  skiffInsurance_helper:PFX + 'scsMemberFee.skiffInsurance.helper',

  bev:                  PFX + 'scsMemberFee.bev.label',
  bev_placeholder:      PFX + 'scsMemberFee.bev.placeholder',
  bev_helper:           PFX + 'scsMemberFee.bev.helper',

  total:                PFX + 'scsMemberFee.total',
  as_title:             '@actionsheet.title',
  save:                 '@save.label',
  ok:                   '@ok',
  cancel:               '@cancel',

  } satisfies Record<string, string>;

export type ScsMemberFeesI18n = { [K in keyof typeof SCS_MEMBER_FEES_I18N_KEYS]: Signal<string> };

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
      i18nService: inject(I18nService),
      functions,
    };
  }),

  withProps((store) => ({
    i18n: store.i18nService.translateAll(SCS_MEMBER_FEES_I18N_KEYS),

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
    allFees: computed((): ScsMemberFeesModel[] => {
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
      filteredFees: computed(() => {
        return store.allFees()?.filter((fee: ScsMemberFeesModel) => 
          nameMatches(fee.index, store.searchTerm()) &&
          nameMatches(fee.category, store.selectedMcat()) &&
          nameMatches(fee.state, store.selectedState()))
      })
  })),

  withMethods((store) => ({
    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },

    setSelectedMcat(selectedMcat: string): void {
      patchState(store, { selectedMcat });
    },

    setSelectedState(selectedState: string): void {
      patchState(store, { selectedState });
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
      const confirmed = await confirm(store.alertController, store.i18n.generate_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!confirmed) return;

      const tenantId = store.tenantId();
      const srvMap = store.srvMembershipsByKey();
      const lockerKeys = store.lockerOwnerKeys();
      const feeMap = store.feeRecordsByMemberKey();
      const mcatScs = store.mcatScs();
      const mcatSrv = store.mcatSrv();
      const currentUser = store.appStore.currentUser() ?? undefined;

      const members = store.defaultOrgMemberships().filter((m: MembershipModel) => !feeMap.has(m.memberKey));
      const saves = members.map((m: MembershipModel) => {
          const fee = convertMembershipToFee(
            m,
            srvMap.get(m.memberKey),
            lockerKeys.has(m.memberKey),
            mcatScs,
            mcatSrv,
            tenantId
          );
          return store.scsMemberFeeService.save(fee, currentUser, false);
      });
      const msg = 'generated ' + members.length + ' scs member fees.';
      store.activityService.log('membership', 'create', currentUser, msg);

      await Promise.all(saves);
      patchState(store, { version: store.version() + 1 });
      await showToast(store.toastController, store.i18n.generate_conf());
    },

    async showTotals(): Promise<void> {
      const modal = await store.modalController.create({
        component: ScsMemberFeesTotalsModal,
        componentProps: {
          fees: store.filteredFees(),
        },
      });
      await modal.present();
    },

    async archive(): Promise<void> {
      const confirmed = await confirm(store.alertController, store.i18n.archive_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!confirmed) return;

      const fees = store.filteredFees();
      const batch = store.firestoreService.getBatch();
      for (const fee of fees) {
        if (!fee.bkey) continue;
        const ref = doc(store.firestoreService.firestore, `${ScsMemberFeesCollection}/${fee.bkey}`);
        batch.update(ref, { isArchived: true });
      }
      await batch.commit();
      patchState(store, { version: store.version() + 1 });
      await showToast(store.toastController, store.i18n.archive_conf());
    },

    async export(type: string): Promise<void> {
      if (type === 'raw') {
        const fees = store.filteredFees();
        let keys: (keyof ScsMemberFeesModel)[] = [];
        const table: string[][] = [];
        const fn = generateRandomString(10) + '.' + ExportFormats[ExportFormat.XLSX].abbreviation;
        let tableName = '';
        keys = Object.keys(new ScsMemberFeesModel(store.appStore.tenantId())) as (keyof ScsMemberFeesModel)[];
        table.push(keys);
        for (const fee of fees) {
          table.push(getDataRow<ScsMemberFeesModel>(fee, keys));
        }
        exportXlsx(table, fn, store.i18n.export_title());
      }
    },

    /**
     * Delete a fee record (only those already persisted).
     */
    async deleteFee(fee: ScsMemberFeesModel): Promise<void> {
      if (!fee.bkey) return;
      const confirmed = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!confirmed) return;
      await store.scsMemberFeeService.delete(fee, store.appStore.currentUser() ?? undefined);
      patchState(store, { version: store.version() + 1 });
    },

    async setStatus(fee: ScsMemberFeesModel, status: INVOICE_STATE): Promise<void> {
      if (!fee.bkey) return;
      const updated: ScsMemberFeesModel = { ...fee, state: status };
      await store.scsMemberFeeService.save(updated, store.appStore.currentUser() ?? undefined);
      patchState(store, { version: store.version() + 1 });
      await showToast(store.toastController, store.i18n.update_conf());
    },

    /**
     * Upload a fee record to Bexio by calling the createBexioInvoice Cloud Function.
     */
    async uploadToBexio(fee: ScsMemberFeesModel): Promise<void> {
      if (!fee.memberBexioId) {
        await showToast(store.toastController, store.i18n.upload_noBexioId());
        return;
      }

      const positions = bPFXldBexioPositions(fee);
      if (fee.templateId?.length === 0) {
          fee.templateId = getTemplateId(fee.category);
      }
      const modal = await store.modalController.create({
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
      }, { id: string }>(store.functions, 'createBexioInvoice');

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
      await store.scsMemberFeeService.save(updated, store.appStore.currentUser() ?? undefined);
      patchState(store, { version: store.version() + 1 });
      await showToast(store.toastController, store.i18n.upload_conf());
    },

    /**
     * Download a Bexio invoice PDF for a fee record.
     * If invoiceBexioId is not yet stored, prompts the user to enter it and persists it first.
     */
    async downloadPdf(fee: ScsMemberFeesModel): Promise<void> {
      let invoiceBexioId = fee.invoiceBexioId;

      if (!invoiceBexioId) {
        const modal = await store.modalController.create({
          component: ScsMemberFeeInvoiceIdModal,
          componentProps: { fee },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<{ invoiceId: string }>();
        if (role !== 'confirm' || !data?.invoiceId) return;
        invoiceBexioId = data.invoiceId;
        const updated: ScsMemberFeesModel = { ...fee, invoiceBexioId };
        await store.scsMemberFeeService.save(updated, store.appStore.currentUser() ?? undefined);
        patchState(store, { version: store.version() + 1 });
      }

      const fn = httpsCallable<{ invoiceId: string }, { content: string }>(
        store.functions, 'showInvoicePdf'
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
      const membership = store.membershipsByMemberKey().get(memberKey);
      if (!membership) return;
      const mcat = store.mcatCategory();
      if (!mcat) return;
      const modal = await store.modalController.create({
        component: MembershipEditModal,
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
 * BPFXld Bexio invoice positions from a ScsMemberFeesModel.
 */
function bPFXldBexioPositions(fee: ScsMemberFeesModel): { text: string; unit_price: number; account_id: number; amount: number }[] {
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
