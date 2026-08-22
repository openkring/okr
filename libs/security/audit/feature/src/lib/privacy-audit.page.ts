import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton, IonButtons, IonCard, IonCardContent, IonChip, IonContent, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonMenuButton, IonNote, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { PrivacyAuditService } from '@okr/security-audit-data-access';
import type { DriveAccessResult, RebuildDirectoryResult } from '@okr/security-audit-data-access';
import {
  PRIVACY_AUDIT_I18N_KEYS, type PrivacyAuditI18n, buildAuditDocument,
} from '@okr/security-audit-util';
import { DocGenerationService } from '@okr/content-pdf-template-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AlertService } from '@okr/shared-util-angular';
import { DateFormat, convertDateFormatToString, getTodayStr } from '@okr/shared-util-core';
import { SvgIconPipe } from '@okr/shared-pipes';
import type { FindingSeverity, PrivacyAuditResult } from '@okr/shared-models';

/**
 * The privacy audit screen (spec 1.19 Phase 5D) — `/security/privacy-audit`, `isAdminGuard`.
 *
 * Runs on demand and renders what came back. The findings' German wording is authored
 * server-side next to the check that produced it and rendered verbatim; only the chrome
 * is translated.
 *
 * The audit repairs nothing — every finding links to the screen where a human does.
 */
