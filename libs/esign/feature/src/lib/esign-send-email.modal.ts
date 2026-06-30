// libs/esign/feature/src/lib/esign-send-email.modal.ts
import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import {
  IonButton, IonButtons, IonCard, IonCardContent, IonCol, IonContent, IonGrid, IonHeader,
  IonItem, IonLabel, IonRow, IonSpinner, IonTitle, IonToolbar,
  ModalController, ToastController,
} from '@ionic/angular/standalone';

import { Checkbox, CheckboxI18n, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { EsignRecord } from '@bk2/shared-models';
import { EsignService } from '@bk2/esign-data-access';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'bk-esign-send-email-modal',
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
        <ion-title>Dokument per E-Mail senden</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">Schliessen</ion-button>
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
                <bk-text-input [i18n]="recipientsI18n" [value]="recipients()"
                  (valueChange)="recipients.set($event)"
                  [readOnly]="false" [autofocus]="true" [maxLength]="500" />
              </ion-col>

              <ion-col size="12">
                <bk-text-input [i18n]="subjectI18n" [value]="subject()"
                  (valueChange)="subject.set($event)" [readOnly]="false" [maxLength]="120" />
              </ion-col>

              <ion-col size="12">
                <bk-checkbox [i18n]="includePdfI18n" [checked]="includePdf()"
                  (checkedChange)="includePdf.set($event)" [readOnly]="false" />
              </ion-col>

              <ion-col size="12">
                <bk-notes-input [i18n]="bodyI18n" [value]="body()"
                  (valueChange)="body.set($event)" [readOnly]="false" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-button expand="block" [disabled]="!canSend()" (click)="send()">
        @if (status() === 'sending') { <ion-spinner name="dots" /> } @else { Senden }
      </ion-button>
    </ion-content>
  `,
})
export class EsignSendEmailModal implements OnInit {
  public readonly esign = input.required<EsignRecord>();

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

  protected readonly recipientsI18n: TextInputI18n = {
    name: 'recipients', label: 'Empfänger', placeholder: 'name@example.com, …',
    helper: 'Eine oder mehrere E-Mail-Adressen, kommagetrennt',
  };
  protected readonly subjectI18n: TextInputI18n = {
    name: 'subject', label: 'Betreff (optional)', placeholder: 'Betreff der E-Mail', helper: '',
  };
  protected readonly bodyI18n: NotesInputI18n = {
    name: 'body', label: 'Nachricht (optional)', placeholder: 'Leer lassen für den Standardtext',
  };
  protected readonly includePdfI18n: CheckboxI18n = {
    name: 'includeSignedPdf', label: 'Signiertes PDF anhängen', helper: '',
  };

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
      await this.presentToast('E-Mail wurde versendet.', 'success');
      await this.modalController.dismiss(null, 'confirm');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.presentToast('Senden fehlgeschlagen: ' + message, 'danger');
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
