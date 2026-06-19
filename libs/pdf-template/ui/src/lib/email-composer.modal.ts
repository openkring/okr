// libs/pdf-template/ui/src/lib/email-composer.modal.ts
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonItem, IonInput, IonIcon, IonChip, IonLabel, IonSpinner,
  ModalController, ToastController,
} from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { BkEditor, ButtonCopyI18n } from '@bk2/shared-ui';
import { getImgixUrl } from '@bk2/shared-util-core';
import { buildBrandedEmailHtml, parseEmails } from '@bk2/pdf-template-util';
import { DocEmailService } from '@bk2/pdf-template-data-access';

@Component({
  selector: 'bk-email-composer-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SvgIconPipe, BkEditor,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
    IonItem, IonInput, IonIcon, IonChip, IonLabel, IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start">
          <ion-button (click)="cancel()">Abbrechen</ion-button>
        </ion-buttons>
        <ion-title>Dokument senden</ion-title>
        <ion-buttons slot="end">
          <ion-button [disabled]="!canSend()" (click)="send()">
            @if (isSending()) {
              <ion-spinner name="crescent" slot="icon-only" />
            } @else {
              <strong>Senden</strong>
            }
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <ion-toolbar color="secondary">
        <ion-item lines="none" color="secondary">
          <ion-input label="An: " type="email" [value]="toField()"
            (ionInput)="toField.set($any($event).detail.value ?? '')"
            placeholder="email@domain.com" [clearInput]="true" />
        </ion-item>
      </ion-toolbar>

      <ion-toolbar color="secondary">
        <ion-item lines="none" color="secondary">
          <ion-input label="Cc: " [value]="cc()"
            (ionInput)="cc.set($any($event).detail.value ?? '')"
            placeholder="email1@domain.com, email2@domain.com" [clearInput]="true" />
        </ion-item>
      </ion-toolbar>

      <ion-toolbar color="secondary">
        <ion-item lines="none" color="secondary">
          <ion-input label="Bcc: " [value]="bcc()"
            (ionInput)="bcc.set($any($event).detail.value ?? '')"
            placeholder="email1@domain.com, email2@domain.com" [clearInput]="true" />
        </ion-item>
      </ion-toolbar>

      <ion-toolbar color="secondary">
        <ion-item lines="none" color="secondary">
          <ion-input label="Betreff: " [value]="subject()"
            (ionInput)="subject.set($any($event).detail.value ?? '')"
            [clearInput]="true" />
        </ion-item>
      </ion-toolbar>

      <ion-toolbar color="secondary">
        <ion-item lines="none" color="secondary">
          <ion-chip>
            <ion-icon src="{{ 'attach' | svgIcon }}" />
            <ion-label>{{ filename() }}</ion-label>
          </ion-chip>
        </ion-item>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <bk-editor [(content)]="body" [readOnly]="false" [copyable]="false"
        [buttonCopyI18n]="buttonCopyI18n" />
    </ion-content>
  `,
})
export class EmailComposerModal {
  private readonly appStore = inject(AppStore);
  private readonly docEmailService = inject(DocEmailService);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);

  // inputs
  public readonly to            = input<string>('');
  public readonly recipientName = input<string | undefined>(undefined);
  public readonly storagePath   = input.required<string>();
  public readonly filename      = input.required<string>();
  public readonly outputFormat  = input<'pdf' | 'docx' | 'html'>('pdf');

  // state
  protected readonly toField = linkedSignal(() => this.to());
  protected readonly cc      = signal('');
  protected readonly bcc     = signal('');
  protected readonly subject = linkedSignal(() => `Dokument: ${this.filename()}`);
  protected readonly body    = signal('<p></p>');
  protected readonly isSending = signal(false);

  protected readonly buttonCopyI18n: ButtonCopyI18n = { copy_conf: 'Kopiert' };

  protected readonly canSend = computed(() =>
    !this.isSending() && parseEmails(this.toField()).length > 0,
  );

  protected async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  protected async send(): Promise<void> {
    const to = parseEmails(this.toField());
    if (to.length === 0) return;

    this.isSending.set(true);
    try {
      const cfg = this.appStore.appConfig();
      const imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;
      const rel = getImgixUrl(cfg.logoUrl, 'fm=png&w=240&auto=compress');
      const logoUrl = rel.startsWith('tenant') ? `${imgixBaseUrl}/${rel}` : rel;

      const html = buildBrandedEmailHtml(this.body(), {
        orgName: cfg.appName,
        logoUrl,
        contactEmail: cfg.opEmail,
        attachmentFilename: this.filename(),
      });

      await this.docEmailService.sendDocumentByEmail({
        to,
        cc: parseEmails(this.cc()),
        bcc: parseEmails(this.bcc()),
        // from is omitted on purpose: the CF supplies the app's verified sender address.
        subject: this.subject(),
        html,
        storagePath: this.storagePath(),
        filename: this.filename(),
      });

      await this.showToast(`Dokument gesendet an ${to.join(', ')}`);
      await this.modalController.dismiss({ sent: true }, 'confirm');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.showToast(`Senden fehlgeschlagen: ${message}`, 'danger');
      this.isSending.set(false);
    }
  }

  private async showToast(message: string, color = 'success'): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 3000, color, position: 'bottom' });
    await toast.present();
  }
}
