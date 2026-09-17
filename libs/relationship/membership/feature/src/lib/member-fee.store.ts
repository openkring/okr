import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { doc } from 'firebase/firestore';
import { of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { AccountingConfigModel, ExportFormat, FeeScheduleEntry, INVOICE_STATE, MembershipCollection, MembershipModel, OwnershipCollection, OwnershipModel, MemberFeeCollection, MemberFeeModel } from '@okr/shared-models';
import { confirm, exportCsv, showToast } from '@okr/shared-util-angular';
import { DateFormat, debugListLoaded, generateRandomString, getDataRow, getFullName, getSystemQuery, getTodayStr, getYear, isAfterDate, nameMatches } from '@okr/shared-util-core';
import { ExportFormats } from '@okr/shared-categories';
import { I18nService } from '@okr/shared-i18n';

import { ActivityService } from '@okr/activity-data-access';
import { AccountingConfigService } from '@okr/finance-accounting-data-access';
import { MemberFeeService, getTemplateId } from '@okr/relationship-membership-data-access';

import { MembershipEditModal } from './membership-edit.modal';
import { MemberFeeInvoiceIdModal } from './member-fee-invoice-id.modal';
import { MemberFeeUploadModal } from './member-fee-upload.modal';
import { MemberFeesTotalsModal } from './member-fee-totals.modal';
import { buildPositions, getFeeTotal, rebatePosition, MEMBERSHIP_I18N_KEYS } from '@okr/relationship-membership-util';

export type MemberFeesState = {
  searchTerm: string;
  selectedMcat: string;
  selectedState: string;
  version: number;
};

const initialState: MemberFeesState = {
  searchTerm: '',
  selectedMcat: 'all',
  selectedState: 'all',
  version: 0,
};

export const _MemberFeesStore = signalStore(
  withState(initialState),
  withProps(() => {
    const appStore = inject(AppStore);
    const functions = getFunctions(getApp(), 'europe-west6');
    if (appStore.env.useEmulators) {
      connectFunctionsEmulator(functions, 'localhost', 5001);
    }
    return {
      memberFeeService: inject(MemberFeeService),
      accountingConfigService: inject(AccountingConfigService),
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
    i18n: store.i18nService.translateAll(MEMBERSHIP_I18N_KEYS),

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
          debugListLoaded('MemberFeesStore.allMemberships', params.currentUser)
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
          debugListLoaded('MemberFeesStore.allLockerOwnerships', params.currentUser)
        );
      },
    }),

    // The accounting config of the default org — carries the year-versioned `feeSchedule`
    // that drives the fee derivation (buildPositions).
    accountingConfigResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        accountingTenantId: store.appStore.defaultOrg()?.okey ?? store.appStore.tenantId(),
        version: store.version(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser || !params.accountingTenantId) return of(undefined);
        return store.accountingConfigService.read(params.accountingTenantId);
      },
    }),

    // Persisted fee records from member-fees collection
    feeRecordsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        version: store.version(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([]);
        return store.memberFeeService.list();
      },
    }),
  })),

  withComputed((store) => ({
    isLoading: computed(() =>
      store.allMembershipsResource.isLoading() ||
      store.allLockerOwnershipsResource.isLoading() ||
      store.accountingConfigResource.isLoading() ||
      store.feeRecordsResource.isLoading()
    ),
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId: computed(() => store.appStore.tenantId()),

    // current active+passive memberships of the default org
    defaultOrgMemberships: computed(() => {
      const today = getTodayStr();
      const orgId = store.appStore.defaultOrg()?.okey ?? store.appStore.tenantId();
      return store.allMembershipsResource.value()?.filter((m: MembershipModel) => 
        m.orgKey === orgId && 
        m.orgModelType === 'org' &&
        isAfterDate(m.dateOfExit, today) &&
        (m.state === 'active' || m.state === 'passive')
      ) ?? [];
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
      const map = new Map<string, MemberFeeModel>();
      store.feeRecordsResource.value()?.forEach((f: MemberFeeModel) => {
        if (f.member?.key) map.set(f.member.key, f);
      });
      return map;
    }),

    // Every category list flattened to `listName -> category -> price`, which is the shape
    // `FeeContext.categoryLists` expects. A list without prices simply contributes an empty map.
    categoryLists: computed((): Record<string, Record<string, number>> => {
      const lists: Record<string, Record<string, number>> = {};
      store.appStore.allCategories()?.forEach(list => {
        const prices: Record<string, number> = {};
        list.items?.forEach(item => { prices[item.name] = item.price ?? 0; });
        lists[list.name] = prices;
      });
      return lists;
    }),

    // The price list of the running year. A tenant without a schedule for this year derives
    // an empty position list — never a wrong amount.
    feeSchedule: computed((): FeeScheduleEntry => {
      const year = getYear();
      const config: AccountingConfigModel | undefined = store.accountingConfigResource.value();
      return config?.feeSchedule?.find(e => e.year === year) ?? { year, positions: [] };
    }),

    mcatScsCategory: computed(() => store.appStore.allCategories()?.find(c => c.name === 'mcat_scs')),
  })),

  withComputed((store) => ({
    // Merged list: persisted records take priority; generated models fill in the rest
    allFees: computed((): MemberFeeModel[] => {
      const tenantId = store.tenantId();
      const lockerKeys = store.lockerOwnerKeys();
      const feeMap = store.feeRecordsByMemberKey();
      const schedule = store.feeSchedule();
      const categoryLists = store.categoryLists();

      return store.defaultOrgMemberships().map((membership: MembershipModel) => {
        const existing = feeMap.get(membership.memberKey);
        if (existing) return existing;
        return deriveFee(membership, schedule, categoryLists, lockerKeys, tenantId);
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
        return store.allFees()?.filter((fee: MemberFeeModel) => 
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

    getTotal(fee: MemberFeeModel): number {
      return getFeeTotal(fee.positions ?? []);
    },

    /**
     * Save an edited fee record to Firestore and reload.
     */
    async saveFee(fee: MemberFeeModel): Promise<void> {
      await store.memberFeeService.save(fee, store.appStore.currentUser() ?? undefined);
      patchState(store, { version: store.version() + 1 });
    },

    /**
     * Generate and persist fee records for all default org members that don't have one yet.
     */
    async generateFees(): Promise<void> {
      const confirmed = await confirm(store.alertController, store.i18n.memberFee_generate_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!confirmed) return;

      const tenantId = store.tenantId();
      const lockerKeys = store.lockerOwnerKeys();
      const feeMap = store.feeRecordsByMemberKey();
      const schedule = store.feeSchedule();
      const categoryLists = store.categoryLists();
      const currentUser = store.appStore.currentUser() ?? undefined;

      const members = store.defaultOrgMemberships().filter((m: MembershipModel) => !feeMap.has(m.memberKey));
      const saves = members.map((m: MembershipModel) => {
          const fee = deriveFee(m, schedule, categoryLists, lockerKeys, tenantId);
          return store.memberFeeService.save(fee, currentUser, false);
      });
      const msg = 'generated ' + members.length + ' scs member fees.';
      store.activityService.log('membership', 'create', currentUser, msg);

      await Promise.all(saves);
      patchState(store, { version: store.version() + 1 });
      await showToast(store.toastController, store.i18n.memberFee_generate_conf());
    },

    async showTotals(): Promise<void> {
      const modal = await store.modalController.create({
        component: MemberFeesTotalsModal,
        componentProps: {
          fees: store.filteredFees(),
        },
      });
      await modal.present();
    },

    async archive(): Promise<void> {
      const confirmed = await confirm(store.alertController, store.i18n.memberFee_archive_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!confirmed) return;

      const fees = store.filteredFees();
      const batch = store.firestoreService.getBatch();
      for (const fee of fees) {
        if (!fee.okey) continue;
        const ref = doc(store.firestoreService.firestore, `${MemberFeeCollection}/${fee.okey}`);
        batch.update(ref, { isArchived: true });
      }
      await batch.commit();
      patchState(store, { version: store.version() + 1 });
      await showToast(store.toastController, store.i18n.memberFee_archive_conf());
    },

    async export(type: string): Promise<void> {
      if (type === 'raw') {
        const fees = store.filteredFees();
        let keys: (keyof MemberFeeModel)[] = [];
        const table: string[][] = [];
        const fn = generateRandomString(10) + '.' + ExportFormats[ExportFormat.XLSX].abbreviation;
        let tableName = '';
        keys = Object.keys(new MemberFeeModel(store.appStore.tenantId())) as (keyof MemberFeeModel)[];
        table.push(keys);
        for (const fee of fees) {
          table.push(getDataRow<MemberFeeModel>(fee, keys));
        }
        exportCsv(table, fn, store.i18n.memberFee_export_title());
      }
    },

    /**
     * Delete a fee record (only those already persisted).
     */
    async deleteFee(fee: MemberFeeModel): Promise<void> {
      if (!fee.okey) return;
      const confirmed = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!confirmed) return;
      await store.memberFeeService.delete(fee, store.appStore.currentUser() ?? undefined);
      patchState(store, { version: store.version() + 1 });
    },

    async setStatus(fee: MemberFeeModel, status: INVOICE_STATE): Promise<void> {
      if (!fee.okey) return;
      const updated: MemberFeeModel = { ...fee, state: status };
      await store.memberFeeService.save(updated, store.appStore.currentUser() ?? undefined);
      patchState(store, { version: store.version() + 1 });
      await showToast(store.toastController, store.i18n.memberFee_update_conf());
    },

    /**
     * Upload a fee record to Bexio by calling the createBexioInvoice Cloud Function.
     */
    async uploadToBexio(fee: MemberFeeModel): Promise<void> {
      if (!fee.memberBexioId) {
        await showToast(store.toastController, store.i18n.memberFee_upload_noBexioId());
        return;
      }

      // The mcat list resolves the member's category to its human label for the position text.
      const resolveCategoryLabel = await store.i18nService.createLabelResolver(store.mcatCategory());
      const positions = buildBexioPositions(fee, resolveCategoryLabel(fee.category));
      if (fee.templateId?.length === 0) {
          fee.templateId = getTemplateId(fee.category);
      }
      const modal = await store.modalController.create({
        component: MemberFeeUploadModal,
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
      const updated: MemberFeeModel = { ...fee, state: 'uploaded', invoiceBexioId: String(result.data.id) };
      await store.memberFeeService.save(updated, store.appStore.currentUser() ?? undefined);
      patchState(store, { version: store.version() + 1 });
      await showToast(store.toastController, store.i18n.memberFee_upload_conf());
    },

    /**
     * Post every 'ready' fee record of this tenant as a real in-house invoice by calling the
     * postMemberFees Cloud Function (the 'native' accountingBackend counterpart to uploadToBexio).
     */
    async postMemberFees(): Promise<void> {
      const accountingTenantId = store.appStore.defaultOrg()?.okey ?? store.appStore.tenantId();
      const fn = httpsCallable<
        { tenantId: string; accountingTenantId: string },
        { processed: number; invoiced: number }
      >(store.functions, 'postMemberFees');
      await fn({ tenantId: store.appStore.tenantId(), accountingTenantId });
      patchState(store, { version: store.version() + 1 });
      await showToast(store.toastController, store.i18n.memberFee_invoice_conf());
    },

    /**
     * Download a Bexio invoice PDF for a fee record.
     * If invoiceBexioId is not yet stored, prompts the user to enter it and persists it first.
     */
    async downloadPdf(fee: MemberFeeModel): Promise<void> {
      let invoiceBexioId = fee.invoiceBexioId;

      if (!invoiceBexioId) {
        const modal = await store.modalController.create({
          component: MemberFeeInvoiceIdModal,
          componentProps: { fee },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<{ invoiceId: string }>();
        if (role !== 'confirm' || !data?.invoiceId) return;
        invoiceBexioId = data.invoiceId;
        const updated: MemberFeeModel = { ...fee, invoiceBexioId };
        await store.memberFeeService.save(updated, store.appStore.currentUser() ?? undefined);
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
    async editMembership(fee: MemberFeeModel, readOnly = false): Promise<void> {
      const memberKey = fee.member?.key;
      if (!memberKey) return;
      const membership = store.membershipsByMemberKey().get(memberKey);
      if (!membership) return;
      const mcat = store.mcatCategory();
      if (!mcat) return;
      const modal = await store.modalController.create({
        component: MembershipEditModal,
        cssClass: 'auto-height-modal',
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

  withMethods((store) => ({
    /**
     * Route a fee's invoicing action by the tenant's accountingBackend selector
     * (AccountingConfigModel.accountingBackend). A tenant whose books live in Bexio keeps the
     * existing per-fee upload flow unchanged; every other backend ('native'/'datev' today only
     * 'native' is implemented) posts the fee natively via the bulk postMemberFees callable — the
     * screen needs no second setting, and never both paths for the same tenant.
     */
    async invoice(fee: MemberFeeModel): Promise<void> {
      const backend = store.accountingConfigResource.value()?.accountingBackend ?? 'native';
      if (backend === 'bexio') {
        await store.uploadToBexio(fee);
        return;
      }
      await store.postMemberFees();
    },
  })),
);

/**
 * Build one member's fee record from the year's schedule. The eight hardcoded columns are gone;
 * every amount now comes from `buildPositions`, so a tenant's price list is data, not code.
 */
function deriveFee(
  membership: MembershipModel,
  schedule: FeeScheduleEntry,
  categoryLists: Record<string, Record<string, number>>,
  lockerOwnerKeys: Set<string>,
  tenantId: string,
): MemberFeeModel {
  const fee = new MemberFeeModel(tenantId);

  fee.tenants = membership.tenants;
  fee.isArchived = membership.isArchived;
  fee.index = membership.index;
  fee.tags = membership.tags;
  fee.notes = membership.notes;
  fee.templateId = getTemplateId(membership.category);

  fee.member = {
    key: membership.memberKey,
    name1: membership.memberName1,
    name2: membership.memberName2,
    modelType: membership.memberModelType,
    type: membership.memberType,
    subType: '',
    label: getFullName(membership.memberName1, membership.memberName2),
  };
  fee.memberBirthYear = membership.memberBirthYear;
  fee.memberBexioId = membership.memberBexioId;
  fee.dateOfEntry = membership.dateOfEntry;
  fee.category = membership.category;

  fee.positions = buildPositions(membership, schedule, {
    hasLocker: lockerOwnerKeys.has(membership.memberKey),
    currentYear: schedule.year,
    categoryLists,
  });

  // The per-member rebate (Ausbildungs-/Familienrabatt) is an override a treasurer set on THIS
  // membership, not a rule of the year's price list — the old `convertMembershipToFee` copied it
  // onto the fee and subtracted it. Without this every regenerated fee would bill the full amount
  // while migrated rows still carried their rebate, and the difference would only surface in the
  // next Rechnungslauf.
  const rebate = rebatePosition(membership.rebate, membership.rebateReason);
  if (rebate) fee.positions.push(rebate);

  fee.state = 'initial';
  return fee;
}

/**
 * Build the Bexio invoice positions from a fee's `positions[]`. A rebate position is sent as a
 * negative unit price; a zero amount is left out of the invoice entirely.
 *
 * `account_id` comes from `bexioAccountId`, NOT from `accountKey`: the latter is an AccountModel
 * okey and is not numeric, so `Number(accountKey)` yielded 0 for every position and the whole
 * invoice landed on Bexio's fallback account. A schedule position without a seeded
 * `bexioAccountId` still sends 0 — the same value the old code sent for an unmapped column — but
 * a seeded one now reaches Bexio unchanged.
 *
 * `categoryLabel` reproduces the old position text: the membership-fee line carried the member's
 * category ("SCS Jahresbeitrag Aktiv A1"), every other line was its plain label. Without it a
 * Bexio invoice no longer says which membership category it bills.
 */
function buildBexioPositions(fee: MemberFeeModel, categoryLabel = ''): { text: string; unit_price: number; account_id: number; amount: number }[] {
  return (fee.positions ?? [])
    .filter(p => p.amount !== 0)
    .map(p => ({
      text: p.usage === 'membershipFee' ? `${p.label} ${categoryLabel}`.trim() : p.label,
      unit_price: p.type === 'rebate' ? -p.amount : p.amount,
      account_id: p.bexioAccountId ?? 0,
      amount: 1,
    }));
}

@Injectable({ providedIn: 'root' })
export class MemberFeesStore extends _MemberFeesStore {
  constructor() { super(); }
}
