import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonButton, IonCol, IonGrid, IonIcon, IonLabel, IonNote, IonRow, IonToolbar } from '@ionic/angular/standalone';
import { firstValueFrom, of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { AlertService, resourceParams } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, fill, getTodayStr } from '@okr/shared-util-core';

import { AvatarService } from '@okr/avatar-data-access';
import { DocGenerationService, GenerateDocumentResponse } from '@okr/content-pdf-template-data-access';
import { AccountingConfigService } from '@okr/finance-accounting-data-access';
import { AccountService } from '@okr/finance-account-data-access';
import { AddressService } from '@okr/subject-address-data-access';
import { loadOrgAddressLine } from '@okr/finance-reporting-feature';
import { ReportingService } from '@okr/finance-reporting-data-access';
import {
  buildReportDocument, buildSplitProjectResult, downloadFromUrl, filterLinesByDimension, printableRows, REPORTING_I18N_KEYS, ReportDocumentLabels,
  ReportingI18n, reportTemplateRows, ReportTemplatePayload, sumLinesByAccount,
} from '@okr/finance-reporting-util';
import { ReportTable } from '@okr/finance-reporting-ui';
import { PROJECT_I18N_KEYS } from '@okr/project-project-util';

/**
 * Result of one project (spec 3.14 Phase 4): Einnahmen and Ausgaben from the booking lines that
 * carry the project's `projectKey` (Kostenträger), over all fiscal years, closed by the net result.
 * Split by booking direction (`buildSplitProjectResult`): an account booked both ways appears under
 * both headings, so every amount is positive.
 * The PDF prints what the page shows (opened accounts with their bookings), headed by the logo,
 * name and address of the books' org (`AccountingConfig.orgId`), through the `report` template the
 * accounting settings name (`projectReportTemplateId`); without one, the built-in layout.
 * Read from the tenant's own books (accounting tenant = okr tenant); lines of other books are
 * not reached from here.
 */
@Component({
  selector: 'okr-project-result',
  standalone: true,
  imports: [SvgIconPipe, Spinner, EmptyList, ReportTable, IonToolbar, IonButton, IonIcon, IonGrid, IonRow, IonCol, IonLabel, IonNote],
  template: `
    @if (isLoading()) {
      <okr-spinner />
    } @else if (!hasLines()) {
      <okr-empty-list [message]="i18n.resultEmpty()" />
    } @else {
      <ion-toolbar>
        <ion-note slot="start" class="ion-padding-start">{{ booksNote() }}</ion-note>
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
      <okr-report-table [rows]="rows()" [showPrevious]="false" [interactive]="false" [details]="bookingDetails()" [(openKeys)]="openKeys" />
    }
  `
})
export class ProjectResult {
  private readonly appStore = inject(AppStore);
  private readonly accountService = inject(AccountService);
  private readonly reportingService = inject(ReportingService);
  private readonly docGenerationService = inject(DocGenerationService);
  private readonly alertService = inject(AlertService);
  private readonly configService = inject(AccountingConfigService);
  private readonly addressService = inject(AddressService);
  private readonly i18nService = inject(I18nService);
  private readonly avatarService = inject(AvatarService);
  private readonly env = inject(ENV);

  public readonly projectKey = input.required<string>();
  public readonly projectName = input<string>('');
  /** StoreDates of the project; they make the period of the PDF ('' = open end). */
  public readonly startDate = input<string>('');
  public readonly endDate = input<string>('');

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

  private readonly configResource = rxResource({
    params: resourceParams(() => ({ id: this.accountingTenantId() })),
    stream: ({ params }) => params.id ? this.configService.read(params.id) : of(undefined),
  });
  private readonly currency = computed(() => this.configResource.value()?.functionalCurrency ?? 'CHF');
  protected readonly booksNote = computed(() => fill(this.i18n.resultBooks(), { tenant: this.accountingTenantId() }));

  protected readonly isLoading = computed(() =>
    this.accountsResource.isLoading() || this.bookingsResource.isLoading() || this.linesResource.isLoading());

  /** Only this project's lines — all fiscal years (a project's actuals span years). */
  private readonly projectLines = computed(() =>
    filterLinesByDimension(this.linesResource.value() ?? [], 'projectKey', new Set([this.projectKey()])));
  private readonly amounts = computed(() => sumLinesByAccount(this.projectLines(), this.bookingsResource.value() ?? [], '', ''));
  /** Only posted amounts count: a project with unposted bookings only shows the empty state. */
  protected readonly hasLines = computed(() => this.amounts().size > 0);

