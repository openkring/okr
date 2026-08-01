import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  IonBackButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip,
  IonContent, IonHeader, IonItem, IonLabel, IonList, IonNote, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { ProcessingRegisterService } from '@okr/security-processing-data-access';
import { PROCESSING_I18N_KEYS, type ProcessingI18n } from '@okr/security-processing-util';
import { I18nService } from '@okr/shared-i18n';
import type { ProcessorCategory, ProcessorEntry } from '@okr/shared-models';

/**
 * One register entry in full (spec 1.19 Phase 5C) — `/security/register/:key`,
 * `isAdminGuard`.
 *
 * Shows every `ProcessorEntry` field plus the Cloud Functions that actually perform the
 * transfer, and states the controller relationship explicitly: the tenant is the
 * controller, bkaiser GmbH is the processor for the platform layer, and the infrastructure
 * providers are its sub-processors — rather than implying the tenant contracts Google
 * directly.
 *
 * A key that is unknown, or that belongs to an integration this tenant has not enabled,
 * renders "not active" rather than an empty page: the difference matters to an admin
 * checking whether a transfer happens at all.
 */
@Component({
  selector: 'okr-processing-activity-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonList,
    IonItem, IonLabel, IonChip, IonNote, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  ],
  styles: [`
    .missing { color: var(--ion-color-danger); font-weight: 600; }
    ul { margin: 4px 0; padding-left: 18px; }
    code { font-size: 12px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/security/register" /></ion-buttons>
        <ion-title>{{ entry()?.name ?? i18n.register_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (entry(); as e) {
        <ion-card>
          <ion-card-content><ion-note>{{ i18n.controller_note() }}</ion-note></ion-card-content>
        </ion-card>

        <ion-list lines="inset">
          <ion-item><ion-label><h3>{{ i18n.field_legalEntity() }}</h3><p>{{ e.legalEntity }}</p></ion-label></ion-item>
          <ion-item><ion-label><h3>{{ i18n.field_role() }}</h3><p>{{ roleLabel(e) }}</p></ion-label></ion-item>
          <ion-item><ion-label><h3>{{ i18n.field_category() }}</h3><p>{{ categoryLabel(e.category) }}</p></ion-label></ion-item>
          <ion-item><ion-label><h3>{{ i18n.field_country() }}</h3><p>{{ e.country }}</p></ion-label></ion-item>
          <ion-item>
            <ion-label><h3>{{ i18n.field_transferMechanism() }}</h3><p>{{ transferLabel(e) }}</p></ion-label>
          </ion-item>

          <ion-item>
            <ion-label>
              <h3>{{ i18n.field_purposes() }}</h3>
              <ul>@for (p of e.purposes; track p) { <li>{{ p }}</li> }</ul>
            </ion-label>
          </ion-item>

          <ion-item>
            <ion-label><h3>{{ i18n.field_dataClasses() }}</h3></ion-label>
            <div slot="end">
              @for (dc of e.dataClasses; track dc) { <ion-chip>{{ dc }}</ion-chip> }
            </div>
          </ion-item>

          <ion-item><ion-label><h3>{{ i18n.field_retention() }}</h3><p>{{ e.retentionText }}</p></ion-label></ion-item>

          <ion-item>
            <ion-label>
              <h3>{{ i18n.field_securityMeasures() }}</h3>
              <ul>@for (m of e.securityMeasures; track m) { <li>{{ m }}</li> }</ul>
            </ion-label>
          </ion-item>

          <ion-item>
            <ion-label>
              <h3>{{ i18n.field_dpa() }}</h3>
              @if (e.dpaUrl === '') {
                <p class="missing">{{ i18n.missing_dpa() }}</p>
              } @else {
                <p><a [href]="e.dpaUrl" target="_blank" rel="noopener noreferrer">{{ e.dpaUrl }}</a></p>
              }
            </ion-label>
          </ion-item>

          <ion-item>
            <ion-label>
              <h3>{{ i18n.field_privacy() }}</h3>
              @if (e.privacyUrl === '') {
                <p>—</p>
              } @else {
                <p><a [href]="e.privacyUrl" target="_blank" rel="noopener noreferrer">{{ e.privacyUrl }}</a></p>
              }
            </ion-label>
          </ion-item>

          <ion-item><ion-label><h3>{{ i18n.field_contact() }}</h3><p>{{ e.contact }}</p></ion-label></ion-item>

          @if (cloudFunctions().length > 0) {
            <ion-item>
              <ion-label>
                <h3>{{ i18n.field_cloudFunctions() }}</h3>
                <ul>@for (fn of cloudFunctions(); track fn) { <li><code>{{ fn }}</code></li> }</ul>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      } @else {
        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n.detail_notFound() }}</ion-card-title></ion-card-header>
        </ion-card>
      }
    </ion-content>
  `,
})
export class ProcessingActivityPage {
  /** Route param — bound by `withComponentInputBinding`. */
  public readonly key = input<string>('');

  private readonly service = inject(ProcessingRegisterService);
  protected readonly i18n = inject(I18nService).translateAll(PROCESSING_I18N_KEYS) as ProcessingI18n;

  protected readonly entry = computed(() => this.service.byKey(this.key())());
  protected readonly cloudFunctions = computed(() => this.service.cloudFunctionsFor(this.key()));

  protected roleLabel(entry: ProcessorEntry): string {
    switch (entry.role) {
      case 'processor': return this.i18n.role_processor();
      case 'subProcessor': return this.i18n.role_subProcessor();
      default: return this.i18n.role_jointController();
    }
  }

  protected categoryLabel(category: ProcessorCategory): string {
    switch (category) {
      case 'infrastructure': return this.i18n.category_infrastructure();
      case 'saasService': return this.i18n.category_saasService();
      default: return this.i18n.category_externalParty();
    }
  }

  protected transferLabel(entry: ProcessorEntry): string {
    switch (entry.transferMechanism) {
      case 'domestic': return this.i18n.transfer_domestic();
      case 'adequacyDecision': return this.i18n.transfer_adequacyDecision();
      case 'scc': return this.i18n.transfer_scc();
      case 'consent': return this.i18n.transfer_consent();
      default: return this.i18n.transfer_none();
    }
  }
}
