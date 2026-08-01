import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton, IonButtons, IonCard, IonCardContent, IonChip, IonCol, IonContent, IonGrid,
  IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonNote, IonRow,
  IonSelect, IonSelectOption, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { ProcessingRegisterService } from '@okr/security-processing-data-access';
import type { RegisterFilter } from '@okr/security-processing-data-access';
import { ProcessingMap } from '@okr/security-processing-ui';
import {
  PROCESSING_I18N_KEYS, type ProcessingI18n, buildRegisterDocument,
} from '@okr/security-processing-util';
import { DocGenerationService } from '@okr/pdf-template-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AlertService } from '@okr/shared-util-angular';
import { DateFormat, convertDateFormatToString, getTodayStr } from '@okr/shared-util-core';
import { SvgIconPipe } from '@okr/shared-pipes';
import type { ProcessorCategory, ProcessorEntry } from '@okr/shared-models';

/**
 * The Bearbeitungsverzeichnis (spec 1.19 Phase 5C) — `/security/register`, `isAdminGuard`.
 *
 * Read-only by design: the catalogue is code, versioned in git next to the integrations it
 * describes. There is no add/edit action here and therefore no DB-driven context menu; the
 * one list-level action is the PDF export, which is a plain toolbar button.
 */
@Component({
  selector: 'okr-processing-register-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, SvgIconPipe, ProcessingMap,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonChip, IonNote, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonSpinner, IonCard, IonCardContent,
  ],
  styles: [`
    .legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; align-items: center; }
    .swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; margin-right: 5px; }
    .swatch.ch { background: var(--ion-color-success-tint); }
    .swatch.eu { background: var(--ion-color-warning-tint); }
    .swatch.third { background: var(--ion-color-danger-tint); }
    .missing { color: var(--ion-color-danger); font-weight: 600; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filtered().length }}/{{ all().length }} {{ i18n.register_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="exportPdf()" [disabled]="isExporting()">
            @if (isExporting()) {
              <ion-spinner name="dots" />
            } @else {
              <ion-icon slot="icon-only" src="{{ 'download' | svgIcon }}" />
            }
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <ion-toolbar color="light">
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="4">
              <ion-select [label]="i18n.filter_category()" [value]="category()" interface="popover"
                          (ionChange)="category.set($event.detail.value)">
                <ion-select-option [value]="undefined">{{ i18n.filter_all() }}</ion-select-option>
                @for (c of service.categories(); track c) {
                  <ion-select-option [value]="c">{{ categoryLabel(c) }}</ion-select-option>
                }
              </ion-select>
            </ion-col>
            <ion-col size="6" size-md="4">
              <ion-select [label]="i18n.filter_country()" [value]="country()" interface="popover"
                          (ionChange)="country.set($event.detail.value)">
                <ion-select-option [value]="undefined">{{ i18n.filter_all() }}</ion-select-option>
                @for (c of service.countries(); track c) {
                  <ion-select-option [value]="c">{{ c }}</ion-select-option>
                }
              </ion-select>
            </ion-col>
            <ion-col size="6" size-md="4">
              <ion-select [label]="i18n.filter_origin()" [value]="origin()" interface="popover"
                          (ionChange)="origin.set($event.detail.value)">
                <ion-select-option [value]="undefined">{{ i18n.filter_all() }}</ion-select-option>
                <ion-select-option value="catalogue">{{ i18n.filter_origin_catalogue() }}</ion-select-option>
                <ion-select-option value="tenant">{{ i18n.filter_origin_tenant() }}</ion-select-option>
              </ion-select>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-note>{{ i18n.controller_note() }}</ion-note>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-content>
          <okr-processing-map [entries]="filtered()" [appName]="appName()" />
          <div class="legend">
            <span><i class="swatch ch"></i>{{ i18n.map_legend_ch() }}</span>
            <span><i class="swatch eu"></i>{{ i18n.map_legend_eu() }}</span>
            <span><i class="swatch third"></i>{{ i18n.map_legend_third() }}</span>
          </div>
        </ion-card-content>
      </ion-card>

      @if (filtered().length === 0) {
        <ion-list><ion-item lines="none"><ion-label>{{ i18n.register_empty() }}</ion-label></ion-item></ion-list>
      } @else {
        <ion-list lines="inset">
          @for (entry of filtered(); track entry.key) {
            <ion-item button [detail]="true" [routerLink]="['/security/register', entry.key]">
              <ion-label>
                <h2>{{ entry.name }}</h2>
                <p>{{ roleLabel(entry) }} · {{ entry.country }} · {{ transferLabel(entry) }}</p>
                <p class="ion-hide-sm-down">{{ entry.dataClasses.join(', ') }}</p>
                @if (entry.dpaUrl === '') {
                  <p class="missing">{{ i18n.missing_dpa() }}</p>
                }
              </ion-label>
              <ion-chip slot="end" class="ion-hide-md-down">{{ categoryLabel(entry.category) }}</ion-chip>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class ProcessingRegisterPage {
  protected readonly service = inject(ProcessingRegisterService);
  private readonly appStore = inject(AppStore);
  private readonly docs = inject(DocGenerationService);
  private readonly alertService = inject(AlertService);
  protected readonly i18n = inject(I18nService).translateAll(PROCESSING_I18N_KEYS) as ProcessingI18n;

  protected readonly category = signal<ProcessorCategory | undefined>(undefined);
  protected readonly country = signal<string | undefined>(undefined);
  protected readonly origin = signal<RegisterFilter['origin']>(undefined);
  protected readonly isExporting = signal(false);

  protected readonly all = this.service.entries;
  protected readonly appName = computed(() => this.appStore.appConfig().appName);

  protected readonly filtered = computed(() =>
    this.service.filtered({
      category: this.category(),
      country: this.country(),
      origin: this.origin(),
    })());

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

  /**
   * Exports the **unfiltered** register. The filters are a reading aid; a PDF that silently
   * omitted the rows the admin had filtered out would be a false record — and this document
   * is what gets handed to an auditor.
   */
  protected async exportPdf(): Promise<void> {
    this.isExporting.set(true);
    try {
      const html = buildRegisterDocument(this.all(), {
        tenantName: this.appStore.appConfig().appName,
        generatedOn: convertDateFormatToString(
          getTodayStr(), DateFormat.StoreDate, DateFormat.ViewDate, false) ?? '',
        controllerNote: this.i18n.controller_note(),
      });
      const result = await this.docs.printHtml(html, 'bearbeitungsverzeichnis.pdf', 'privacy-register');
      window.open(result.url, '_blank');
    } catch (error) {
      this.alertService.error(`ProcessingRegisterPage.exportPdf: ${error}`);
    } finally {
      this.isExporting.set(false);
    }
  }
}
