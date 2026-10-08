import { Component, computed, effect, inject, input } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions, IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardTitle, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote, IonTitle, IonToolbar
} from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';
import { BudgetStatus } from '@okr/shared-models';

import { ReadOnlyBanner } from '@okr/finance-accounting-feature';
import { formatMinorAmount } from '@okr/finance-booking-util';
import { buildBudgetGrid, BudgetGridRow, BudgetGridSection, isVersionEditable, netOf } from '@okr/finance-budget-util';
import { aggregateByCostCenter, costCenterLabel, postedLinesInRange } from '@okr/finance-cost-center-util';
import { fiscalYear } from '@okr/finance-reporting-util';

import { BudgetStore } from './budget.store';

/**
 * The grid of one budget version (route `budget/version/:versionKey`, spec 1.65 phase 2): one card per leaf
 * Kostenstelle (groups as section titles with their rolled-up totals), a row per budget cell with budget, actual of
 * the fiscal year and what is left, a footer per card (Aufwand, Ertrag, Ergebnis) and grand totals at the end together
 * with what was booked without a Kostenstelle. Drafts of a treasurer can add, edit and delete cells.
 */
@Component({
  selector: 'okr-budget-grid-page',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ReadOnlyBanner,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonChip, IonList, IonItem, IonLabel, IonNote,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton, IonIcon
  ],
  styles: [`
    ion-chip { font-size: 0.75rem; height: 22px; }
    .amounts { display: flex; justify-content: flex-end; gap: 16px; font-variant-numeric: tabular-nums; flex-wrap: wrap; }
    .amounts span { min-width: 84px; text-align: end; }
    .head { color: var(--ion-color-medium); font-size: 0.75rem; }
    .negative { color: var(--ion-color-danger); }
    .group { padding: 12px 16px 0; font-weight: 600; }
    .group .amounts { font-weight: 400; font-size: 0.85rem; }
    .footer { border-top: 1px solid var(--ion-color-medium); padding-top: 8px; font-weight: 600; }
    .footer-row { display: flex; justify-content: space-between; gap: 8px; }
    .grand { margin: 16px; }
    ion-note.frozen { display: block; padding: 8px 16px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="backHref()" /></ion-buttons>
        <ion-title>{{ version()?.name ?? store.i18n.grid_title() }}</ion-title>
        @if (version(); as v) {
          <ion-buttons slot="end">
            <ion-chip color="light">{{ yearLabel() }}</ion-chip>
            <ion-chip color="light">{{ kindLabel() }}</ion-chip>
            <ion-chip [color]="statusColor(v.status)">{{ statusLabel(v.status) }}</ion-chip>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <okr-read-only-banner />
      @if (store.isLoading() || store.actualsLoading()) {
        <okr-spinner />
      } @else if (!version()) {
        <okr-empty-list [message]="store.i18n.grid_notFound()" />
      } @else {
        @if (!editable()) {
          <ion-note color="warning" class="frozen">{{ store.i18n.grid_frozen() }}</ion-note>
        }
        @if (grid().sections.length === 0) {
          <okr-empty-list [message]="store.i18n.grid_empty()" />
        }
        @for (section of grid().sections; track section.center.okey) {
          @if (!section.isLeaf) {
            <div class="group" [style.padding-inline-start.px]="16 + section.depth * 16">
              <div>{{ label(section) }}</div>
              <div class="amounts">
                <span>{{ store.i18n.grid_expense() }} {{ fmt(section.totals.expense.budget) }} / {{ fmt(section.totals.expense.actual) }}</span>
                <span>{{ store.i18n.grid_revenue() }} {{ fmt(section.totals.revenue.budget) }} / {{ fmt(section.totals.revenue.actual) }}</span>
              </div>
            </div>
          }
          @if (section.isLeaf || section.rows.length > 0) {
            <ion-card>
              @if (section.isLeaf) {
                <ion-card-header><ion-card-title>{{ label(section) }}</ion-card-title></ion-card-header>
              }
              <ion-card-content>
                <ion-list lines="inset">
                  <ion-item lines="none" class="head">
                    <ion-label class="head">&nbsp;</ion-label>
                    <div slot="end" class="amounts head ion-hide-sm-down">
                      <span>{{ store.i18n.col_budget() }}</span><span>{{ store.i18n.col_actual() }}</span><span>{{ store.i18n.col_remaining() }}</span>
                    </div>
                  </ion-item>
                  @for (row of section.rows; track row.costCenterKey + '|' + row.accountKey) {
                    <ion-item [button]="rowTappable(row)" [detail]="false" (click)="onRow(row)">
                      <ion-label class="ion-text-wrap">
                        <h3>{{ row.accountId }} {{ row.accountName }}
                          @if (!row.budgeted) { <ion-chip color="warning">{{ store.i18n.grid_unbudgeted() }}</ion-chip> }
                        </h3>
                        <div class="amounts">
                          <span><small class="head ion-hide-sm-up">{{ store.i18n.col_budget() }}</small> {{ fmt(row.budget) }}</span>
                          <span><small class="head ion-hide-sm-up">{{ store.i18n.col_actual() }}</small> {{ fmt(row.actual) }}</span>
                          <span [class.negative]="row.remaining < 0"><small class="head ion-hide-sm-up">{{ store.i18n.col_remaining() }}</small> {{ fmt(row.remaining) }}</span>
                        </div>
                      </ion-label>
                    </ion-item>
                  }
                </ion-list>
                @if (section.isLeaf && canChange()) {
                  <ion-button fill="clear" size="small" (click)="add(section)">
                    <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" />
                    {{ store.i18n.addLine() }}
                  </ion-button>
                }
                @if (section.isLeaf) {
                  <div class="footer">
                    <div class="footer-row head"><span>&nbsp;</span><span class="amounts"><span>{{ store.i18n.col_budget() }}</span><span>{{ store.i18n.col_actual() }}</span><span>{{ store.i18n.col_remaining() }}</span></span></div>
                    <div class="footer-row"><span>{{ store.i18n.grid_expense() }}</span><span class="amounts"><span>{{ fmt(section.totals.expense.budget) }}</span><span>{{ fmt(section.totals.expense.actual) }}</span><span>{{ fmt(section.totals.expense.budget - section.totals.expense.actual) }}</span></span></div>
                    <div class="footer-row"><span>{{ store.i18n.grid_revenue() }}</span><span class="amounts"><span>{{ fmt(section.totals.revenue.budget) }}</span><span>{{ fmt(section.totals.revenue.actual) }}</span><span>{{ fmt(section.totals.revenue.budget - section.totals.revenue.actual) }}</span></span></div>
                    <div class="footer-row"><span>{{ store.i18n.grid_net() }}</span><span class="amounts"><span>{{ fmt(net(section, 'budget')) }}</span><span>{{ fmt(net(section, 'actual')) }}</span><span>{{ fmt(net(section, 'budget') - net(section, 'actual')) }}</span></span></div>
                  </div>
                }
              </ion-card-content>
            </ion-card>
          }
        }

        <ion-card class="grand">
          <ion-card-header><ion-card-title>{{ store.i18n.grid_total() }}</ion-card-title></ion-card-header>
          <ion-card-content>
            <div class="footer-row head"><span>&nbsp;</span><span class="amounts"><span>{{ store.i18n.col_budget() }}</span><span>{{ store.i18n.col_actual() }}</span><span>{{ store.i18n.col_remaining() }}</span></span></div>
            <div class="footer-row"><span>{{ store.i18n.grid_expense() }}</span><span class="amounts"><span>{{ fmt(grid().total.expense.budget) }}</span><span>{{ fmt(grid().total.expense.actual) }}</span><span>{{ fmt(grid().total.expense.budget - grid().total.expense.actual) }}</span></span></div>
            <div class="footer-row"><span>{{ store.i18n.grid_revenue() }}</span><span class="amounts"><span>{{ fmt(grid().total.revenue.budget) }}</span><span>{{ fmt(grid().total.revenue.actual) }}</span><span>{{ fmt(grid().total.revenue.budget - grid().total.revenue.actual) }}</span></span></div>
            <div class="footer-row footer"><span>{{ store.i18n.grid_net() }}</span><span class="amounts"><span>{{ fmt(totalNet('budget')) }}</span><span>{{ fmt(totalNet('actual')) }}</span><span>{{ fmt(totalNet('budget') - totalNet('actual')) }}</span></span></div>
            @if (hasUnassigned()) {
              <p class="head">{{ store.i18n.grid_unassigned() }} ({{ store.i18n.noCostCenter() }})</p>
              <div class="footer-row"><span>{{ store.i18n.grid_expense() }}</span><span class="amounts"><span>{{ fmt(grid().unassigned.expense.actual) }}</span></span></div>
              <div class="footer-row"><span>{{ store.i18n.grid_revenue() }}</span><span class="amounts"><span>{{ fmt(grid().unassigned.revenue.actual) }}</span></span></div>
            }
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class BudgetGridPage {
  protected readonly store = inject(BudgetStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /** route param; withComponentInputBinding sets unbound inputs to undefined, hence the `?? ''` reads below */
  public readonly versionKey = input.required<string>();

  protected readonly version = computed(() => this.store.version(this.versionKey() ?? ''));
  protected readonly editable = computed(() => {
    const v = this.version();
    return !!v && this.store.isEnabled() && isVersionEditable(v);
  });
  protected readonly canChange = computed(() => this.editable() && hasRole('treasurer', this.store.currentUser()));
  protected readonly backHref = computed(() => `/accounting/${this.store.accountingTenantId()}/budget/c-budget`);
  protected readonly yearLabel = computed(() => this.store.fiscalYearLabel(this.version()?.fiscalYear ?? 0));
  protected readonly kindLabel = computed(() => this.version()?.kind === 'forecast' ? this.store.i18n.kind_forecast() : this.store.i18n.kind_budget());

  protected readonly grid = computed(() => {
    const v = this.version();
    const costCenters = this.store.costCenterStore.costCenters();
    if (!v) return buildBudgetGrid([], [], costCenters, [], false);
    const range = fiscalYear(v.fiscalYear, this.store.fiscalYearStart());
    const lines = postedLinesInRange(this.store.bookingLines(), this.store.bookings(), range.from, range.to);
    const versionLines = this.store.linesOf(v.okey);
    const cells = aggregateByCostCenter(lines, this.store.accounts(), versionLines);
    return buildBudgetGrid(cells, versionLines, costCenters, this.store.accounts(), this.canChange());
  });
  protected readonly hasUnassigned = computed(() => {
    const u = this.grid().unassigned;
    return u.expense.actual !== 0 || u.revenue.actual !== 0;
  });

  constructor() {
    effect(() => { if (this.store.isEnabled()) this.store.loadActuals(); });
  }

  protected fmt(minor: number): string {
    return formatMinorAmount(minor);
  }

  protected label(section: BudgetGridSection): string {
    return costCenterLabel(section.center);
  }

  protected net(section: BudgetGridSection, field: 'budget' | 'actual'): number {
    return netOf(section.totals, field);
  }

  protected totalNet(field: 'budget' | 'actual'): number {
    return netOf(this.grid().total, field);
  }

  protected statusLabel(status: BudgetStatus | undefined): string {
    switch (status) {
      case 'approved': return this.store.i18n.status_approved();
      case 'superseded': return this.store.i18n.status_superseded();
      default: return this.store.i18n.status_draft();
    }
  }

  protected statusColor(status: BudgetStatus | undefined): string {
    switch (status) {
      case 'approved': return 'success';
      case 'superseded': return 'medium';
      default: return 'primary';
    }
  }

  protected async add(section: BudgetGridSection): Promise<void> {
    await this.store.editLine(this.versionKey(), undefined, section.center.okey);
  }

  /** An unbudgeted row is only tappable on a draft (it starts a budget cell); the others always (read-only modal when frozen). */
  protected rowTappable(row: BudgetGridRow): boolean {
    return row.budgeted || this.canChange();
  }

  /** A row opens the line modal (read-only when frozen); the sheet only offers edit and delete on a draft. */
  protected async onRow(row: BudgetGridRow): Promise<void> {
    if (!row.line) {
      if (this.canChange()) await this.store.editLine(this.versionKey(), undefined, row.costCenterKey, row.accountKey);
      return;
    }
    if (!this.canChange()) {
      await this.store.editLine(this.versionKey(), row.line);
      return;
    }
    const line = row.line;
    const options: ActionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    options.buttons.push(createActionSheetButton('budget.line.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('budget.line.delete', this.store.i18n.deleteLine(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'budget.line.edit': await this.store.editLine(this.versionKey(), line); break;
      case 'budget.line.delete': await this.store.deleteLine(line); break;
    }
  }
}
