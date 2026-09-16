import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { UploadService } from '@okr/avatar-data-access';
import { BANK_CSV_MIMETYPES } from '@okr/shared-constants';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AccountModel } from '@okr/shared-models';
import { AlertService, exportCsv } from '@okr/shared-util-angular';
import { fill, generateRandomString } from '@okr/shared-util-core';

import { AccountService } from '@okr/finance-account-data-access';
import {
  ACCOUNT_I18N_KEYS, AccountI18n, accountSubtree, buildImportedChartOfAccounts, chartOfAccountsToRows, ChartOfAccountsCsvError,
  flattenAccountForest, getDefaultExpandedKeys, isAccount, parseChartOfAccountsCsv
} from '@okr/finance-account-util';
import { BookingLineService } from '@okr/finance-booking-data-access';
import { AccountingStore } from '@okr/finance-accounting-feature';

export type { AccountI18n };

/**
 * Read the file as UTF-8; if that yields replacement characters (a Windows-1252 export from an older
 * accounting program), decode it again as Windows-1252.
 */
async function readTextFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  return utf8.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(buffer) : utf8;
}

export type AccountListState = {
  // null = the user hasn't toggled anything yet -> the default 2-tier expansion is used.
  userExpandedKeys: string[] | null;
};

export const initialState: AccountListState = {
  userExpandedKeys: null,
};