@Component({
  selector: 'okr-privacy-audit-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, SvgIconPipe,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonChip, IonNote, IonSpinner,
    IonCard, IonCardContent,
  ],
  styles: [`
    .finding { border-left: 4px solid var(--ion-color-medium); }
    .finding.error { border-left-color: var(--ion-color-danger); }
    .finding.warning { border-left-color: var(--ion-color-warning); }
    .finding.info { border-left-color: var(--ion-color-primary); }
    .samples { font-size: 12px; opacity: .8; word-break: break-all; }
    .clean { color: var(--ion-color-success); font-weight: 600; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ i18n.title() }}</ion-title>
        <ion-buttons slot="end">
          @if (result(); as r) {
            <ion-button (click)="exportPdf(r)" [disabled]="isExporting()">
              @if (isExporting()) {
                <ion-spinner name="dots" />
              } @else {
                <ion-icon slot="icon-only" src="{{ 'download' | svgIcon }}" />
              }
            </ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-note>{{ i18n.subtitle() }}</ion-note>
          <div class="ion-margin-top">
            <ion-button (click)="run()" [disabled]="isRunning() || isRebuilding()">
              @if (isRunning()) {
                <ion-spinner name="dots" slot="start" /> {{ i18n.running() }}
              } @else {
                {{ i18n.run() }}
              }
            </ion-button>
            <!-- The one repair reachable from here: check 3's fix is a single callable, so
                 the screen that reports the staleness can also clear it. Everything else
                 needs a human on the offending record. -->
            <ion-button fill="outline" (click)="rebuildDirectory()"
                        [disabled]="isRunning() || isRebuilding()">
              @if (isRebuilding()) {
                <ion-spinner name="dots" slot="start" /> {{ i18n.rebuild_running() }}
              } @else {
                {{ i18n.rebuild_action() }}
              }
            </ion-button>
            <!-- Diary import prerequisite V2 (spec 1.34): proves the deployed function still
                 holds a working Drive refresh token. Reads only, writes nothing, returns no
                 file content. Belongs on a diary admin screen once one exists. -->
            <ion-button fill="outline" (click)="checkDrive()"
                        [disabled]="isRunning() || isRebuilding() || isCheckingDrive()">
              @if (isCheckingDrive()) {
                <ion-spinner name="dots" slot="start" /> {{ i18n.drive_running() }}
              } @else {
                {{ i18n.drive_action() }}
              }
            </ion-button>
          </div>
        </ion-card-content>
      </ion-card>

      <!-- Same reasoning as the rebuild card: the raw line is deliberately untranslated, so it
           still says something when the i18n scope fails to load — which is exactly the kind of
           day on which someone is checking whether Drive access works. -->
      @if (driveResult(); as drive) {
        <ion-card>
          <ion-card-content>
            <p>{{ i18n.drive_ok() }}</p>
            <ion-note class="samples">
              account {{ drive.account }} · firstPageFiles {{ drive.firstPageFiles }} ·
              hasMorePages {{ drive.hasMorePages }} ·
              quota {{ drive.quotaUsage }}/{{ drive.quotaLimit }}
            </ion-note>
          </ion-card-content>
        </ion-card>
      }

      <!-- The rebuild's outcome, kept on screen. A toast is the wrong instrument for an
           operation that runs for a minute: it fires 3s after the admin has stopped
           watching. The raw counter line is deliberately untranslated — it is the one part
           that still says something if the i18n scope failed to load. -->
      @if (rebuildSummary(); as summary) {
        <ion-card>
          <ion-card-content>
            @if (rebuildMessage(); as message) { <p>{{ message }}</p> }
            <ion-note class="samples">
              persons {{ summary.persons }} · orgs {{ summary.orgs }} ·
              crossTenantAddresses {{ summary.crossTenantAddresses }} ·
              parentsAffected {{ summary.parentsAffected }}
            </ion-note>
          </ion-card-content>
        </ion-card>
      }

      @if (error(); as message) {
        <ion-card color="danger">
          <ion-card-content>{{ i18n.failed() }} {{ message }}</ion-card-content>
        </ion-card>
      }

      @if (result(); as r) {
        <ion-card>
          <ion-card-content>
            <ion-chip color="danger">{{ countOf('error') }} {{ i18n.severity_error() }}</ion-chip>
            <ion-chip color="warning">{{ countOf('warning') }} {{ i18n.severity_warning() }}</ion-chip>
            <ion-chip color="primary">{{ countOf('info') }} {{ i18n.severity_info() }}</ion-chip>
            <p><ion-note>{{ i18n.ranAt() }} {{ ranOn() }} · {{ r.checksRun }} {{ i18n.checksRun() }}</ion-note></p>
          </ion-card-content>
        </ion-card>

        @if (r.findings.length === 0) {
          <ion-card><ion-card-content><span class="clean">{{ i18n.clean() }}</span></ion-card-content></ion-card>
        } @else {
          <ion-list lines="full">
            @for (f of r.findings; track f.checkId) {
              <ion-item class="finding {{ f.severity }}" [routerLink]="[f.fixRoute]" [detail]="true">
                <ion-label class="ion-text-wrap">
                  <h2>{{ f.checkId }} — {{ f.titleDe }}</h2>
                  <p>{{ f.detailDe }}</p>
                  <p><strong>{{ i18n.affected() }} {{ f.count }}</strong></p>
                  @if (f.sampleKeys.length > 0) {
                    <p class="samples">{{ i18n.samples() }} {{ f.sampleKeys.join(', ') }}</p>
                  }
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      } @else if (!isRunning()) {
        <ion-card><ion-card-content>{{ i18n.notRun() }}</ion-card-content></ion-card>
      }
    </ion-content>
  `,
})
export class PrivacyAuditPage {
  private readonly service = inject(PrivacyAuditService);
  private readonly appStore = inject(AppStore);
  private readonly docs = inject(DocGenerationService);
  private readonly alertService = inject(AlertService);
  private readonly i18nService = inject(I18nService);
  protected readonly i18n = this.i18nService.translateAll(PRIVACY_AUDIT_I18N_KEYS) as PrivacyAuditI18n;

  protected readonly result = signal<PrivacyAuditResult | undefined>(undefined);
  protected readonly isRunning = signal(false);
  protected readonly isExporting = signal(false);
  protected readonly isRebuilding = signal(false);
  protected readonly rebuildSummary = signal<RebuildDirectoryResult | undefined>(undefined);
  protected readonly rebuildMessage = signal<string | undefined>(undefined);
  protected readonly isCheckingDrive = signal(false);
  protected readonly driveResult = signal<DriveAccessResult | undefined>(undefined);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly ranOn = computed(() =>
    convertDateFormatToString(this.result()?.ranAt, DateFormat.StoreDate, DateFormat.ViewDate, false));