  /** Einnahmen and Ausgaben by booking direction, then the net (Gewinn/Verlust); the bookings behind each account row. */
  private readonly result = computed(() => buildSplitProjectResult(
    this.accountsResource.value() ?? [], this.projectLines(), this.bookingsResource.value() ?? [],
    { income: this.i18n.resultIncome(), expense: this.i18n.resultExpense(), net: this.i18n.resultNet() }));
  protected readonly rows = computed(() => this.result().rows);
  protected readonly bookingDetails = computed(() => this.result().details);
  /** account rows opened on the page — the PDF lists their bookings too */
  protected readonly openKeys = signal<ReadonlySet<string>>(new Set());

  protected async exportPdf(): Promise<void> {
    try {
      const tenantId = this.accountingTenantId();
      const config = this.configResource.value();
      const orgKey = config?.orgId || this.appStore.appConfig().ownerOrgId || tenantId;
      const orgName = this.appStore.getOrg(orgKey)?.name ?? tenantId;
      const orgAddress = await loadOrgAddressLine(this.addressService, orgKey);
      const generatedOn = viewDate(getTodayStr(DateFormat.StoreDate));
      const title = fill(this.i18n.resultPdfTitle(), { name: this.projectName() || this.projectKey() });
      const periodValue = this.periodValue();
      const books = this.booksNote();
      const amounts = fill(this.reporting.pdf_amounts(), { currency: this.currency() });
      const printed = printableRows(this.rows(), this.bookingDetails(), this.openKeys(), viewDate);
      const filename = `projektergebnis-${this.projectKey()}.pdf`;
      const templateId = config?.projectReportTemplateId ?? '';

      let result: GenerateDocumentResponse;
      if (templateId) {
        const payload: ReportTemplatePayload = {
          title, orgName, orgAddress, logoUrl: await this.orgLogoUrl(orgKey),
          created: this.reporting.pdf_created(), generatedOn,
          facts: [
            { label: this.reporting.pdf_address(), value: orgAddress ? `${orgName}, ${orgAddress}` : orgName },
            { label: this.reporting.pdf_period(), value: periodValue },
          ],
          books, amounts,
          columns: { account: this.reporting.col_account(), name: this.reporting.col_name(), amount: this.i18n.resultTotal() },
          rows: reportTemplateRows(printed),
          project: { key: this.projectKey(), name: this.projectName(), startDate: this.startDate(), endDate: this.endDate() },
        };
        result = await this.docGenerationService.generate({
          templateId, payload,
          options: { storageMode: 'ephemeral', filename, metadata: { entityType: 'project-result', entityId: this.projectKey() } },
        });
      } else {
        // built-in layout: raw-HTML mode, which the server reserves for admins and which cannot load a logo
        const labels: ReportDocumentLabels = {
          title,
          created: this.reporting.pdf_created(),
          address: this.reporting.pdf_address(),
          period: this.reporting.pdf_period(),
          periodValue,
          books,
          amounts,
          watermark: '',
          colAccount: this.reporting.col_account(),
          colName: this.reporting.col_name(),
          colCurrent: this.i18n.resultTotal(),
          colPrevious: '',
        };
        const html = buildReportDocument(printed, { variant: 'final', showPrevious: false, orgName, orgAddress, generatedOn, labels });
        result = await this.docGenerationService.printHtml(html, filename, 'project-result', this.projectKey());
      }
      const saved = await downloadFromUrl(result.url, filename);
      if (!saved) window.open(result.url, '_blank');
      await this.alertService.showToast(fill(this.reporting.pdf_conf(), { filename }));
    } catch (error) {
      this.alertService.error(`ProjectResult.exportPdf: ${error}`);
    }
  }

  /** «01.05.2026 – 30.06.2026» from the project dates; a missing end stays open, no dates at all = every booking year. */
  private periodValue(): string {
    const from = viewDate(this.startDate());
    const to = viewDate(this.endDate());
    return from || to ? `${from || '…'} – ${to || '…'}` : this.i18n.resultPeriodAll();
  }

  /**
   * The org's logo (its avatar) as an absolute imgix URL, '' when it has none. Raster images are
   * scaled to print height without cropping; an SVG goes out as stored (imgix cannot rasterise it).
   */
  private async orgLogoUrl(orgKey: string): Promise<string> {
    const storagePath = await firstValueFrom(this.avatarService.getRelStorageUrl(`org.${orgKey}`)).catch(() => '');
    if (!storagePath) return '';
    const url = `${this.env.services.imgixBaseUrl}/${storagePath}`;
    return storagePath.toLowerCase().endsWith('.svg') ? url : `${url}?h=240&fit=max&fm=png`;
  }
}

/** StoreDate → «dd.mm.yyyy»; '' stays ''. */
function viewDate(storeDate: string): string {
  return storeDate ? convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false) || storeDate : '';
}
