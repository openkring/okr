import { Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonSelect, IonSelectOption, IonTitle, IonToolbar
} from '@ionic/angular/standalone';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner, StringSelect, StringSelectI18n } from '@okr/shared-ui';

import { ReadOnlyBanner } from '@okr/finance-accounting-feature';
import { formatMinorAmount } from '@okr/finance-booking-util';
import { AccountComparisonRow, buildAccountComparison, defaultCompareVersion, isNetOver, isOver, totalsByAccount } from '@okr/finance-budget-util';
import { aggregateByCostCenter, costCenterLabel, costCenterSubtreeKeys, postedLinesInRange, sortCostCenterTree } from '@okr/finance-cost-center-util';
import { ALL_COST_CENTERS, defaultExpandedKeys, effectiveCostCenterSelection, filterLinesByCostCenter, fiscalYear, NO_COST_CENTER } from '@okr/finance-reporting-util';

import { BudgetStore } from './budget.store';

/**
 * The Soll-Ist comparison (route `budget/compare?a=&b=`, spec 1.65 D18/D20): an Erfolgsrechnung by account —
 * version A, optionally version B of any year, the actuals of A's fiscal year, difference and % used, groups and
 * class totals rolled up, closed by the Jahresergebnis. The Kostenstelle filter works as on the Erfolgsrechnung
 * (subtree + «ohne Kostenstelle») and applies to the actuals and both versions.
 * The choice of A and B lives in the URL (`replaceUrl`, so the back button does not step through every pick).
 */