  protected countOf(severity: FindingSeverity): number {
    return this.result()?.findings.filter((f) => f.severity === severity).length ?? 0;
  }

  protected async run(): Promise<void> {
    this.isRunning.set(true);
    this.error.set(undefined);
    // Clear the previous result first: a stale report left on screen while a new run is in
    // flight reads as the current state of the tenant, which is exactly what it is not.
    this.result.set(undefined);
    try {
      this.result.set(await this.service.run(this.appStore.tenantId()));
    } catch (error) {
      this.error.set(`${error}`);
    } finally {
      this.isRunning.set(false);
    }
  }

  /**
   * Rebuilds the address-directory projection (check 3's remedy).
   *
   * Confirmed first: the callable rewrites the projection for **every** person and org in the
   * database, not just this tenant's, and on a large database it runs for minutes. The result
   * is reported rather than swallowed — a non-zero `crossTenantAddresses` means addresses were
   * being served across tenant boundaries until this run, which an admin needs to be told
   * about rather than find in a function log.
   *
   * The audit result on screen is deliberately left standing: it describes the tenant as of
   * its own run, and re-running the audit is one click away.
   */
  protected async rebuildDirectory(): Promise<void> {
    const question = await this.i18nService.translateOnce(PRIVACY_AUDIT_I18N_KEYS.rebuild_confirm);
    if (!await this.alertService.confirm(question, true)) return;

    this.isRebuilding.set(true);
    this.rebuildSummary.set(undefined);
    this.rebuildMessage.set(undefined);
    try {
      const summary = await this.service.rebuildAddressDirectory();
      let message = await this.i18nService.translateOnce(
        PRIVACY_AUDIT_I18N_KEYS.rebuild_done,
        { persons: summary.persons, orgs: summary.orgs });
      if (summary.crossTenantAddresses > 0) {
        message += ' ' + await this.i18nService.translateOnce(
          PRIVACY_AUDIT_I18N_KEYS.rebuild_cross,
          { addresses: summary.crossTenantAddresses, parents: summary.parentsAffected });
      }
      // Set the summary before the toast: the card is the record, the toast only the nudge.
      this.rebuildSummary.set(summary);
      this.rebuildMessage.set(message.trim() === '' ? undefined : message);
      await this.alertService.showToast(message);
    } catch (error) {
      this.alertService.error(`PrivacyAuditPage.rebuildDirectory: ${error}`);
    } finally {
      this.isRebuilding.set(false);
    }
  }

  /**
   * Calls the diary Drive health check and puts the numbers on screen.
   *
   * The failure is surfaced verbatim rather than summarised: `invalid_grant` from Google, a
   * `permission-denied` from the function and a wrong-query `0 files` all look alike once
   * flattened into "Drive access failed", and they need three different fixes.
   */
  protected async checkDrive(): Promise<void> {
    this.isCheckingDrive.set(true);
    this.driveResult.set(undefined);
    try {
      this.driveResult.set(await this.service.checkDriveAccess());
    } catch (error) {
      this.alertService.error(`${this.i18n.drive_failed()} ${error}`);
    } finally {
      this.isCheckingDrive.set(false);
    }
  }

  protected async exportPdf(result: PrivacyAuditResult): Promise<void> {
    this.isExporting.set(true);
    try {
      const html = buildAuditDocument(result, {
        tenantName: this.appStore.appConfig().appName,
        generatedOn: convertDateFormatToString(
          getTodayStr(), DateFormat.StoreDate, DateFormat.ViewDate, false) ?? '',
        cleanMessage: this.i18n.clean(),
      });
      const generated = await this.docs.printHtml(html, 'datenschutz-pruefbericht.pdf', 'privacy-audit');
      window.open(generated.url, '_blank');
    } catch (error) {
      this.alertService.error(`PrivacyAuditPage.exportPdf: ${error}`);
    } finally {
      this.isExporting.set(false);
    }
  }
}
