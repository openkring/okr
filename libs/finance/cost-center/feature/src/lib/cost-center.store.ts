import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActionSheetController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, of } from 'rxjs';

import { AppStore, ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CostCenterModel } from '@okr/shared-models';
import { AlertService, error } from '@okr/shared-util-angular';
import { DateFormat, fill, getTodayStr } from '@okr/shared-util-core';

import { AccountingStore } from '@okr/finance-accounting-feature';
import { CostCenterMigrationStep, CostCenterService } from '@okr/finance-cost-center-data-access';
import { CostCenterEditModal } from '@okr/finance-cost-center-ui';
import { COST_CENTER_I18N_KEYS, CostCenterI18n, backfillYearChoices, leafCostCenters, sortCostCenterTree } from '@okr/finance-cost-center-util';
import { PeriodService } from '@okr/finance-period-data-access';
import { fiscalYearOf } from '@okr/finance-reporting-util';
import { ResponsibilityService } from '@okr/relationship-responsibility-data-access';

export type { CostCenterI18n };

/** entries of the migration alert's lists before «… und N weitere» */
const MIGRATE_LIST_CAP = 20;

/** The list's archive filter: 'all' is what okr-list-filter's category select prepends itself. */
export type CostCenterArchiveFilter = 'active' | 'archived' | 'all';

export type CostCenterState = {
  searchTerm: string;
  archiveFilter: CostCenterArchiveFilter;
  /** set by the list / edit(): only they show responsibility names — the pickers never load them */
  responsibilitiesNeeded: boolean;
};

export const initialCostCenterState: CostCenterState = {
  searchTerm: '',
  archiveFilter: 'active',
  responsibilitiesNeeded: false,
};

/**
 * Kostenstellen of the current accounting tenant (spec 1.65). Root-provided so the booking,
 * expense and bill forms can read `activeLeaves` for their `okr-cost-center-select` without
 * loading the list a second time. The accounting tenant comes from the root AccountingStore,
 * which the accounting shell sets from the route.
 */
