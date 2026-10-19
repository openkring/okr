import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { doc } from 'firebase/firestore';
import { map, of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { ExportFormat, FeeScheduleEntry, INVOICE_STATE, MembershipCollection, MembershipModel, OwnershipCollection, OwnershipModel, MemberFeeCollection, MemberFeeModel } from '@okr/shared-models';
import { confirm, exportCsv, okrPrompt, resourceParams, showToast } from '@okr/shared-util-angular';
import { DateFormat, debugListLoaded, fill, generateRandomString, getDataRow, getFullName, getSystemQuery, getTodayStr, getYear, isAfterDate, nameMatches } from '@okr/shared-util-core';
import { ExportFormats } from '@okr/shared-categories';
import { I18nService } from '@okr/shared-i18n';

import { ActivityService } from '@okr/activity-data-access';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { ownerOrgOfBooks } from '@okr/finance-accounting-util';
import { MemberFeeService, getTemplateId } from '@okr/relationship-membership-data-access';

import { MembershipEditModal } from './membership-edit.modal';
import { MemberFeesTotalsModal } from './member-fee-totals.modal';
import { BexioPosition, billedCategoryKey, billedMemberships, buildPositions, feeRowsOfBooks, feeScreenState, getFeeTotal, MemberFeesScreenState, rebatePosition, MEMBERSHIP_I18N_KEYS } from '@okr/relationship-membership-util';
import { MemberFeeUploadModal } from '@okr/relationship-membership-ui';

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
      accountingStore: inject(AccountingStore),
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

    // Persisted fee records of the selected books (spec 1.108, D3). The query already filters by
    // books; feeRowsOfBooks is the second guard, and a dropped row is logged (D11).
    feeRecordsResource: rxResource({
      params: resourceParams(() => ({
        userKey: store.appStore.currentUser()?.okey ?? '',
        booksId: store.accountingStore.accountingTenantId(),
        version: store.version(),
      })),
      stream: ({ params }) => {
        if (!params.userKey || !params.booksId) return of([] as MemberFeeModel[]);
        return store.memberFeeService.list(params.booksId).pipe(
          map((rows: MemberFeeModel[]) => {
            const kept = feeRowsOfBooks(rows, params.booksId);
            if (kept.length !== rows.length) {
              console.warn(`MemberFeesStore.feeRecords: ignored ${rows.length - kept.length} fee row(s) not of books ${params.booksId}`);
            }
            return kept;
          })
        );
      },
    }),
  })),

  // The books come from the accounting area (AccountingStore), the billed org is their owner
  // (spec 1.108, D2) — never the app tenant or the default org.
  withComputed((store) => ({
    booksId: computed(() => store.accountingStore.accountingTenantId()),
    configFailed: computed(() => store.accountingStore.configResource.status() === 'error'),
  })),

  withComputed((store) => ({
    // A resource in 'error' throws from value(): never read config() then (the header's category
    // filter reads this too, so the guard lives here and not only in screenState).
    billedOrgKey: computed(() => store.configFailed() ? undefined : ownerOrgOfBooks(store.accountingStore.config())),
  })),

  withComputed((store) => ({
    // 'ready' only once the config AND the books' fee rows have answered (spec 1.108, D12): while
    // feeRecordsResource reloads (version bump, books switch) its value is undefined and every
    // billed member would look row-less — a reload then would create duplicates.
    screenState: computed((): MemberFeesScreenState => {
      const rowsStatus = store.feeRecordsResource.status();
      return feeScreenState(
        store.accountingStore.configLoaded(),
        rowsStatus === 'resolved' || rowsStatus === 'local',
        store.billedOrgKey(),
        store.configFailed(),
      );
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

    // current active+passive memberships of the org that owns the books
    billedMemberships: computed(() =>
      billedMemberships(store.allMembershipsResource.value() ?? [], store.billedOrgKey() ?? '', getTodayStr())
    ),

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
      if (store.configFailed()) return { year, positions: [] };
      return store.accountingStore.config()?.feeSchedule?.find(e => e.year === year) ?? { year, positions: [] };
    }),

    /**
     * Whether these books live in Bexio. Only meaningful once `accountingStore.configLoaded()` is
     * true — before that it reads false, like every unloaded config, which is why every invoicing
     * action gates on the loaded flag (via screenState) and not on this one. While the config is
     * still loading, `accountingBackend ?? 'native'` reads 'native' for EVERY books — a Bexio
     * books clicking early would take the native branch and get a raw `failed-precondition`.
     */
    isBexioBackend: computed(() => !store.configFailed() && store.accountingStore.config()?.accountingBackend === 'bexio'),

    // The billed org names its own membership-category list (spec 1.108, D9) — a gss run prices
    // from the Gönnerverein's list, not the default org's. Legacy org docs may lack the field.
    membershipCategoryKey: computed(() => {
      const orgKey = store.billedOrgKey();
      return billedCategoryKey(orgKey ? store.appStore.getOrg(orgKey) : undefined);
    }),
  })),

  withComputed((store) => ({
    mcatScsCategory: computed(() => store.appStore.allCategories()?.find(c => c.name === store.membershipCategoryKey())),
  })),

  withComputed((store) => ({
    // Merged list: persisted records take priority; generated models fill in the rest
    allFees: computed((): MemberFeeModel[] => {
      if (store.screenState() !== 'ready') return [];
      const tenantId = store.tenantId();
      const booksId = store.booksId();
      const lockerKeys = store.lockerOwnerKeys();
      const feeMap = store.feeRecordsByMemberKey();
      const schedule = store.feeSchedule();
      const categoryLists = store.categoryLists();
      const defaultCategoryList = store.membershipCategoryKey();

      return store.billedMemberships().map((membership: MembershipModel) => {
        const existing = feeMap.get(membership.memberKey);
        if (existing) return existing;
        return deriveFee(membership, schedule, categoryLists, defaultCategoryList, lockerKeys, tenantId, booksId);
      });
    }),

    membershipsByMemberKey: computed(() => {
      const map = new Map<string, MembershipModel>();
      store.billedMemberships().forEach((m: MembershipModel) => map.set(m.memberKey, m));
      return map;
    }),

    mcatCategory: computed(() => store.appStore.allCategories()?.find(c => c.name === store.membershipCategoryKey())),
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
      if (store.screenState() !== 'ready') return;
      await store.memberFeeService.save(fee, store.appStore.currentUser() ?? undefined);
      patchState(store, { version: store.version() + 1 });
    },

    /**
     * Generate and persist fee records for all members of the books' owner org that don't have one
     * yet. Every new row carries the selected books (spec 1.108, D3).
     */
    async generateFees(): Promise<void> {
      if (store.screenState() !== 'ready') return;
      // Snapshot everything BEFORE the dialog: the treasurer may switch books while it is open.
      const booksId = store.booksId();
      const tenantId = store.tenantId();
      const lockerKeys = store.lockerOwnerKeys();
      const feeMap = store.feeRecordsByMemberKey();
      const schedule = store.feeSchedule();
      const categoryLists = store.categoryLists();
      const categoryKey = store.membershipCategoryKey();
      const members = store.billedMemberships().filter((m: MembershipModel) => !feeMap.has(m.memberKey));

      const confirmed = await confirm(store.alertController, store.i18n.memberFee_generate_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!confirmed) return;
      // The books changed (or their rows are reloading) while the dialog was open — write nothing.
      if (store.booksId() !== booksId || store.screenState() !== 'ready') return;

      const currentUser = store.appStore.currentUser() ?? undefined;
      const saves = members.map((m: MembershipModel) => {
          const fee = deriveFee(m, schedule, categoryLists, categoryKey, lockerKeys, tenantId, booksId);
          return store.memberFeeService.save(fee, currentUser, false);
      });
      const msg = 'generated ' + members.length + ' member fees for books ' + booksId + '.';
      store.activityService.log('membership', 'create', currentUser, msg);

      await Promise.all(saves);
      patchState(store, { version: store.version() + 1 });
      await showToast(store.toastController, store.i18n.memberFee_generate_conf());
    },

    async showTotals(): Promise<void> {
      if (store.screenState() !== 'ready') return;
      const modal = await store.modalController.create({
        component: MemberFeesTotalsModal,
        componentProps: {
          fees: store.filteredFees(),
        },
      });
      await modal.present();
    },

    async archive(): Promise<void> {
      if (store.screenState() !== 'ready') return;
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
      if (store.screenState() !== 'ready') return;
      if (type === 'raw') {
        const fees = store.filteredFees();
        let keys: (keyof MemberFeeModel)[] = [];
        const table: string[][] = [];
        const fn = generateRandomString(10) + '.' + ExportFormats[ExportFormat.XLSX].abbreviation;
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
     * Post every 'ready' fee record of the selected books as a real in-house invoice by calling the
     * postMemberFees Cloud Function (the 'native' accountingBackend counterpart to uploadToBexio).
     */
    async postMemberFees(): Promise<void> {
      if (store.screenState() !== 'ready') return;
      const accountingTenantId = store.booksId();
      // This is a BULK run: the callable posts every 'ready' row of the tenant and knows nothing
      // about a clicked row. Name the number of rows before doing it — the action used to sit on
      // a single fee's ActionSheet and looked like a per-member invoice.
      const readyCount = store.allFees().filter((f: MemberFeeModel) => f.okey && f.state === 'ready').length;
      if (readyCount === 0) {
        await showToast(store.toastController, store.i18n.memberFee_invoiceAll_none());
        return;
      }
      const confirmed = await confirm(store.alertController,
        fill(store.i18n.memberFee_invoiceAll_confirm(), { count: readyCount }),
        store.i18n.ok(), store.i18n.cancel(), true);
      if (!confirmed) return;

      const fn = httpsCallable<
        { tenantId: string; accountingTenantId: string },
        { processed: number; invoiced: number; failed: { member: string; positions: string[] }[] }
      >(store.functions, 'postMemberFees');
      const result = await fn({ tenantId: store.appStore.tenantId(), accountingTenantId });
      patchState(store, { version: store.version() + 1 });

      // A fee with a position that has no revenue account is not posted — an invoice position
      // without an account cannot be booked. The callable names those members instead of
      // posting them silently; say so, otherwise the treasurer sees a success message for a
      // run that skipped people.
      const failed = result.data.failed ?? [];
      if (failed.length > 0) {
        await showToast(store.toastController,
          fill(store.i18n.memberFee_invoice_incomplete(), {
            invoiced: result.data.invoiced,
            names: failed.map(f => f.member).join(', '),
          }));
        return;
      }
      await showToast(store.toastController, store.i18n.memberFee_invoice_conf());
    },

    /**
     * Download a Bexio invoice PDF for a fee record.
     * If invoiceBexioId is not yet stored, prompts the user to enter it and persists it first.
     */
    async downloadPdf(fee: MemberFeeModel): Promise<void> {
      let invoiceBexioId = fee.invoiceBexioId;

      if (!invoiceBexioId) {
        const entered = (await okrPrompt(store.alertController,
          store.i18n.memberFee_download_enterInvoiceId(), store.i18n.memberFee_download_invoiceId_placeholder(),
          store.i18n.ok(), store.i18n.cancel()))?.trim();
        if (!entered) return;   // cancelled, or confirmed without a value
        if (!/^\d+$/.test(entered)) {   // the old numeric input accepted digits only
          await showToast(store.toastController, store.i18n.memberFee_download_invoiceId_invalid());
          return;
        }
        invoiceBexioId = entered;
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
      if (store.screenState() === 'loading') {
        await showToast(store.toastController, store.i18n.memberFee_config_loading());
        return;
      }
      if (store.screenState() !== 'ready') return;
      const backend = store.accountingStore.config()?.accountingBackend ?? 'native';
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
  defaultCategoryList: string,
  lockerOwnerKeys: Set<string>,
  tenantId: string,
  booksId: string,
): MemberFeeModel {
  const fee = new MemberFeeModel(tenantId);
  fee.accountingTenantId = booksId;

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
    defaultCategoryList,
  });

  // The per-member rebate (Ausbildungs-/Familienrabatt) is an override a treasurer set on THIS
  // membership, not a rule of the year's price list — the old `convertMembershipToFee` copied it
  // onto the fee and subtracted it. Without this every regenerated fee would bill the full amount
  // while migrated rows still carried their rebate, and the difference would only surface in the
  // next Rechnungslauf.
  const rebate = rebatePosition(membership.rebate, membership.rebateReason, fee.positions);
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
function buildBexioPositions(fee: MemberFeeModel, categoryLabel = ''): BexioPosition[] {
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
