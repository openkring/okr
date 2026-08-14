// libs/content/esign/feature/src/lib/esign-send-email.modal.ts
import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import {
  IonButton, IonButtons, IonCard, IonCardContent, IonCol, IonContent, IonGrid, IonHeader,
  IonItem, IonLabel, IonRow, IonSpinner, IonTitle, IonToolbar,
  ModalController, ToastController,
} from '@ionic/angular/standalone';

import { Checkbox, CheckboxI18n, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { EsignRecord } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { ESIGN_I18N_KEYS, EsignI18n } from '@okr/content-esign-util';
import { EsignService } from '@okr/content-esign-data-access';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'okr-esign-send-email-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TextInput, NotesInput, Checkbox,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonSpinner,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ i18n.email_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">{{ i18n.close() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <ion-item lines="none">
                  <ion-label>
                    <h2>{{ esign().documentName }}</h2>
                  </ion-label>
                </ion-item>
              </ion-col>

              <ion-col size="12">
                <okr-text-input [i18n]="recipientsI18n()" [value]="recipients()"
                  (valueChange)="recipients.set($event)"
                  [readOnly]="false" [autofocus]="true" [maxLength]="500" />
              </ion-col>

              <ion-col size="12">
                <okr-text-input [i18n]="subjectI18n()" [value]="subject()"
                  (valueChange)="subject.set($event)" [readOnly]="false" [maxLength]="120" />
              </ion-col>

              <ion-col size="12">
                <okr-checkbox [i18n]="includePdfI18n()" [checked]="includePdf()"
                  (checkedChange)="includePdf.set($event)" [readOnly]="false" />
              </ion-col>

              <ion-col size="12">
                <okr-notes-input [i18n]="bodyI18n()" [value]="body()"
                  (valueChange)="body.set($event)" [readOnly]="false" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-button expand="block" [disabled]="!canSend()" (click)="send()">
        @if (status() === 'sending') { <ion-spinner name="dots" /> } @else { {{ i18n.send() }} }
      </ion-button>
    </ion-content>
  `,
})
export class EsignSendEmailModal implements OnInit {
  public readonly esign = input.required<EsignRecord>();

  protected readonly i18n = inject(I18nService).translateAll(ESIGN_I18N_KEYS) as EsignI18n;
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly esignService    = inject(EsignService);

  protected readonly recipients = signal('');
  protected readonly subject    = signal('');
  protected readonly body       = signal('');
  protected readonly includePdf = signal(true);
  protected readonly status     = signal<'ready' | 'sending'>('ready');

  protected readonly parsedRecipients = computed(() =>
    this.recipients()
      .split(/[,;]/)
      .map((e) => e.trim())
      .filter((e) => EMAIL_RE.test(e)));

  protected readonly canSend = computed(() => this.status() === 'ready' && this.parsedRecipients().length > 0);

  // adapted at the shared/ui boundary (the field primitives define their own minimal interface)
  protected readonly recipientsI18n = computed(() => ({
    name: 'recipients', label: this.i18n.recipients_label(),
    placeholder: this.i18n.recipients_placeholder(), helper: this.i18n.recipients_helper(),
  } as TextInputI18n));
  protected readonly subjectI18n = computed(() => ({
    name: 'subject', label: this.i18n.subject_label(),
    placeholder: this.i18n.subject_placeholder(), helper: '',
  } as TextInputI18n));
  protected readonly bodyI18n = computed(() => ({
    name: 'body', label: this.i18n.body_label(), placeholder: this.i18n.body_placeholder(),
  } as NotesInputI18n));
  protected readonly includePdfI18n = computed(() => ({
    name: 'includeSignedPdf', label: this.i18n.include_pdf_label(), helper: '',
  } as CheckboxI18n));

  public ngOnInit(): void {
    const emails = (this.esign().signees ?? []).map((s) => s.email).filter(Boolean);
    this.recipients.set(emails.join(', '));
    this.subject.set(this.esign().documentName);
  }

  protected async send(): Promise<void> {
    if (!this.canSend()) return;
    this.status.set('sending');
    try {
      await this.esignService.sendByEmail({
        esignId: this.esign().esignId,
        recipients: this.parsedRecipients(),
        ...(this.subject() ? { subject: this.subject() } : {}),
        ...(this.body() ? { body: this.body() } : {}),
        includeSignedPdf: this.includePdf(),
      });
      await this.presentToast(this.i18n.email_sent(), 'success');
      await this.modalController.dismiss(null, 'confirm');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.presentToast(`${this.i18n.send_failed()}: ${message}`, 'danger');
      this.status.set('ready');
    }
  }

  protected close(): void {
    this.modalController.dismiss(null, 'cancel');
  }

  private async presentToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 3000, color });
    await toast.present();
  }
}
