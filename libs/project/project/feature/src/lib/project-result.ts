import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonButton, IonCol, IonGrid, IonIcon, IonLabel, IonRow, IonToolbar } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { AlertService, resourceParams } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, fill, getTodayStr } from '@okr/shared-util-core';

import { DocGenerationService } from '@okr/content-pdf-template-data-access';
import { AccountService } from '@okr/finance-account-data-access';
import { ReportingService } from '@okr/finance-reporting-data-access';
import {
  buildReportDocument, buildReportRows, downloadFromUrl, filterLinesByDimension, REPORTING_I18N_KEYS, ReportDocumentLabels,
  ReportingI18n, ReportRow, sumLinesByAccount, totalForClasses,
} from '@okr/finance-reporting-util';
import { ReportTable } from '@okr/finance-reporting-ui';
import { PROJECT_I18N_KEYS } from '@okr/project-project-util';

/**
 * Result of one project (spec 3.14 Phase 4): Einnahmen and Ausgaben from the booking lines that
 * carry the project's `projectKey` (Kostenträger), over all fiscal years, closed by the total.
 * Read from the tenant's own books (accounting tenant = okr tenant); lines of other books are
 * not reached from here.
 */
@Component({
  selector: 'okr-project-result',
  standalone: true,
  imports: [SvgIconPipe, Spinner, EmptyList, ReportTable, IonToolbar, IonButton, IonIcon, IonGrid, IonRow, IonCol, IonLabel],
  template: `
    @if (isLoading()) {
      <okr-spinner />
    } @else if (!hasLines()) {
      <okr-empty-list [message]="i18n.resultEmpty()" />
    } @else {
      <ion-toolbar>
        <ion-button slot="end" fill="clear" (click)="exportPdf()">
          <ion-icon slot="start" src="{{ 'document' | svgIcon }}" />
          {{ i18n.exportPdf() }}
        </ion-button>
      </ion-toolbar>
      <ion-toolbar color="primary">
        <ion-grid>
          <ion-row>
            <ion-col size-md="2" class="ion-hide-sm-down"><ion-label><strong>{{ reporting.col_account() }}</strong></ion-label></ion-col>
            <ion-col size="9" size-md="8"><ion-label><strong>{{ reporting.col_name() }}</strong></ion-label></ion-col>
            <ion-col size="3" size-md="2" class="ion-text-end"><ion-label><strong>{{ i18n.resultTotal() }}</strong></ion-label></ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
      <okr-report-table [rows]="rows()" />
    }
  `
})
export class ProjectResult {
  private readonly appStore = inject(AppStore);
  private readonly accountService = inject(AccountService);
  private readonly reportingService = inject(ReportingService);
  private readonly docGenerationService = inject(DocGenerationService);
  private readonly alertService = inject(AlertService);
  private readonly i18nService = inject(I18nService);

  public readonly projectKey = input.required<string>();
  public readonly projectName = input<string>('');

  protected readonly i18n = this.i18nService.translateAll(PROJECT_I18N_KEYS);
  protected readonly reporting = this.i18nService.translateAll(REPORTING_I18N_KEYS) as ReportingI18n;

  /** The tenant's own books (accounting tenant = okr tenant, as in the accounting menu). */
  private readonly accountingTenantId = computed(() => this.appStore.tenantId());

  private readonly accountsResource = rxResource({
    params: resourceParams(() => ({ id: this.accountingTenantId() })),
    stream: ({ params }) => params.id ? this.accountService.list(params.id) : of([]),
  });
  private readonly bookingsResource = rxResource({
    params: resourceParams(() => ({ id: this.accountingTenantId() })),
    stream: ({ params }) => params.id ? this.reportingService.getJournalEntries(params.id) : of([]),
  });
  private readonly linesResource = rxResource({
    params: resourceParams(() => ({ id: this.accountingTenantId() })),
    stream: ({ params }) => params.id ? this.reportingService.getAllLines(params.id) : of([]),
  });

  protected readonly isLoading = computed(() =>
    this.accountsResource.isLoading() || this.bookingsResource.isLoading() || this.linesResource.isLoading());

  /** Only this project's lines — all fiscal years (a project's actuals span years). */
  private readonly projectLines = computed(() =>
    filterLinesByDimension(this.linesResource.value() ?? [], 'projectKey', new Set([this.projectKey()])));
  protected readonly hasLines = computed(() => this.projectLines().length > 0);

  private readonly amounts = computed(() => sumLinesByAccount(this.projectLines(), this.bookingsResource.value() ?? [], '', ''));

  /** Einnahmen, Ausgaben, then the total (Einnahmen − Ausgaben). Zero accounts are hidden. */
  protected readonly rows = computed<ReportRow[]>(() => {
    const accounts = this.accountsResource.value() ?? [];
    const cur = this.amounts(), none = new Map();
    const expanded = accounts.map(a => a.okey);   // fully expanded: the result is a flat statement
    const income = buildReportRows(accounts, ['revenue'], cur, none, expanded, false);
    const expense = buildReportRows(accounts, ['expense'], cur, none, expanded, false);
    const synthetic = (okey: string, kind: 'total' | 'result', name: string, current: number): ReportRow =>
      ({ okey, id: '', name, depth: 0, kind, hasChildren: false, isExpanded: false, current, previous: 0 });
    const incomeTotal = totalForClasses(accounts, ['revenue'], cur);
    const expenseTotal = totalForClasses(accounts, ['expense'], cur);
    return [
      ...income, synthetic('total-income', 'total', this.i18n.resultIncome(), incomeTotal),
      ...expense, synthetic('total-expense', 'total', this.i18n.resultExpense(), expenseTotal),
      synthetic('project-result', 'result', this.i18n.resultTotal(), incomeTotal - expenseTotal),
    ];
  });

  protected async exportPdf(): Promise<void> {
    try {
      const today = getTodayStr(DateFormat.StoreDate);
      const view = convertDateFormatToString(today, DateFormat.StoreDate, DateFormat.ViewDate, false);
      const tenantId = this.accountingTenantId();
      const title = fill(this.i18n.resultPdfTitle(), { name: this.projectName() || this.projectKey() });
      const labels: ReportDocumentLabels = {
        title,
        created: this.reporting.pdf_created(),
        address: this.reporting.pdf_address(),
        period: this.reporting.pdf_period(),
        periodValue: this.i18n.resultPeriodAll(),
        amounts: fill(this.reporting.pdf_amounts(), { currency: 'CHF' }),
        watermark: '',
        colAccount: this.reporting.col_account(),
        colName: this.reporting.col_name(),
        colCurrent: this.i18n.resultTotal(),
        colPrevious: '',
      };
      const html = buildReportDocument(this.rows(), {
        variant: 'final',
        orgName: this.appStore.getOrg(this.appStore.appConfig().ownerOrgId || tenantId)?.name ?? tenantId,
        orgAddress: '',
        generatedOn: view,
        labels,
      });
      const filename = `projektergebnis-${this.projectKey()}.pdf`;
      const result = await this.docGenerationService.printHtml(html, filename, 'accounting-report', tenantId);
      const saved = await downloadFromUrl(result.url, filename);
      if (!saved) window.open(result.url, '_blank');
      await this.alertService.showToast(fill(this.reporting.pdf_conf(), { filename }));
    } catch (error) {
      this.alertService.error(`ProjectResult.exportPdf: ${error}`);
    }
  }
}
