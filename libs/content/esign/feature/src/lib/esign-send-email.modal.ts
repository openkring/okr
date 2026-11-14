// libs/content/esign/feature/src/lib/esign-send-email.modal.ts
import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import {
  IonCard, IonCardContent, IonCol, IonContent, IonGrid,
  IonItem, IonLabel, IonRow, IonSpinner,
  ModalController, ToastController,
} from '@ionic/angular';

import {
  ChangeConfirmation, Checkbox, CheckboxI18n, Header, NotesInput, NotesInputI18n, TextInput, TextInputI18n,
} from '@okr/shared-ui';
import { EsignRecord } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { ESIGN_I18N_KEYS, EsignI18n } from '@okr/content-esign-util';
import { EsignService } from '@okr/content-esign-data-access';
import { dismissOverlay } from '@okr/shared-util-angular';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'okr-esign-send-email-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Header, ChangeConfirmation, TextInput, NotesInput, Checkbox,
    IonContent, IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonSpinner,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <okr-header [i18n]="{ title: i18n.email_title() }" [isModal]="true" />
    <!-- recipients are prefilled from the signees, so sending is offered as soon as at least one
         address is valid; the reset button appears once something was edited. -->
    @if (canSend()) {
      <okr-change-confirmation [i18n]="{ cancel: i18n.cancel(), save: i18n.send() }"
        [showCancel]="isDirty()" (saveClicked)="send()" (cancelClicked)="reset()" />
    }

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

      @if (status() === 'sending') {
        <div class="ion-text-center"><ion-spinner name="dots" /></div>
      }
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

  // the values the modal opened with — reset() returns to them, isDirty() compares against them
  private readonly initial = signal({ recipients: '', subject: '', body: '', includePdf: true });
  protected readonly isDirty = computed(() => {
    const i = this.initial();
    return this.recipients() !== i.recipients || this.subject() !== i.subject
      || this.body() !== i.body || this.includePdf() !== i.includePdf;
  });

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
    this.initial.set({ recipients: emails.join(', '), subject: this.esign().documentName, body: '', includePdf: true });
    this.reset();
  }

  protected reset(): void {
    const i = this.initial();
    this.recipients.set(i.recipients);
    this.subject.set(i.subject);
    this.body.set(i.body);
    this.includePdf.set(i.includePdf);
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
      await dismissOverlay(this.modalController, null, 'confirm');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.presentToast(`${this.i18n.send_failed()}: ${message}`, 'danger');
      this.status.set('ready');
    }
  }

  private async presentToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 3000, color });
    await toast.present();
  }
}
