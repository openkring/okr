import { computed, inject } from '@angular/core';
import { rxResource, toObservable } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { filter, firstValueFrom, of, timeout } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AccountModel, BudgetLineModel, BudgetVersionModel, MoneyModel } from '@okr/shared-models';
import { AlertService, error, resourceParams } from '@okr/shared-util-angular';
import { DateFormat, fill, getTodayStr } from '@okr/shared-util-core';

import { AccountService } from '@okr/finance-account-data-access';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { BudgetService } from '@okr/finance-budget-data-access';
import { BUDGET_I18N_KEYS, BudgetApprovalFormModel, BudgetI18n, isVersionEditable, planApproval } from '@okr/finance-budget-util';
import { CostCenterStore } from '@okr/finance-cost-center-feature';
import { ReportingService } from '@okr/finance-reporting-data-access';
import { fiscalYear, fiscalYearOf } from '@okr/finance-reporting-util';

export type { BudgetI18n };

/** The list's archive filter: 'all' is what okr-list-filter's state select prepends itself. */
export type BudgetArchiveFilter = 'active' | 'archived' | 'all';

/** One fiscal year of the version list (newest year first). */
export interface BudgetVersionGroup {
  fiscalYear: number;
  label: string;
  versions: BudgetVersionModel[];
}

export type BudgetState = {
  searchTerm: string;
  archiveFilter: BudgetArchiveFilter;
  /** set by editLine / a grid page: the Kontoplan of the books (cheap, no journal) */
  accountsNeeded: boolean;
  /** how many live pages (grid, comparison) show actuals; > 0 streams the whole journal of the books */
  actualsUsers: number;
};

export const initialBudgetState: BudgetState = {
  searchTerm: '',
  archiveFilter: 'active',
  accountsNeeded: false,
  actualsUsers: 0,
};

/** True for a Firestore rules rejection — the client error carries `code: 'permission-denied'`. */
function isPermissionDenied(err: unknown): boolean {
  const _code = (err as { code?: unknown } | null)?.code;
  return _code === 'permission-denied' || String((err as { message?: unknown } | null)?.message ?? '').includes('permission-denied');
}

/**
 * Budget versions and their cells of the current accounting tenant (spec 1.65 phase 2). Root-provided
 * like the CostCenterStore: the version list, the grid and the comparison share one stream of versions
 * and lines. It also owns the actuals the grid and the comparison need (accounts, posted bookings and
 * their lines) — loaded only after `loadActuals()`, so the version list alone never streams the journal.
 *
 * Modals come from `@okr/finance-budget-ui` via `await import()` inside the methods (memory
 * store-modal-dynamic-import). A write the rules reject (`permission-denied`) is a stale tab editing a
 * version that was approved elsewhere: it shows the `frozen` toast.
 */