@Component({
  selector: 'okr-budget-compare-page',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ReadOnlyBanner, StringSelect,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonList, IonItem, IonLabel, IonSelect, IonSelectOption, IonIcon
  ],
  styles: [`
    .amounts { display: flex; justify-content: flex-end; gap: 16px; font-variant-numeric: tabular-nums; flex-wrap: wrap; }
    .amounts span { min-width: 84px; text-align: end; }
    .head { color: var(--ion-color-medium); font-size: 0.75rem; }
    .negative { color: var(--ion-color-danger); }
    .account h3 { font-weight: 400; }
    .group h3 { font-weight: 600; }
    .total h3, .result h3 { font-weight: 700; }
    ion-item.total, ion-item.result { --background: var(--ion-color-light); }
    .pickers { display: flex; flex-wrap: wrap; gap: 0 16px; padding: 0 16px; }
    .pickers ion-select { min-width: 160px; flex: 1 1 160px; }
    ion-icon.twisty { margin-inline-end: 8px; vertical-align: middle; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="backHref()" /></ion-buttons>
        <ion-title>{{ store.i18n.compare_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <okr-read-only-banner />
      @if (store.isLoading() || store.costCenterStore.isLoading()) {
        <okr-spinner />
      } @else {
        <div class="pickers">
          <ion-select interface="popover" [label]="store.i18n.fiscalYear()" labelPlacement="stacked" [value]="year()" (ionChange)="onYear($event.detail.value)">
            @for (y of store.yearChoices(); track y) {
              <ion-select-option [value]="y">{{ store.fiscalYearLabel(y) }}</ion-select-option>
            }
          </ion-select>
          <ion-select interface="popover" [label]="store.i18n.compare_versionA()" labelPlacement="stacked" [value]="aKey()" (ionChange)="onA($event.detail.value)">
            @for (v of yearVersions(); track v.okey) {
              <ion-select-option [value]="v.okey">{{ v.name }}</ion-select-option>
            }
          </ion-select>
          <ion-select interface="popover" [label]="store.i18n.compare_versionB()" labelPlacement="stacked" [value]="bKey()" (ionChange)="onB($event.detail.value)">
            <ion-select-option value="">{{ store.i18n.compare_noneB() }}</ion-select-option>
            @for (v of versionsForB(); track v.okey) {
              <ion-select-option [value]="v.okey">{{ v.name }} ({{ store.fiscalYearLabel(v.fiscalYear) }})</ion-select-option>
            }
          </ion-select>
        </div>
        @if (showCostCenterFilter()) {
          <okr-string-select [i18n]="costCenterI18n()" [stringList]="costCenterOptions()" [labels]="costCenterLabels()"
            [selectedString]="effectiveCostCenterKey()" (selectedStringChange)="costCenterKey.set($event)" [readOnly]="false" />
        }

        @if (!versionA()) {
          <okr-empty-list [message]="yearVersions().length === 0 ? store.i18n.compare_noVersion() : store.i18n.compare_empty()" />
        } @else if (store.actualsLoading()) {
          <okr-spinner />
        } @else {
          <ion-list lines="inset">
            <ion-item lines="none" class="ion-hide-sm-down">
              <ion-label class="head">&nbsp;</ion-label>
              <div slot="end" class="amounts head">
                <span>{{ nameA() }}</span>
                @if (versionB()) { <span>{{ nameB() }}</span> }
                <span>{{ store.i18n.col_actual() }}</span><span>{{ store.i18n.col_difference() }}</span><span>{{ store.i18n.col_used() }}</span>
              </div>
            </ion-item>
            @for (row of comparison().rows; track row.key) {
              <ion-item [button]="row.expandable" [detail]="false" (click)="toggle(row)" [class]="row.kind">
                <ion-label class="ion-text-wrap" [style.padding-inline-start.px]="row.depth * 16">
                  <h3>
                    @if (row.expandable) {
                      <ion-icon class="twisty" src="{{ (row.expanded ? 'chevron-down' : 'chevron-forward') | svgIcon }}" [attr.aria-label]="row.expanded ? store.i18n.compare_collapse() : store.i18n.compare_expand()" />
                    }
                    {{ row.id ? row.id + ' ' : '' }}{{ row.name }}
                  </h3>
                  <div class="amounts">
                    <span><small class="head ion-hide-sm-up">{{ nameA() }}</small> {{ fmt(row.budget) }}</span>
                    @if (versionB()) { <span><small class="head ion-hide-sm-up">{{ nameB() }}</small> {{ fmt(row.compare) }}</span> }
                    <span><small class="head ion-hide-sm-up">{{ store.i18n.col_actual() }}</small> {{ fmt(row.actual) }}</span>
                    <span [class.negative]="over(row)"><small class="head ion-hide-sm-up">{{ store.i18n.col_difference() }}</small> {{ fmt(row.diff) }}</span>
                    <span><small class="head ion-hide-sm-up">{{ store.i18n.col_used() }}</small> {{ percent(row.used) }}</span>
                  </div>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
  `
})
export class BudgetComparePage {
  protected readonly store = inject(BudgetStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** query params; withComponentInputBinding sets unbound inputs to undefined. Only read once, then the signals below rule. */
  public readonly a = input<string | undefined>();
  public readonly b = input<string | undefined>();

  protected readonly year = signal<number | undefined>(undefined);
  protected readonly aKey = signal('');
  protected readonly bKey = signal('');
  private readonly initialized = signal(false);

  protected readonly backHref = computed(() => `/accounting/${this.store.accountingTenantId()}/budget/c-budget`);
  /** the live versions of the chosen year (archived ones cannot be compared) */
  protected readonly yearVersions = computed(() =>
    this.store.allVersions().filter(v => !v.isArchived && v.fiscalYear === this.year()).sort((x, y) => (x.name ?? '').localeCompare(y.name ?? '')));
  protected readonly versionA = computed(() => this.yearVersions().find(v => v.okey === this.aKey()));
  /** B can be any live version of any fiscal year (D20); A itself is not offered */
  protected readonly versionsForB = computed(() =>
    this.store.allVersions().filter(v => !v.isArchived && v.okey !== this.aKey())
      .sort((x, y) => (y.fiscalYear - x.fiscalYear) || (x.name ?? '').localeCompare(y.name ?? '')));
  protected readonly versionB = computed(() => this.versionsForB().find(v => v.okey === this.bKey()));
  protected readonly nameA = computed(() => this.versionA()?.name ?? '');
  protected readonly nameB = computed(() => this.versionB()?.name ?? '');

  /** Kostenstelle filter, as on the Erfolgsrechnung */
  protected readonly costCenterKey = signal(ALL_COST_CENTERS);
  protected readonly costCenterOptions = computed(() =>
    [ALL_COST_CENTERS, ...sortCostCenterTree(this.store.costCenterStore.costCenters()).map(n => n.center.okey), NO_COST_CENTER]);
  protected readonly costCenterLabels = computed(() => [
    this.store.i18n.compare_allCostCenters(),
    ...sortCostCenterTree(this.store.costCenterStore.costCenters()).map(n => '  '.repeat(n.depth) + costCenterLabel(n.center)),
    this.store.i18n.noCostCenter()]);
  protected readonly showCostCenterFilter = computed(() => this.store.costCenterStore.isEnabled() && this.store.costCenterStore.costCenters().length > 0);
  protected readonly costCenterI18n = computed(() => ({ name: 'costCenterKey', label: this.store.i18n.compare_costCenter(), helper: '' } as StringSelectI18n));
  protected readonly effectiveCostCenterKey = computed(() =>
    effectiveCostCenterSelection(this.costCenterKey(), this.showCostCenterFilter(), this.costCenterOptions()));

  /** null = untouched: the Erfolgsrechnung's default (two tiers open) */
  private readonly userExpanded = signal<ReadonlySet<string> | null>(null);
  private readonly expandedKeys = computed(() => this.userExpanded() ?? new Set(defaultExpandedKeys(this.store.accounts())));

  protected readonly comparison = computed(() => {
    const a = this.versionA();
    const y = this.year();
    const labels = { revenue: this.store.i18n.grid_revenue(), expense: this.store.i18n.grid_expense(), other: this.store.i18n.compare_other(), net: this.store.i18n.grid_net() };
    if (!a || y === undefined) return buildAccountComparison(this.store.reportAccounts(), new Map(), this.expandedKeys(), labels);
    const sel = this.effectiveCostCenterKey();
    const subtree = costCenterSubtreeKeys(this.store.costCenterStore.costCenters(), sel);
    const range = fiscalYear(y, this.store.fiscalYearStart());
    const lines = filterLinesByCostCenter(postedLinesInRange(this.store.bookingLines(), this.store.bookings(), range.from, range.to), sel, subtree);
    const b = this.versionB();
    const cells = aggregateByCostCenter(lines, this.store.reportAccounts(),
      filterLinesByCostCenter(this.store.linesOf(a.okey), sel, subtree),
      b ? filterLinesByCostCenter(this.store.linesOf(b.okey), sel, subtree) : []);
    return buildAccountComparison(this.store.reportAccounts(), totalsByAccount(cells), this.expandedKeys(), labels);
  });

  constructor() {
    this.store.loadActuals();
    inject(DestroyRef).onDestroy(() => this.store.releaseActuals());

    // Take the URL once the versions are known; afterwards the pickers own the state.
    effect(() => {
      if (this.store.isLoading() || this.initialized()) return;
      const versions = this.store.allVersions();
      const a = this.a();
      const b = this.b();
      untracked(() => {
        const fromUrl = a ? versions.find(v => v.okey === a && !v.isArchived) : undefined;
        const year = fromUrl?.fiscalYear ?? this.store.currentFiscalYear();
        this.year.set(year);
        this.aKey.set(fromUrl?.okey ?? defaultCompareVersion(versions, year)?.okey ?? '');
        const bVersion = b ? versions.find(v => v.okey === b && !v.isArchived && v.okey !== this.aKey()) : undefined;
        this.bKey.set(bVersion?.okey ?? '');
        this.initialized.set(true);
      });
    });

    // Keep ?a=&b= in sync without adding history entries.
    effect(() => {
      if (!this.initialized()) return;
      const a = this.aKey();
      const b = this.bKey();
      untracked(() => void this.router.navigate([], { relativeTo: this.route, queryParams: { a: a || null, b: b || null }, queryParamsHandling: 'merge', replaceUrl: true }));
    });
  }

  protected onYear(value: number): void {
    if (value === this.year()) return;
    this.year.set(value);
    this.aKey.set(defaultCompareVersion(this.store.allVersions(), value)?.okey ?? '');
    this.bKey.set('');
  }

  protected onA(key: string): void {
    this.aKey.set(key ?? '');
    if (this.bKey() === key) this.bKey.set('');
  }

  protected onB(key: string): void {
    if (key === this.aKey()) return;
    this.bKey.set(key ?? '');
  }

  protected toggle(row: AccountComparisonRow): void {
    if (!row.expandable) return;
    const next = new Set(this.expandedKeys());
    if (!next.delete(row.key)) next.add(row.key);
    this.userExpanded.set(next);
  }

  /** over budget: more actual than budget for an expense, less for a revenue or the net result */
  protected over(row: AccountComparisonRow): boolean {
    if (row.side === 'net') return isNetOver(row.diff);
    return isOver(row.side, row.diff);
  }

  protected percent(used: number | undefined): string {
    return used === undefined ? '—' : `${used} %`;
  }

  protected fmt(minor: number): string {
    return formatMinorAmount(minor);
  }
}
