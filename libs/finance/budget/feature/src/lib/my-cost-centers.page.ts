import { Component, computed, inject, input, resource, signal } from '@angular/core';
import {
  IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonNote, IonSelect, IonSelectOption, IonTitle, IonToolbar
} from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner, StringSelect, StringSelectI18n } from '@okr/shared-ui';
import { resourceParams } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

import { formatMinorAmount } from '@okr/finance-booking-util';
import { AccountComparisonRow, BUDGET_I18N_KEYS, BudgetI18n, buildBoardView, isNetOver, isOver } from '@okr/finance-budget-util';
import { CostCenterService } from '@okr/finance-cost-center-data-access';
import { costCenterLabel, sortCostCenterTree } from '@okr/finance-cost-center-util';
import { CostCenterModel } from '@okr/shared-models';
import { ALL_COST_CENTERS, NO_COST_CENTER } from '@okr/finance-reporting-util';

/**
 * «Meine Kostenstellen» (route `/my-cost-centers/:accountingTenantId`, spec 1.65 §7.4, D21) — for the books in the
 * route (the legal entity; NOT the app tenant, which may keep several sets of books): the Soll-Ist Erfolgsrechnung of the
 * Kostenstellen the caller is responsible for — budget of the reference version (newest approved, D12), Ist,
 * Abweichung, % — cut by a Kostenstelle filter over the caller's own Kostenstellen. An account row opens to its
 * bookings; person-related ones are masked by the callable (D22). Authorization lives in `getMyCostCenterReport`;
 * nobody responsible ⇒ an empty state.
 */