export const BudgetStore = signalStore(
  { providedIn: 'root' },
  withState(initialBudgetState),
  withProps(() => ({
    budgetService: inject(BudgetService),
    accountService: inject(AccountService),
    reportingService: inject(ReportingService),
    appStore: inject(AppStore),
    accountingStore: inject(AccountingStore),
    costCenterStore: inject(CostCenterStore),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => {
    /**
     * The journal streams only for a live page, once the config is known and the books are native
     * (an external backend owns its books, D9 — nothing to compare there).
     */
    const actualsActive = computed(() =>
      store.actualsUsers() > 0 && store.accountingStore.configLoaded() && !store.accountingStore.isExternallyManaged());
    return {
    i18n: store.i18nService.translateAll(BUDGET_I18N_KEYS) as BudgetI18n,
    /** emits true once the accounting config has answered (see `awaitConfig`) */
    configLoaded$: toObservable(store.accountingStore.configLoaded),
    versionsResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.budgetService.listVersions(params.id) : of([]),
    }),
    linesResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.budgetService.listLines(params.id) : of([]),
    }),
    // idle (undefined params) until editLine or a page with actuals asks for them
    accountsResource: rxResource({
      params: resourceParams(() => store.accountsNeeded() || actualsActive()
        ? { id: store.accountingStore.accountingTenantId() } : undefined),
      stream: ({ params }) => params.id ? store.accountService.list(params.id) : of([]),
    }),
    bookingsResource: rxResource({
      params: resourceParams(() => actualsActive() ? { id: store.accountingStore.accountingTenantId() } : undefined),
      stream: ({ params }) => params.id ? store.reportingService.getJournalEntries(params.id) : of([]),
    }),
    bookingLinesResource: rxResource({
      params: resourceParams(() => actualsActive() ? { id: store.accountingStore.accountingTenantId() } : undefined),
      stream: ({ params }) => params.id ? store.reportingService.getAllLines(params.id) : of([]),
    }),
    };
  }),

  withComputed((state) => ({
    /** every version of the books, archived included */
    allVersions: computed(() => state.versionsResource.value() ?? []),
    /** all live cells of the books (archived excluded) */
    lines: computed(() => (state.linesResource.value() ?? []).filter(l => !l.isArchived)),
    isLoading: computed(() => state.versionsResource.isLoading() || state.linesResource.isLoading()),
    accounts: computed(() => state.accountsResource.value() ?? []),
    bookings: computed(() => state.bookingsResource.value() ?? []),
    bookingLines: computed(() => state.bookingLinesResource.value() ?? []),
    /** true while a page waits for actuals: the config is not known yet (nothing streams before), or a stream is loading */
    actualsLoading: computed(() =>
      (state.actualsUsers() > 0 && !state.accountingStore.configLoaded())
      || state.accountsResource.isLoading() || state.bookingsResource.isLoading() || state.bookingLinesResource.isLoading()),
    fiscalYearStart: computed(() => state.accountingStore.config()?.fiscalYearStart ?? 1),
    functionalCurrency: computed(() => state.accountingStore.config()?.functionalCurrency ?? 'CHF'),
    accountingTenantId: computed(() => state.accountingStore.accountingTenantId()),
    currentUser: computed(() => state.appStore.currentUser()),
    /** bexio (or any external backend) owns the books: no budgets here (D9) */
    isEnabled: computed(() => !state.accountingStore.isExternallyManaged()),
  })),

  withComputed((state) => ({
    /** the running fiscal year (the year it starts in) */
    currentFiscalYear: computed(() => fiscalYearOf(getTodayStr(DateFormat.StoreDate), state.fiscalYearStart())),
    /** the versions the list shows: archive filter, then name substring */
    versions: computed(() => {
      const _filter = state.archiveFilter();
      const _term = state.searchTerm().trim().toLowerCase();
      return state.allVersions().filter(v => {
        if (_filter === 'active' && v.isArchived) return false;
        if (_filter === 'archived' && !v.isArchived) return false;
        return _term.length === 0 || (v.name ?? '').toLowerCase().includes(_term);
      });
    }),
    activeCount: computed(() => state.allVersions().filter(v => !v.isArchived).length),
  })),

  withComputed((state) => ({
    /** the filtered versions per fiscal year, newest year first; inside a year by name */
    versionGroups: computed((): BudgetVersionGroup[] => {
      const _byYear = new Map<number, BudgetVersionModel[]>();
      for (const _v of state.versions()) {
        const _list = _byYear.get(_v.fiscalYear) ?? [];
        _list.push(_v);
        _byYear.set(_v.fiscalYear, _list);
      }
      return [..._byYear.entries()]
        .sort(([a], [b]) => b - a)
        .map(([year, versions]) => ({
          fiscalYear: year,
          label: fiscalYear(year, state.fiscalYearStart()).label,
          versions: [...versions].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
        }));
    }),
    /** the years the version form offers: last, running, next two, plus any year that already has a version */
    yearChoices: computed((): number[] => {
      const _current = state.currentFiscalYear();
      const _set = new Set<number>([_current - 1, _current, _current + 1, _current + 2]);
      state.allVersions().forEach(v => { if (v.fiscalYear) _set.add(v.fiscalYear); });
      return [..._set].sort((a, b) => b - a);
    }),
  })),

  withMethods((store) => {
    /** The live state of a version (the list may hand in a snapshot that is already stale). */
    const liveVersion = (key: string): BudgetVersionModel | undefined => store.allVersions().find(v => v.okey === key);

    /** False (with the `frozen` toast) when the version is no longer a live draft. */
    const ensureEditable = async (versionKey: string): Promise<boolean> => {
      const _v = liveVersion(versionKey);
      if (_v && isVersionEditable(_v)) return true;
      await store.alertService.showToast(store.i18n.toast_frozen());
      return false;
    };

    /**
     * Writes that go through FirestoreService swallow the error (it toasts its own message and
     * resolves undefined); a failed write on a version that turned frozen in the meantime adds the
     * `frozen` hint so the user knows why.
     */
    const afterSwallowedWrite = async (result: string | boolean | undefined, versionKey: string): Promise<void> => {
      if (result) return;
      const _v = liveVersion(versionKey);
      if (_v && !isVersionEditable(_v)) await store.alertService.showToast(store.i18n.toast_frozen());
    };

    /** A thrown batch error: rules rejection → `frozen`, anything else → generic error toast. */
    const onBatchError = async (err: unknown, where: string): Promise<void> => {
      error(undefined, `BudgetStore.${where}: ${String((err as { message?: unknown })?.message ?? err)}`, true);
      await store.alertService.showToast(isPermissionDenied(err) ? store.i18n.toast_frozen() : store.i18n.toast_error());
    };

    /** The Kontoplan for the line modal: the resource when it has answered, else one read. */
    const loadAccountsNow = async (): Promise<AccountModel[]> => {
      if (!store.accountsNeeded()) patchState(store, { accountsNeeded: true });
      const _loaded = store.accounts();
      if (_loaded.length > 0) return _loaded;
      const _tenant = store.accountingTenantId();
      return _tenant ? await firstValueFrom(store.accountService.list(_tenant)) : [];
    };

    /** Waits (max 5 s) for the accounting config, so a new cell does not take the CHF fallback currency; else the error toast. */
    const awaitConfig = async (): Promise<boolean> => {
      if (store.accountingStore.configLoaded()) return true;
      try {
        await firstValueFrom(store.configLoaded$.pipe(filter(loaded => loaded), timeout(5000)));
        return true;
      } catch {
        await store.alertService.showToast(store.i18n.toast_error());
        return false;
      }
    };

    return {
      setSearchTerm(searchTerm: string): void {
        patchState(store, { searchTerm });
      },

      setArchiveFilter(archiveFilter: string): void {
        const _filter: BudgetArchiveFilter = archiveFilter === 'archived' || archiveFilter === 'all' ? archiveFilter : 'active';
        patchState(store, { archiveFilter: _filter });
      },

      /**
       * The grid and the comparison call this once when they are created: accounts, posted bookings and their
       * lines start streaming (after the config is loaded, native books only). Pair it with `releaseActuals()`.
       */
      loadActuals(): void {
        patchState(store, { actualsUsers: store.actualsUsers() + 1 });
      },

      /** The page that called `loadActuals()` is gone; the last one out stops the journal stream. */
      releaseActuals(): void {
        patchState(store, { actualsUsers: Math.max(0, store.actualsUsers() - 1) });
      },

      /** The Kontoplan alone (account names in the grid, the line modal) — no journal. */
      loadAccounts(): void {
        if (!store.accountsNeeded()) patchState(store, { accountsNeeded: true });
      },

      fiscalYearLabel(year: number): string {
        return fiscalYear(year, store.fiscalYearStart()).label;
      },

      linesOf(versionKey: string): BudgetLineModel[] {
        return store.lines().filter(l => l.versionKey === versionKey);
      },

      version(versionKey: string): BudgetVersionModel | undefined {
        return liveVersion(versionKey);
      },

      /*-------------------------- versions --------------------------------*/
      /**
       * The first version of a fiscal year, without cells. Without a year: the running year when it
       * has no version yet, else the next one (budgets are mostly prepared ahead).
       */
      async newVersion(year?: number): Promise<void> {
        if (!store.isEnabled() || !await awaitConfig()) return;
        const _current = store.currentFiscalYear();
        const _taken = (y: number) => store.allVersions().some(v => !v.isArchived && v.fiscalYear === y);
        const _year = year ?? (_taken(_current) ? _current + 1 : _current);
        const _version = new BudgetVersionModel(store.appStore.tenantId(), store.accountingTenantId(), _year);
        const _data = await this.openVersionModal(_version, '', false);
        if (!_data) return;
        await store.budgetService.createVersion({ ..._data, status: 'draft', basedOnVersionKey: '' }, store.currentUser());
      },

      /**
       * A new draft that copies every cell of `base` (D11). Year and kind start from the base; the name
       * starts empty, so the copy gets its own name (and the modal's save banner appears once it is typed).
       */
      async copyFrom(base: BudgetVersionModel): Promise<void> {
        if (!store.isEnabled() || !await awaitConfig()) return;
        const _next = new BudgetVersionModel(store.appStore.tenantId(), store.accountingTenantId(), base.fiscalYear);
        _next.kind = base.kind ?? 'budget';
        _next.name = '';
        _next.basedOnVersionKey = base.okey;
        const _data = await this.openVersionModal(_next, base.name, false);
        if (!_data) return;
        const _baseLines = this.linesOf(base.okey);
        try {
          await store.budgetService.copyVersion(base, { ..._data, basedOnVersionKey: base.okey }, _baseLines);
          await store.alertService.showToast(fill(store.i18n.copy_conf(), { count: _baseLines.length, name: base.name }));
        } catch (err) {
          await onBatchError(err, 'copyFrom');
        }
      },

      /** Rename / change kind, notes or (while it has no cells) the year of a draft; read-only otherwise. */
      async editVersion(version: BudgetVersionModel, readOnly = true): Promise<void> {
        const _readOnly = readOnly || !store.isEnabled() || !isVersionEditable(version);
        const _data = await this.openVersionModal(version, liveVersion(version.basedOnVersionKey)?.name ?? '', _readOnly);
        if (!_data || _readOnly) return;
        if (!await ensureEditable(version.okey)) return;
        const _result = await store.budgetService.updateVersion(_data, store.currentUser());
        await afterSwallowedWrite(_result, version.okey);
      },

      /** Opens the version modal; resolves the edited model on *save*, undefined otherwise. */
      async openVersionModal(version: BudgetVersionModel, baseVersionName: string, readOnly: boolean): Promise<BudgetVersionModel | undefined> {
        const { BudgetVersionEditModal } = await import('@okr/finance-budget-ui');
        const modal = await store.modalController.create({
          component: BudgetVersionEditModal,
          componentProps: {
            version,
            years: store.yearChoices(),
            fiscalYearLocked: !!version.okey && this.linesOf(version.okey).length > 0,
            baseVersionName,
            currentUser: store.currentUser(),
            readOnly,
          },
        });
        await modal.present();
        const { data, role } = await modal.onDidDismiss<BudgetVersionModel>();
        return role === 'confirm' && data ? data : undefined;
      },

      /**
       * Approves a draft: date, body and reference from the approve modal, then ONE batch that also
       * supersedes the previously approved version of the same year and kind (D11/D12).
       */
      async approve(version: BudgetVersionModel): Promise<void> {
        if (!store.isEnabled()) return;
        if (!await ensureEditable(version.okey)) return;
        const _target = liveVersion(version.okey) ?? version;
        const _dryRun = planApproval(store.allVersions(), _target, { approvedAt: '', approvedBy: 'gv', approvalRef: '' });
        const _supersededName = _dryRun.supersede.map(key => liveVersion(key)?.name ?? '').filter(n => n.length > 0).join(', ');

        const { BudgetApproveModal } = await import('@okr/finance-budget-ui');
        const modal = await store.modalController.create({
          component: BudgetApproveModal,
          componentProps: { version: _target, supersededName: _supersededName, readOnly: false },
        });
        await modal.present();
        const { data, role } = await modal.onDidDismiss<BudgetApprovalFormModel>();
        if (role !== 'confirm' || !data || (data.approvedBy !== 'gv' && data.approvedBy !== 'board')) return;
        if (!await store.alertService.confirm(store.i18n.approve_conf(), true)) return;

        try {
          // re-planned on the live list: another approval may have landed while the modal was open
          const _live = liveVersion(version.okey) ?? _target;
          const _patch = planApproval(store.allVersions(), _live, {
            approvedAt: data.approvedAt || getTodayStr(DateFormat.StoreDate),
            approvedBy: data.approvedBy,
            approvalRef: data.approvalRef ?? '',
          });
          await store.budgetService.approve(_patch);
          await store.alertService.showToast(store.i18n.toast_approved());
        } catch (err) {
          if ((err as { message?: unknown })?.message === 'budget-not-draft') {
            await store.alertService.showToast(store.i18n.toast_frozen());
            return;
          }
          await onBatchError(err, 'approve');
        }
      },

      /** Drafts only; archived, never deleted (the rules forbid deleting a version). */
      async archive(version: BudgetVersionModel): Promise<void> {
        if (!store.isEnabled() || version.isArchived) return;
        if (!await ensureEditable(version.okey)) return;
        if (!await store.alertService.confirm(store.i18n.archive_conf(), true)) return;
        const _result = await store.budgetService.archiveVersion(liveVersion(version.okey) ?? version, store.currentUser());
        await afterSwallowedWrite(_result, version.okey);
      },

      /*-------------------------- lines (cells) --------------------------------*/
      /**
       * Opens the line modal for a new cell (no `line`) or an existing one. Read-only unless the
       * version is a live draft on native books and the user is a treasurer. A new cell takes the
       * books' functional currency.
       */
      async editLine(versionKey: string, line?: BudgetLineModel, costCenterKey = '', accountKey = ''): Promise<void> {
        const _version = liveVersion(versionKey);
        if (!_version) return;
        const _readOnly = !store.isEnabled() || !isVersionEditable(_version);
        if (!line && _readOnly) {
          await store.alertService.showToast(store.i18n.toast_frozen());
          return;
        }
        if (!line && !await awaitConfig()) return; // a new cell takes the books' currency: wait for the config
        const _line = line ?? new BudgetLineModel(store.appStore.tenantId(), store.accountingTenantId(), versionKey);
        if (!line) {
          _line.amount = new MoneyModel(0, store.functionalCurrency());
          _line.costCenterKey = costCenterKey; // prefilled by the card's «Zeile hinzufügen» or an unbudgeted row
          _line.accountKey = accountKey;
        }
        const _accounts = await loadAccountsNow();

        const { BudgetLineEditModal } = await import('@okr/finance-budget-ui');
        const modal = await store.modalController.create({
          component: BudgetLineEditModal,
          componentProps: {
            line: _line,
            costCenters: store.costCenterStore.costCenters(),
            accounts: _accounts,
            existingLines: this.linesOf(versionKey),
            currentUser: store.currentUser(),
            readOnly: _readOnly,
          },
        });
        await modal.present();
        const { data, role } = await modal.onDidDismiss<BudgetLineModel>();
        if (role !== 'confirm' || !data || _readOnly) return;
        if (!await ensureEditable(versionKey)) return;
        const _currency = data.okey ? (data.amount?.currency || store.functionalCurrency()) : store.functionalCurrency();
        const _toSave: BudgetLineModel = {
          ...data,
          versionKey,
          accountingTenantId: store.accountingTenantId(),
          amount: new MoneyModel(data.amount?.amount ?? 0, _currency, data.amount?.periodicity),
        };
        const _result = await store.budgetService.saveLine(_toSave, store.currentUser());
        await afterSwallowedWrite(_result, versionKey);
      },

      /** Deletes a cell of a draft for good (nothing references a budget line), after a confirm. */
      async deleteLine(line: BudgetLineModel): Promise<void> {
        if (!store.isEnabled()) return;
        if (!await ensureEditable(line.versionKey)) return;
        if (!await store.alertService.confirm(store.i18n.deleteLine_conf(), true)) return;
        const _deleted = await store.budgetService.deleteLine(line);
        await afterSwallowedWrite(_deleted, line.versionKey);
      },
    };
  }),
);
