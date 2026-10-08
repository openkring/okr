import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBackButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel,
  IonList, IonSelect, IonSelectOption, IonTitle, IonToolbar
} from '@ionic/angular/standalone';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';

import { ReadOnlyBanner } from '@okr/finance-accounting-feature';
import { formatMinorAmount } from '@okr/finance-booking-util';
import { buildComparisonRows, ComparisonRow, ComparisonSection, defaultCompareVersion, usedPercent } from '@okr/finance-budget-util';
import { aggregateByCostCenter, CellSide, postedLinesInRange, rollUpCostCenters } from '@okr/finance-cost-center-util';
import { fiscalYear } from '@okr/finance-reporting-util';

import { BudgetStore } from './budget.store';

/**
 * The Soll-Ist comparison (route `budget/compare?a=&b=`, spec 1.65 phase 2): the actuals of a fiscal year against
 * version A and, optionally, version B of the same year. Expense and revenue each list the Kostenstellen tree
 * (tap a row to open its accounts), then «ohne Kostenstelle» and, if any, «unbekannte Kostenstelle»; a net line closes.
 * The choice lives in the URL (`replaceUrl`, so the back button does not step through every pick).
 */
@Component({
  selector: 'okr-budget-compare-page',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ReadOnlyBanner,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonList, IonItem, IonLabel, IonSelect, IonSelectOption,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonIcon
  ],
  styles: [`
    .amounts { display: flex; justify-content: flex-end; gap: 16px; font-variant-numeric: tabular-nums; flex-wrap: wrap; }
    .amounts span { min-width: 84px; text-align: end; }
    .head { color: var(--ion-color-medium); font-size: 0.75rem; }
    .negative { color: var(--ion-color-danger); }
    .account h3 { font-weight: 400; }
    .center h3 { font-weight: 600; }
    .footer { border-top: 1px solid var(--ion-color-medium); padding-top: 8px; font-weight: 600; }
    .footer-row { display: flex; justify-content: space-between; gap: 8px; }
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
      @if (store.isLoading()) {
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
            @for (v of yearVersions(); track v.okey) {
              <ion-select-option [value]="v.okey">{{ v.name }}</ion-select-option>
            }
          </ion-select>
        </div>

        @if (!versionA()) {
          <okr-empty-list [message]="yearVersions().length === 0 ? store.i18n.compare_noVersion() : store.i18n.compare_empty()" />
        } @else if (store.actualsLoading()) {
          <okr-spinner />
        } @else {
          @for (block of blocks(); track block.side) {
            <ion-card>
              <ion-card-header><ion-card-title>{{ block.title }}</ion-card-title></ion-card-header>
              <ion-card-content>
                <ion-list lines="inset">
                  <ion-item lines="none">
                    <ion-label class="head">&nbsp;</ion-label>
                    <div slot="end" class="amounts head ion-hide-sm-down">
                      <span>{{ nameA() }}</span>
                      @if (versionB()) { <span>{{ nameB() }}</span> }
                      <span>{{ store.i18n.col_actual() }}</span><span>{{ store.i18n.col_difference() }}</span><span>{{ store.i18n.col_used() }}</span>
                    </div>
                  </ion-item>
                  @for (row of block.section.rows; track row.key) {
                    <ion-item [button]="row.expandable" [detail]="false" (click)="toggle(block.side, row)" [class]="row.kind === 'account' ? 'account' : 'center'">
                      <ion-label class="ion-text-wrap" [style.padding-inline-start.px]="row.depth * 16">
                        <h3>
                          @if (row.expandable) {
                            <ion-icon class="twisty" src="{{ (row.expanded ? 'chevron-down' : 'chevron-forward') | svgIcon }}" [attr.aria-label]="row.expanded ? store.i18n.compare_collapse() : store.i18n.compare_expand()" />
                          }
                          {{ rowLabel(row) }}
                        </h3>
                        <div class="amounts">
                          <span><small class="head ion-hide-sm-up">{{ nameA() }}</small> {{ fmt(row.budget) }}</span>
                          @if (versionB()) { <span><small class="head ion-hide-sm-up">{{ nameB() }}</small> {{ fmt(row.compare) }}</span> }
                          <span><small class="head ion-hide-sm-up">{{ store.i18n.col_actual() }}</small> {{ fmt(row.actual) }}</span>
                          <span [class.negative]="isOver(block.side, row.diff)"><small class="head ion-hide-sm-up">{{ store.i18n.col_difference() }}</small> {{ fmt(row.diff) }}</span>
                          <span><small class="head ion-hide-sm-up">{{ store.i18n.col_used() }}</small> {{ percent(row.used) }}</span>
                        </div>
                      </ion-label>
                    </ion-item>
                  }
                </ion-list>
                <div class="footer">
                  <div class="footer-row head"><span>&nbsp;</span><span class="amounts"><span>{{ nameA() }}</span>@if (versionB()) { <span>{{ nameB() }}</span> }<span>{{ store.i18n.col_actual() }}</span><span>{{ store.i18n.col_difference() }}</span><span>{{ store.i18n.col_used() }}</span></span></div>
                  <div class="footer-row"><span>{{ store.i18n.grid_total() }}</span><span class="amounts">
                    <span>{{ fmt(block.section.total.budget) }}</span>
                    @if (versionB()) { <span>{{ fmt(block.section.total.compare) }}</span> }
                    <span>{{ fmt(block.section.total.actual) }}</span>
                    <span [class.negative]="isOver(block.side, block.section.total.actual - block.section.total.budget)">{{ fmt(block.section.total.actual - block.section.total.budget) }}</span>
                    <span>{{ percent(usedOf(block.section.total.actual, block.section.total.budget)) }}</span></span></div>
                </div>
              </ion-card-content>
            </ion-card>
          }

          <ion-card>
            <ion-card-header><ion-card-title>{{ store.i18n.grid_net() }}</ion-card-title></ion-card-header>
            <ion-card-content>
              <div class="footer-row head"><span>&nbsp;</span><span class="amounts"><span>{{ nameA() }}</span>@if (versionB()) { <span>{{ nameB() }}</span> }<span>{{ store.i18n.col_actual() }}</span><span>{{ store.i18n.col_difference() }}</span></span></div>
              <div class="footer-row footer"><span>{{ store.i18n.grid_net() }}</span><span class="amounts">
                <span>{{ fmt(net().budget) }}</span>
                @if (versionB()) { <span>{{ fmt(net().compare) }}</span> }
                <span>{{ fmt(net().actual) }}</span>
                <span [class.negative]="net().actual - net().budget < 0">{{ fmt(net().actual - net().budget) }}</span></span></div>
            </ion-card-content>
          </ion-card>
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
  /** `<side>|<row key>` of the rows that are open */
  private readonly expanded = signal<ReadonlySet<string>>(new Set());
  private readonly initialized = signal(false);

  protected readonly backHref = computed(() => `/accounting/${this.store.accountingTenantId()}/budget/c-budget`);
  /** the live versions of the chosen year (archived ones cannot be compared) */
  protected readonly yearVersions = computed(() =>
    this.store.allVersions().filter(v => !v.isArchived && v.fiscalYear === this.year()).sort((x, y) => (x.name ?? '').localeCompare(y.name ?? '')));
  protected readonly versionA = computed(() => this.yearVersions().find(v => v.okey === this.aKey()));
  protected readonly versionB = computed(() => this.yearVersions().find(v => v.okey === this.bKey()));
  protected readonly nameA = computed(() => this.versionA()?.name ?? '');
  protected readonly nameB = computed(() => this.versionB()?.name ?? '');

  private readonly cells = computed(() => {
    const a = this.versionA();
    const y = this.year();
    if (!a || y === undefined) return [];
    const range = fiscalYear(y, this.store.fiscalYearStart());
    const lines = postedLinesInRange(this.store.bookingLines(), this.store.bookings(), range.from, range.to);
    const b = this.versionB();
    return aggregateByCostCenter(lines, this.store.accounts(), this.store.linesOf(a.okey), b ? this.store.linesOf(b.okey) : []);
  });

  protected readonly blocks = computed((): { side: CellSide; title: string; section: ComparisonSection }[] => {
    const cells = this.cells();
    const costCenters = this.store.costCenterStore.costCenters();
    const rollUp = rollUpCostCenters(cells, costCenters);
    const expanded = this.expanded();
    return (['expense', 'revenue'] as CellSide[]).map(side => {
      const open = new Set([...expanded].filter(k => k.startsWith(side + '|')).map(k => k.slice(side.length + 1)));
      return {
        side,
        title: side === 'expense' ? this.store.i18n.grid_expense() : this.store.i18n.grid_revenue(),
        section: buildComparisonRows(cells, rollUp, costCenters, this.store.accounts(), open, side),
      };
    });
  });

  /** Ergebnis = Ertrag − Aufwand per column */
  protected readonly net = computed(() => {
    const [expense, revenue] = [this.blocks()[0].section.total, this.blocks()[1].section.total];
    return { actual: revenue.actual - expense.actual, budget: revenue.budget - expense.budget, compare: revenue.compare - expense.compare };
  });

  constructor() {
    effect(() => { if (this.store.isEnabled()) this.store.loadActuals(); });

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
        const bVersion = b ? versions.find(v => v.okey === b && !v.isArchived && v.fiscalYear === year) : undefined;
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
    this.expanded.set(new Set());
  }

  protected onA(key: string): void {
    this.aKey.set(key ?? '');
    if (this.bKey() === key) this.bKey.set('');
  }

  protected onB(key: string): void {
    this.bKey.set(key ?? '');
  }

  protected toggle(side: CellSide, row: ComparisonRow): void {
    if (!row.expandable) return;
    const id = `${side}|${row.key}`;
    const next = new Set(this.expanded());
    if (!next.delete(id)) next.add(id);
    this.expanded.set(next);
  }

  protected rowLabel(row: ComparisonRow): string {
    switch (row.kind) {
      case 'none': return this.store.i18n.noCostCenter();
      case 'unknown': return this.store.i18n.compare_unknownCenter();
      default: return row.label;
    }
  }

  /** more actual than budget is bad for an expense, less for a revenue */
  protected isOver(side: CellSide, diff: number): boolean {
    return side === 'expense' ? diff > 0 : diff < 0;
  }

  protected usedOf(actual: number, budget: number): number | undefined {
    return usedPercent(actual, budget);
  }

  protected percent(used: number | undefined): string {
    return used === undefined ? '—' : `${used} %`;
  }

  protected fmt(minor: number): string {
    return formatMinorAmount(minor);
  }
}
