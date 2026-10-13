import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonButtons, IonContent, IonHeader, IonMenuButton, IonSelect, IonSelectOption, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';

import { ACCOUNTING_AREAS, segmentUrl } from '@okr/finance-accounting-util';

import { AccountingOverviewStore } from './accounting-overview.store';
import { AccountingSegments } from './accounting-segments';
import { AccountingStore } from './accounting.store';

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');
}

function chf(minor: number | undefined): string {
  if (minor === undefined) return '—';
  return 'CHF ' + (minor / 100).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

@Component({
  selector: 'okr-accounting-overview-page',
  imports: [IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonContent, IonButton, IonSelect, IonSelectOption, IonSpinner, AccountingSegments],
  providers: [AccountingOverviewStore],
  styles: [`
    .wrap { max-width: 1200px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 28px; }
    h2 { margin: 0 0 12px; font-size: 1.05rem; }
    .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .card { display: flex; flex-direction: column; gap: 4px; padding: 16px; border-radius: 10px; border: 1px solid var(--ion-color-light-shade); background: var(--ion-item-background, var(--ion-background-color)); color: inherit; text-decoration: none; text-align: left; font: inherit; cursor: pointer; }
    .card:hover { border-color: var(--ion-color-medium); }
    .k { font-size: .85rem; color: var(--ion-color-medium-shade); font-weight: 600; }
    .v { font-size: 1.8rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .s { font-size: .9rem; color: var(--ion-color-step-700, var(--ion-text-color)); }
    .row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
    .chip { display: inline-flex; padding: 4px 12px; border-radius: 16px; font-weight: 600; font-size: .9rem; background: var(--ion-color-success-tint); color: var(--ion-color-success-contrast); }
    .chip.locked { background: var(--ion-color-warning-tint); color: var(--ion-color-warning-contrast); }
    .actions { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ i18n.overview_title() }} · {{ books().toUpperCase() }}</ion-title>
      </ion-toolbar>
      <okr-accounting-segments />
    </ion-header>
    <ion-content>
      <div class="wrap">
        <div class="row">
          @if (store.period(); as p) {
            <span class="chip" [class.locked]="p.isLocked">{{ periodLabel() }}</span>
          } @else {
            <span class="chip">{{ i18n.overview_period_none() }}</span>
          }
        </div>

        <section>
          <h2>{{ i18n.overview_todos() }}</h2>
          <div class="grid">
            @for (t of todoCards(); track t.key) {
              <button class="card" type="button" (click)="go(t.segmentId)">
                <span class="k">{{ t.label }}</span>
                <span class="v">@if (store.todosLoading()) {<ion-spinner name="dots" />} @else { {{ t.value }} }</span>
                @if (t.sub) { <span class="s">{{ t.sub }}</span> }
              </button>
            }
          </div>
        </section>

        <section>
          <div class="row">
            <h2>{{ i18n.overview_figures() }}</h2>
            <ion-select interface="popover" [value]="store.year()" [label]="i18n.overview_year()" (ionChange)="store.selectYear(+$event.detail.value)">
              @for (y of store.yearOptions(); track y) { <ion-select-option [value]="y">{{ y }}</ion-select-option> }
            </ion-select>
          </div>
          <div class="grid">
            <div class="card">
              <span class="k">{{ i18n.overview_fig_liquidity() }}</span>
              <span class="v">@if (store.figuresLoading()) {<ion-spinner name="dots" />} @else { {{ money(store.figures()?.liquidityChange) }} }</span>
              <span class="s">{{ i18n.overview_fig_liquidityHint() }}</span>
              @if (store.balance() !== undefined) {
                <span class="s">{{ i18n.overview_fig_balance() }}: {{ money(store.balance()) }}</span>
              } @else {
                <ion-button fill="clear" size="small" [disabled]="store.balanceLoading()" (click)="store.computeBalance()">{{ i18n.overview_fig_computeBalance() }}</ion-button>
              }
            </div>
            <div class="card">
              <span class="k">{{ i18n.overview_fig_result() }} {{ store.fiscalYearLabel() }}</span>
              <span class="v">@if (store.figuresLoading()) {<ion-spinner name="dots" />} @else { {{ money(store.figures()?.result) }} }</span>
            </div>
            <div class="card">
              <span class="k">{{ i18n.overview_fig_budget() }}</span>
              <span class="v">@if (store.figuresLoading()) {<ion-spinner name="dots" />} @else { {{ budgetText() }} }</span>
            </div>
            <div class="card">
              <span class="k">{{ i18n.overview_fig_openItems() }}</span>
              <span class="v" style="font-size:1.25rem">@if (store.todosLoading()) {<ion-spinner name="dots" />} @else { {{ openItemsText() }} }</span>
              <span class="s">{{ i18n.overview_fig_openItemsHint() }}</span>
            </div>
          </div>
        </section>

        @if (!accountingStore.isExternallyManaged()) {
          <section>
            <h2>{{ i18n.overview_actions() }}</h2>
            <div class="actions">
              <ion-button expand="block" (click)="quick('journal.bookings', 'add')">{{ i18n.overview_act_booking() }}</ion-button>
              <ion-button expand="block" fill="outline" (click)="quick('payables.bills', 'scan')">{{ i18n.overview_act_scan() }}</ion-button>
              <ion-button expand="block" fill="outline" (click)="quick('journal.bankImport', 'import')">{{ i18n.overview_act_bankImport() }}</ion-button>
              <ion-button expand="block" fill="outline" (click)="quick('receivables.invoices', 'add')">{{ i18n.overview_act_invoice() }}</ion-button>
            </div>
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class AccountingOverviewPage {
  protected readonly store = inject(AccountingOverviewStore);
  protected readonly accountingStore = inject(AccountingStore);
  private readonly router = inject(Router);
  protected readonly i18n = this.accountingStore.i18n;

  protected readonly books = computed(() => this.store.books());

  protected readonly periodLabel = computed(() => {
    const p = this.store.period();
    if (!p) return '';
    const label = p.month ? `${String(p.month).padStart(2, '0')}.${p.year}` : String(p.year);
    return fill(p.isLocked ? this.i18n.overview_period_locked() : this.i18n.overview_period_open(), { period: label });
  });

  protected readonly todoCards = computed(() => {
    const t = this.store.todos();
    const n = (v: number | undefined) => v === undefined ? '—' : String(v);
    return [
      { key: 'review', segmentId: 'journal.bookings', label: this.i18n.overview_todo_review(), value: n(t?.bookingsForReview), sub: '' },
      { key: 'bills', segmentId: 'payables.bills', label: this.i18n.overview_todo_bills(), value: n(t?.billsOpen),
        sub: t?.billsOverdue ? fill(this.i18n.overview_todo_billsOverdue(), { n: String(t.billsOverdue) }) : '' },
      { key: 'orders', segmentId: 'payables.paymentOrders', label: this.i18n.overview_todo_orders(), value: n(t?.paymentOrdersReady), sub: '' },
      { key: 'invoices', segmentId: 'receivables.invoices', label: this.i18n.overview_todo_invoices(), value: n(t?.invoicesOverdue), sub: '' },
      { key: 'expenses', segmentId: 'payables.expenses', label: this.i18n.overview_todo_expenses(), value: n(t?.expensesOpen), sub: '' },
      { key: 'bankRows', segmentId: 'journal.bankImport', label: this.i18n.overview_todo_bankRows(), value: n(t?.bankRowsOpen), sub: '' },
    ];
  });

  protected readonly budgetText = computed(() => {
    const f = this.store.figures();
    if (!f) return '—';
    return f.budgetUsedPercent === undefined ? this.i18n.overview_fig_noBudget() : `${f.budgetUsedPercent} %`;
  });

  protected readonly openItemsText = computed(() => {
    const o = this.store.todos()?.openTotals;
    return o ? `${chf(o.receivables)} / ${chf(o.payables)}` : '—';
  });

  protected money(minor: number | undefined): string {
    return chf(minor);
  }

  private segment(id: string) {
    return ACCOUNTING_AREAS.flatMap(a => a.segments).find(s => s.id === id);
  }

  protected async go(segmentId: string): Promise<void> {
    const seg = this.segment(segmentId);
    if (seg) await this.router.navigateByUrl(segmentUrl(seg, this.books()));
  }

  protected async quick(segmentId: string, action: string): Promise<void> {
    const seg = this.segment(segmentId);
    if (seg) await this.router.navigateByUrl(`${segmentUrl(seg, this.books())}?action=${action}`);
  }
}