export const CostCenterStore = signalStore(
  { providedIn: 'root' },
  withState(initialCostCenterState),
  withProps(() => ({
    costCenterService: inject(CostCenterService),
    responsibilityService: inject(ResponsibilityService),
    modelSelectService: inject(ModelSelectService),
    appStore: inject(AppStore),
    accountingStore: inject(AccountingStore),
    modalController: inject(ModalController),
    actionSheetController: inject(ActionSheetController),
    periodService: inject(PeriodService),
    alertService: inject(AlertService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(COST_CENTER_I18N_KEYS) as CostCenterI18n,
    costCentersResource: rxResource({
      params: () => store.accountingStore.accountingTenantId(),
      stream: ({ params: accountingTenantId }) =>
        accountingTenantId ? store.costCenterService.list(accountingTenantId) : of([]),
    }),
    // idle (undefined params) until a consumer that shows names asks for them
    responsibilitiesResource: rxResource({
      params: () => store.responsibilitiesNeeded() || undefined,
      stream: () => store.responsibilityService.list('name', 'asc'),
    }),
  })),

  withComputed((state) => ({
    /** all cost centres of the accounting tenant, archived included */
    costCenters: computed(() => state.costCentersResource.value() ?? []),
    responsibilities: computed(() => state.responsibilitiesResource.value() ?? []),
    isLoading: computed(() => state.costCentersResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
    /** bexio (or any external backend) owns the books: cost centres are not maintained here */
    isEnabled: computed(() => !state.accountingStore.isExternallyManaged()),
  })),

  withComputed((state) => ({
    /** the only cost centres a line may be booked on */
    activeLeaves: computed(() => leafCostCenters(state.costCenters())),
    /** the whole tree, depth-first, before any filter */
    tree: computed(() => sortCostCenterTree(state.costCenters())),
  })),

  withComputed((state) => ({
    /** the tree rows the list shows: archive filter, then number prefix / name substring */
    filteredTree: computed(() => {
      const _filter = state.archiveFilter();
      const _term = state.searchTerm().trim().toLowerCase();
      return state.tree().filter(({ center }) => {
        if (_filter === 'active' && center.isArchived) return false;
        if (_filter === 'archived' && !center.isArchived) return false;
        if (_term.length === 0) return true;
        return center.id.toLowerCase().startsWith(_term) || center.name.toLowerCase().includes(_term);
      });
    }),
    activeCount: computed(() => state.costCenters().filter(c => !c.isArchived).length),
  })),

  withMethods((store) => ({
    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },

    setArchiveFilter(archiveFilter: string): void {
      const _filter: CostCenterArchiveFilter = archiveFilter === 'archived' || archiveFilter === 'all' ? archiveFilter : 'active';
      patchState(store, { archiveFilter: _filter });
    },

    /** The list and the edit modal show responsibility names; call before reading `responsibilities()`. */
    loadResponsibilities(): void {
      if (!store.responsibilitiesNeeded()) patchState(store, { responsibilitiesNeeded: true });
    },

    responsibilityName(key: string): string {
      if (!key) return '';
      return store.responsibilities().find(r => r.okey === key)?.name ?? '';
    },

    /*-------------------------- actions --------------------------------*/
    /** the context menu's *add*: a leaf, or the first root while the tree is still empty */
    async add(): Promise<void> {
      if (!store.isEnabled()) return;
      const _center = new CostCenterModel(store.appStore.tenantId(), store.accountingStore.accountingTenantId());
      _center.type = store.costCenters().some(c => !c.isArchived) ? 'leaf' : 'root';
      await this.edit(_center, false);
    },

    async edit(costCenter: CostCenterModel, readOnly = true): Promise<void> {
      this.loadResponsibilities();
      const _readOnly = readOnly || !store.isEnabled();
      const modal = await store.modalController.create({
        component: CostCenterEditModal,
        componentProps: {
          costCenter,
          costCenters: store.costCenters(),
          responsibilities: store.responsibilities(),
          currentUser: store.currentUser(),
          readOnly: _readOnly,
          selectResponsibility: () => store.modelSelectService.selectResponsibility(),
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss<CostCenterModel>();
      if (role !== 'confirm' || !data || _readOnly) return;
      // a root sits at the top: a stale parent from an earlier choice in the form must not survive
      const _center: CostCenterModel = data.type === 'root' ? { ...data, parentKey: '' } : data;
      if (_center.okey) {
        await store.costCenterService.update(_center, store.currentUser());
      } else {
        await store.costCenterService.create(_center, store.currentUser());
      }
    },

    /**
     * Archives (never deletes — booking lines may point at it). A group that still has active
     * children is refused: archiving it would leave those children hanging below an archived node.
     */
    async archive(costCenter: CostCenterModel): Promise<void> {
      if (!store.isEnabled() || costCenter.isArchived) return;
      if (store.costCenters().some(c => c.parentKey === costCenter.okey && !c.isArchived)) {
        await store.alertService.showToast(store.i18n.archive_hasChildren());
        return;
      }
      if (!await store.alertService.confirm(store.i18n.archive_conf(), true)) return;
      await store.costCenterService.archive(costCenter, store.currentUser());
    },

    /**
     * One-off migration (spec 1.65 §6.4): a dry run first, shown as an alert with the counts and
     * the values that match no cost centre; only on *OK* the same call is repeated for real.
     */
    /** Action sheet of the fiscal years with periods (newest first, locked ones marked); undefined = cancelled. */
    async pickBackfillYear(accountingTenantId: string): Promise<number | undefined> {
      const _current = fiscalYearOf(getTodayStr(DateFormat.StoreDate), store.accountingStore.config()?.fiscalYearStart ?? 1);
      const _periods = await firstValueFrom(store.periodService.list(accountingTenantId)).catch(() => []);
      const _sheet = await store.actionSheetController.create({
        header: store.i18n.migrate_yearSelect(),
        buttons: [
          ...backfillYearChoices(_periods, _current).map(c => ({
            text: c.locked ? fill(store.i18n.migrate_yearLocked(), { year: c.year }) : String(c.year),
            data: { year: c.year },
          })),
          { text: store.i18n.cancel(), role: 'cancel' },
        ],
      });
      await _sheet.present();
      const { data } = await _sheet.onDidDismiss();
      return (data as { year?: number } | undefined)?.year;
    },

    async migrate(step: CostCenterMigrationStep): Promise<void> {
      const _tenant = store.accountingStore.accountingTenantId();
      if (!store.isEnabled() || !_tenant) return;
      const _describe = (list: { collection: string; okey: string; value: string }[]): string => {
        const _shown = list.slice(0, MIGRATE_LIST_CAP).map(u => `${u.collection}/${u.okey}: ${u.value}`).join('; ');
        return list.length > MIGRATE_LIST_CAP
          ? `${_shown} ${fill(store.i18n.migrate_more(), { count: list.length - MIGRATE_LIST_CAP })}`
          : _shown;
      };
      try {
        // backfill: one fiscal year, picked from the years that have periods (spec 1.65 D19)
        let _year: number | undefined;
        if (step === 'backfill') {
          _year = await this.pickBackfillYear(_tenant);
          if (_year === undefined) return;   // cancelled
        }
        const _preview = await store.costCenterService.migrate(_tenant, step, true, _year);
        // a function deployed before D19 ignores the year and would report (and apply) the current one
        if (_year !== undefined && _preview.fiscalYear !== _year) {
          await store.alertService.confirm(store.i18n.migrate_yearMismatch());
          return;
        }
        const _lines = [fill(store.i18n.migrate_report(), { scanned: _preview.scanned, updated: _preview.updated })];
        if (_year !== undefined) _lines.unshift(fill(store.i18n.migrate_year(), { year: _year }));
        if (_preview.unmatched.length > 0) _lines.push(fill(store.i18n.migrate_unmatched(), { list: _describe(_preview.unmatched) }));
        if (_preview.unattributed.length > 0) _lines.push(fill(store.i18n.migrate_unattributed(), { list: _describe(_preview.unattributed) }));
        const _inLocked = _preview.inLockedPeriods ?? 0;
        if (_inLocked > 0) _lines.push(fill(store.i18n.migrate_inLockedPeriods(), { count: _inLocked }));
        const _lockedSkipped = _preview.lockedSkipped ?? 0;
        if (_lockedSkipped > 0) _lines.push(fill(store.i18n.migrate_lockedSkipped(), { count: _lockedSkipped }));
        if (_preview.updated === 0) {
          // nothing to apply: inform only (the unattributed list and the locked count, if any, still matter)
          await store.alertService.confirm(_preview.unattributed.length > 0 || _lockedSkipped > 0 ? _lines.join('\n\n') : store.i18n.migrate_none());
          return;
        }
        _lines.push(store.i18n.migrate_apply());
        if (!await store.alertService.confirm(_lines.join('\n\n'), true)) return;
        const _done = await store.costCenterService.migrate(_tenant, step, false, _year);
        await store.alertService.showToast(fill(store.i18n.migrate_done(), { updated: _done.updated }));
      } catch (err) {
        error(undefined, `CostCenterStore.migrate(${step}): ${String((err as { message?: unknown })?.message ?? err)}`, true);
        const _message = String((err as { message?: unknown })?.message ?? '');
        const _reason = (err as { details?: { reason?: unknown } })?.details?.reason;
        if (_reason === 'no-cost-centers' || _message.includes('no-cost-centers')) {
          // the server refuses: without an active leaf the step would clear every legacy value
          await store.alertService.showToast(store.i18n.migrate_noCostCenters());
          return;
        }
        await store.alertService.showToast(_message.includes('accounting-backend-not-native') ? store.i18n.migrate_refused() : store.i18n.migrate_error());
      }
    },
  })),
);
