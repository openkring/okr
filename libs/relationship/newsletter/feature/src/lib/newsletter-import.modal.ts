import { Component, computed, inject, input, signal } from '@angular/core';
import { IonButton, IonContent, IonItem, IonLabel, IonList, IonNote, IonText } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';

import { ImportSummary, NewsletterSubscriptionService } from '@okr/relationship-newsletter-data-access';
import { ImportRow, NEWSLETTER_I18N_KEYS, parseMailchimpCsv } from '@okr/relationship-newsletter-util';

/** The server refuses more rows than this per call (`MAX_IMPORT_ROWS`). */
const MAX_ROWS = 2000;

/**
 * Imports a Mailchimp audience export (CSV) into one newsletter (spec 1.169 §5.10). A tool dialog, not an
 * edit form: pick the file, press «Importieren», read the five counts. The file is parsed in the browser
 * and never uploaded; the server (`importNewsletterSubscribers`) re-validates the rows and echoes no address.
 * Opened from the newsletter's subscriber list.
 */
@Component({
  selector: 'okr-newsletter-import-modal',
  standalone: true,
  imports: [Header, IonContent, IonList, IonItem, IonLabel, IonNote, IonText, IonButton],
  template: `
    <okr-header [i18n]="{ title: i18n.import_title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-note color="medium" class="hint">{{ i18n.import_hint() }}</ion-note>

      <ion-item lines="none">
        <ion-label position="stacked">{{ i18n.import_file() }}</ion-label>
        <input type="file" accept=".csv,text/csv" [disabled]="running()" (change)="onFile($event)" />
      </ion-item>

      @if (error()) {
        <ion-text color="danger"><p class="error">{{ error() }}</p></ion-text>
      }

      <ion-button expand="block" class="run" [disabled]="rows().length === 0 || running()" (click)="run()">
        {{ running() ? i18n.import_running() : i18n.import_run() }}
      </ion-button>

      @if (summary(); as s) {
        <ion-list lines="inset">
          <ion-item><ion-label>{{ i18n.import_imported() }}</ion-label><ion-note slot="end">{{ s.imported }}</ion-note></ion-item>
          <ion-item><ion-label>{{ i18n.import_already() }}</ion-label><ion-note slot="end">{{ s.alreadySubscribed }}</ion-note></ion-item>
          <ion-item><ion-label>{{ i18n.import_matched() }}</ion-label><ion-note slot="end">{{ s.matchedExisting }}</ion-note></ion-item>
          <ion-item><ion-label class="ion-text-wrap">{{ i18n.import_ambiguous() }}</ion-label><ion-note slot="end">{{ s.ambiguous }}</ion-note></ion-item>
          <ion-item><ion-label>{{ i18n.import_invalid() }}</ion-label><ion-note slot="end">{{ s.invalid }}</ion-note></ion-item>
        </ion-list>
      }
    </ion-content>
  `,
  styles: [`
    .hint { display: block; margin-bottom: 16px; }
    .run { margin-top: 16px; }
    .error { padding: 0 16px; }
  `],
})
export class NewsletterImportModal {
  private readonly service = inject(NewsletterSubscriptionService);
  protected readonly i18n = inject(I18nService).translateAll(NEWSLETTER_I18N_KEYS);

  // inputs (modal componentProps)
  public readonly tenantId = input.required<string>();
  public readonly groupKey = input.required<string>();

  protected readonly rows = signal<ImportRow[]>([]);
  protected readonly running = signal(false);
  protected readonly error = signal('');
  protected readonly summary = signal<ImportSummary | undefined>(undefined);
  protected readonly hasRows = computed(() => this.rows().length > 0);

  /** Reads the chosen file in the browser; nothing is uploaded. */
  protected async onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.rows.set([]);
    this.summary.set(undefined);
    this.error.set('');
    if (!file) return;
    const rows = parseMailchimpCsv(await file.text());
    if (rows.length === 0) this.error.set(this.i18n.import_no_rows());
    else if (rows.length > MAX_ROWS) this.error.set(fill(this.i18n.import_too_many(), { max: String(MAX_ROWS) }));
    else this.rows.set(rows);
  }

  protected async run(): Promise<void> {
    if (this.running() || this.rows().length === 0) return;
    this.running.set(true);
    this.error.set('');
    try {
      this.summary.set(await this.service.importRows(this.tenantId(), this.groupKey(), this.rows()));
      this.rows.set([]);
    } catch (err) {
      console.error('NewsletterImportModal.run: importNewsletterSubscribers failed', err);
      this.error.set(this.i18n.import_error());
    } finally {
      this.running.set(false);
    }
  }
}