@Component({
  selector: 'okr-my-cost-centers-page',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, StringSelect,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote, IonSelect, IonSelectOption, IonIcon
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
    ion-item.booking { font-size: 0.875rem; color: var(--ion-color-medium-shade); }
    .booking-date { margin-inline-end: 8px; font-variant-numeric: tabular-nums; }
    .pickers { display: flex; flex-wrap: wrap; gap: 0 16px; padding: 0 16px; }
    .pickers ion-select { min-width: 160px; flex: 1 1 160px; }
    ion-icon.twisty { margin-inline-end: 8px; vertical-align: middle; }
    .hint { padding: 0 16px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ i18n.board_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (reportResource.isLoading() && !report()) {
        <okr-spinner />
      } @else if (reportResource.error()) {
        <okr-empty-list [message]="i18n.board_error()" />
      } @else if (!report() || report()!.costCenters.length === 0) {
        <okr-empty-list [message]="i18n.board_empty()" />
      } @else {
        <div class="pickers">
          <ion-select interface="popover" [label]="i18n.fiscalYear()" labelPlacement="stacked" [value]="report()!.fiscalYear" (ionChange)="year.set($event.detail.value)">
            @for (y of report()!.fiscalYears; track y) {
              <ion-select-option [value]="y">{{ y }}</ion-select-option>
            }
          </ion-select>
        </div>
        <okr-string-select [i18n]="costCenterI18n()" [stringList]="costCenterOptions()" [labels]="costCenterLabels()"
          [selectedString]="effectiveSelection()" (selectedStringChange)="selection.set($event)" [readOnly]="false" />
        @if (!report()!.budget) {
          <ion-note class="hint">{{ i18n.board_noBudget() }}</ion-note>
        }

        <ion-list lines="inset">
          <ion-item lines="none" class="ion-hide-sm-down">
            <ion-label class="head">&nbsp;</ion-label>
            <div slot="end" class="amounts head">
              <span>{{ budgetName() }}</span><span>{{ i18n.col_actual() }}</span><span>{{ i18n.col_difference() }}</span><span>{{ i18n.col_used() }}</span>
            </div>
          </ion-item>
          @for (row of view().comparison.rows; track row.key) {
            @let bookings = detailsOf(row);
            <ion-item [button]="row.expandable || bookings.length > 0" [detail]="false" (click)="toggle(row, bookings.length > 0)" [class]="row.kind">
              <ion-label class="ion-text-wrap" [style.padding-inline-start.px]="row.depth * 16">
                <h3>
                  @if (row.expandable || bookings.length > 0) {
                    <ion-icon class="twisty" src="{{ (isOpen(row) ? 'chevron-down' : 'chevron-forward') | svgIcon }}" [attr.aria-label]="isOpen(row) ? i18n.compare_collapse() : i18n.compare_expand()" />
                  }
                  {{ row.id ? row.id + ' ' : '' }}{{ row.name }}
                </h3>
                <div class="amounts">
                  <span><small class="head ion-hide-sm-up">{{ budgetName() }}</small> {{ fmt(row.budget) }}</span>
                  <span><small class="head ion-hide-sm-up">{{ i18n.col_actual() }}</small> {{ fmt(row.actual) }}</span>
                  <span [class.negative]="over(row)"><small class="head ion-hide-sm-up">{{ i18n.col_difference() }}</small> {{ fmt(row.diff) }}</span>
                  <span><small class="head ion-hide-sm-up">{{ i18n.col_used() }}</small> {{ percent(row.used) }}</span>
                </div>
              </ion-label>
            </ion-item>
            @if (bookings.length > 0 && openAccounts().has(row.key)) {
              @for (b of bookings; track b.bookingKey) {
                <ion-item class="booking" [style.padding-inline-start.px]="(row.depth + 1) * 16">
                  <ion-label class="ion-text-wrap">
                    <span class="booking-date">{{ viewDate(b.date) }}</span>{{ b.title }}
                    @if (b.counterpartyName) { <ion-note> · {{ b.counterpartyName }}</ion-note> }
                  </ion-label>
                  <ion-note slot="end">{{ fmt(b.amount) }}</ion-note>
                </ion-item>
              }
            }
          }
        </ion-list>
      }
    </ion-content>
  `
})
export class MyCostCentersPage {
  private readonly costCenterService = inject(CostCenterService);
  protected readonly i18n = inject(I18nService).translateAll(BUDGET_I18N_KEYS) as BudgetI18n;

  /** the books (route param) — never derived from the app tenant */
  public readonly accountingTenantId = input.required<string>();

  /** undefined = the callable's default (the current fiscal year) */
  protected readonly year = signal<number | undefined>(undefined);
  protected readonly selection = signal(ALL_COST_CENTERS);
  /** null = untouched: every group open, as the board view is short */
  private readonly userExpanded = signal<ReadonlySet<string> | null>(null);
  protected readonly openAccounts = signal<ReadonlySet<string>>(new Set());

  protected readonly reportResource = resource({
    params: resourceParams(() => ({ books: this.accountingTenantId(), year: this.year() })),
    loader: ({ params }) => this.costCenterService.getMyReport(params.books, params.year),
  });
  protected readonly report = computed(() => this.reportResource.value());

  private readonly centers = computed(() => (this.report()?.costCenters ?? []).map(c =>
    ({ ...new CostCenterModel('', this.report()?.accountingTenantId ?? ''), ...c }) as CostCenterModel));
  protected readonly costCenterOptions = computed(() => [
    ALL_COST_CENTERS, ...sortCostCenterTree(this.centers()).map(n => n.center.okey), ...(this.report()?.fullAccess ? [NO_COST_CENTER] : [])]);
  protected readonly costCenterLabels = computed(() => [
    this.i18n.board_allMine(),
    ...sortCostCenterTree(this.centers()).map(n => '  '.repeat(n.depth) + costCenterLabel(n.center)),
    ...(this.report()?.fullAccess ? [this.i18n.noCostCenter()] : [])]);
  protected readonly costCenterI18n = computed(() => ({ name: 'costCenterKey', label: this.i18n.compare_costCenter(), helper: '' } as StringSelectI18n));
  /** a selection that is no longer an option (other year, fewer Kostenstellen) falls back to all */
  protected readonly effectiveSelection = computed(() => this.costCenterOptions().includes(this.selection()) ? this.selection() : ALL_COST_CENTERS);

  private readonly groupKeys = computed(() => new Set((this.report()?.accounts ?? []).map(a => a.okey)));
  private readonly expandedKeys = computed(() => this.userExpanded() ?? this.groupKeys());

  protected readonly view = computed(() => {
    const labels = {
      revenue: this.i18n.grid_revenue(), expense: this.i18n.grid_expense(), other: this.i18n.compare_other(),
      net: this.i18n.grid_net(), maskedTitle: this.i18n.board_maskedTitle(),
    };
    const r = this.report();
    if (!r) return { comparison: { rows: [] as AccountComparisonRow[], revenue: zero(), expense: zero(), other: zero(), net: zero() }, details: new Map() };
    return buildBoardView(r, this.effectiveSelection(), this.expandedKeys(), labels);
  });
  protected readonly budgetName = computed(() => this.report()?.budget?.name || this.i18n.col_budget());

  protected detailsOf(row: AccountComparisonRow) {
    return row.kind === 'account' ? this.view().details.get(row.key) ?? [] : [];
  }

  protected isOpen(row: AccountComparisonRow): boolean {
    return row.kind === 'account' ? this.openAccounts().has(row.key) : row.expanded;
  }

  protected toggle(row: AccountComparisonRow, hasBookings: boolean): void {
    if (row.kind === 'account' && hasBookings) {
      const next = new Set(this.openAccounts());
      if (!next.delete(row.key)) next.add(row.key);
      this.openAccounts.set(next);
      return;
    }
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

  protected viewDate(storeDate: string): string {
    return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false) || storeDate;
  }
}

function zero() { return { actual: 0, budget: 0, compare: 0 }; }