export const AccountStore = signalStore(
  withState(initialState),
  withProps(() => ({
    accountService: inject(AccountService),
    bookingLineService: inject(BookingLineService),
    appStore: inject(AppStore),
    accountingStore: inject(AccountingStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
    uploadService: inject(UploadService),
    alertService: inject(AlertService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(ACCOUNT_I18N_KEYS),
  })),
  withProps((store) => ({
    accountsResource: rxResource({
      params: () => store.accountingStore.accountingTenantId(),
      stream: ({ params: accountingTenantId }) =>
        accountingTenantId ? store.accountService.list(accountingTenantId) : of([]),
    })
  })),

  withComputed((state) => ({
    accounts: computed(() => state.accountsResource.value() ?? []),
    isLoading: computed(() => state.accountsResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
    isReadOnly: computed(() => state.accountingStore.isExternallyManaged()),
    // Resolved expansion: the user's manual set once they've toggled, otherwise the default 2-tier set.
    expandedKeys: computed(() =>
      state.userExpandedKeys() ?? getDefaultExpandedKeys(state.accountsResource.value() ?? [])
    ),
  })),

  withComputed((state) => ({
    visibleNodes: computed(() =>
      flattenAccountForest(state.accountsResource.value() ?? [], state.expandedKeys())
    ),
  })),

  withMethods((store) => ({
    reset(): void {
      patchState(store, initialState);
      store.accountsResource.reload();
    },

    /*-------------------------- tree expansion --------------------------------*/
    toggleExpand(okey: string): void {
      const current = store.expandedKeys();
      const next = current.includes(okey)
        ? current.filter(k => k !== okey)
        : [...current, okey];
      patchState(store, { userExpandedKeys: next });
    },

    /*-------------------------- actions --------------------------------*/
    /**
     * The toolbar's "new" action. It opens a normal account (Konto/Kontogruppe) whose Hauptkonto
     * the user picks in the form. Only while the accounting tenant has no chart of accounts at all
     * does it create the root itself — there would be no parent to pick, and the alternatives
     * (import, standard chart) may not be what the user wants.
     */
    async addAccount(): Promise<void> {
      const account = new AccountModel(store.appStore.tenantId());
      account.accountingTenantId = store.accountingStore.accountingTenantId();
      const hasRoot = store.accounts().some(a => a.type === 'root');
      account.type = hasRoot ? 'leaf' : 'root';
      await this.edit(account, false);
    },

    async addChild(parentKey: string): Promise<void> {
      const account = new AccountModel(store.appStore.tenantId());
      account.accountingTenantId = store.accountingStore.accountingTenantId();
      account.parentKey = parentKey;
      account.type = 'leaf';
      await this.edit(account, false);
    },

    async edit(account: AccountModel, readOnly = true): Promise<void> {
      // Lazy import to break the store <-> modal circular reference at module load time.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { AccountEditModal } = await import('./account-edit.modal' as any);
      const modal = await store.modalController.create({
        component: AccountEditModal,
        componentProps: {
          account,
          currentUser: store.currentUser(),
          readOnly
        }
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        if (isAccount(data, store.appStore.tenantId())) {
          if (data.okey?.length > 0) {
            await store.accountService.update(data, store.currentUser());
          } else {
            const newKey = await store.accountService.create(data, store.currentUser());
            // auto-expand the parent so new child is visible
            if (newKey && data.parentKey) {
              patchState(store, {
                userExpandedKeys: [...store.expandedKeys(), data.parentKey]
              });
            }
          }
        }
      }
      store.accountsResource.reload();
    },

    /**
     * Deleting any node (leaf, group, root) cascades to all its descendants — a group takes its
     * whole subtree with it. Two gates before that happens:
     *   1. booked-on accounts are never deleted. The booking lines would keep pointing at an
     *      archived account that no longer resolves anywhere in the journal or the reports.
     *   2. the user confirms, and the question names how many accounts go along.
     * @param account the node the user picked in the tree
     * @param readOnly no deletion at all in a read-only (externally managed) chart
     */
    async delete(account: AccountModel, readOnly = true): Promise<void> {
      if (readOnly) return;
      const accountingTenantId = store.accountingStore.accountingTenantId();
      const subtree = accountSubtree(store.accounts(), account.okey);

      const usedLines = await store.bookingLineService.countByAccountKeys(accountingTenantId, subtree.map(a => a.okey));
      if (usedLines > 0) {
        await store.alertService.confirm(fill(store.i18n.delete_inUse(), { name: account.name, count: usedLines }));
        return;
      }

      const children = subtree.length - 1;
      const question = children > 0
        ? fill(store.i18n.delete_conf_tree(), { name: account.name, count: children })
        : fill(store.i18n.delete_conf_one(), { name: account.name });
      if (!await store.alertService.confirm(question, true)) return;

      await store.accountService.deleteTree(account.okey, accountingTenantId, store.currentUser());
      store.accountsResource.reload();
    },

    /** Seeds the standard Swiss KMU chart of accounts — offered while the tenant has no accounts. */
    async seedStandard(): Promise<void> {
      if (store.isReadOnly()) return;
      await store.accountService.seedChartOfAccounts(store.appStore.tenantId(), store.accountingStore.accountingTenantId());
      store.accountsResource.reload();
    },

    /**
     * Imports a chart of accounts from a CSV file (Nummer, Name, Gruppe, Kontoart) as a NEW root next
     * to the existing ones. The user names the chart; the file name is proposed.
     */
    async importPlan(): Promise<void> {
      if (store.isReadOnly()) return;
      const file = await store.uploadService.pickFile(BANK_CSV_MIMETYPES);
      if (!file) return;
      let rows;
      try {
        rows = parseChartOfAccountsCsv(await readTextFile(file));
      } catch (e) {
        const key = e instanceof ChartOfAccountsCsvError && e.code === 'empty' ? 'import_empty' : 'import_invalid';
        await store.alertService.confirm(store.i18n[key]());
        return;
      }
      const proposedName = file.name.replace(/\.[^.]+$/, '');
      const rootName = await store.alertService.okrPrompt(store.i18n.import_prompt(), store.i18n.import_placeholder(), proposedName);
      if (!rootName) return;

      const rootKey = `${store.accountingStore.accountingTenantId()}-${generateRandomString(8)}`;
      const result = buildImportedChartOfAccounts(rows, store.appStore.tenantId(), store.accountingStore.accountingTenantId(), rootKey, rootName);
      const ok = await store.accountService.importChartOfAccounts(result.accounts);
      if (!ok) return;
      store.accountsResource.reload();
      patchState(store, { userExpandedKeys: null });

      const notes: string[] = [];
      if (result.orphans.length > 0) notes.push(`${store.i18n.import_orphans()} ${result.orphans.join(', ')}`);
      if (result.duplicates.length > 0) notes.push(`${store.i18n.import_duplicates()} ${result.duplicates.join(', ')}`);
      const summary = `${result.accounts.length - 1} ${store.i18n.import_done()}`;
      if (notes.length > 0) {
        await store.alertService.confirm([summary, ...notes].join('<br/>'));
      } else {
        await store.alertService.showToast(summary);
      }
    },

    /** Exports every chart of accounts of the accounting tenant as CSV (Nummer, Name, Gruppe, Kontoart). */
    async exportPlan(): Promise<void> {
      const accounts = store.accounts();
      const roots = accounts.filter(a => a.type === 'root');
      if (roots.length === 0) {
        await store.alertService.showToast(store.i18n.empty());
        return;
      }
      const fileName = roots.length === 1 ? roots[0].name : 'kontoplan';
      await exportCsv(chartOfAccountsToRows(accounts, roots), `${fileName}.csv`);
    },

    getTitleLabel(readOnly: boolean, key?: string): string {
      if (readOnly) {
        return store.i18n.view();
      }
      if (key && key.length > 0) {
        return store.i18n.update();
      } else {
        return store.i18n.create();
      }
    }
  }))
);
