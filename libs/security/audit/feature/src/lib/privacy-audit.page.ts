import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton, IonButtons, IonCard, IonCardContent, IonChip, IonContent, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonMenuButton, IonNote, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { PrivacyAuditService } from '@okr/security-audit-data-access';
import {
  PRIVACY_AUDIT_I18N_KEYS, type PrivacyAuditI18n, buildAuditDocument,
} from '@okr/security-audit-util';
import { DocGenerationService } from '@okr/pdf-template-data-access';
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
            <ion-button (click)="run()" [disabled]="isRunning()">
              @if (isRunning()) {
                <ion-spinner name="dots" slot="start" /> {{ i18n.running() }}
              } @else {
                {{ i18n.run() }}
              }
            </ion-button>
          </div>
        </ion-card-content>
      </ion-card>

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
  protected readonly i18n = inject(I18nService).translateAll(PRIVACY_AUDIT_I18N_KEYS) as PrivacyAuditI18n;

  protected readonly result = signal<PrivacyAuditResult | undefined>(undefined);
  protected readonly isRunning = signal(false);
  protected readonly isExporting = signal(false);
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
