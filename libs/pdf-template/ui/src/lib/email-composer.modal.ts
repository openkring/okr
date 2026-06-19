// libs/pdf-template/ui/src/lib/email-composer.modal.ts
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonIcon, IonChip, IonLabel, IonNote,
  ModalController, ToastController,
} from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { SvgIconPipe } from '@bk2/shared-pipes';
import {
  BkEditor, ButtonCopy, ButtonCopyI18n, ChangeConfirmation, ChangeConfirmationI18n,
  EmailInput, EmailInputI18n, TextInput, TextInputI18n,
} from '@bk2/shared-ui';
import { getImgixUrl } from '@bk2/shared-util-core';
import { validateVestTree } from '@bk2/shared-util-angular';
import {
  buildBrandedEmailHtml, parseEmails,
  EmailComposerFormModel, emailComposerValidations,
} from '@bk2/pdf-template-util';
import { DocEmailService, InlineAttachment } from '@bk2/pdf-template-data-access';

/** Reject files larger than this client-side (the CF caps inline attachments at 8 MB). */
const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;

@Component({
  selector: 'bk-email-composer-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SvgIconPipe,
    BkEditor, ButtonCopy, ChangeConfirmation, EmailInput, TextInput,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonIcon, IonChip, IonLabel, IonNote,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .editor-actions { display: flex; justify-content: flex-end; align-items: center; gap: 4px; padding: 4px 12px; }
    .attachment { padding: 0 12px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>Dokument senden</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">
            <ion-icon src="{{ 'cancel-circle' | svgIcon }}" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    @if (showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n" (saveClicked)="send()" (cancelClicked)="revert()" />
    }

    <ion-content class="ion-no-padding">
      @if (showForm()) {
        <form novalidate>
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="toI18n" [value]="toField()"
                      (valueChange)="onFieldChange('to', $event)"
                      [autofocus]="true" [maxLength]="200" [readOnly]="false" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-email [i18n]="fromI18n" [value]="from()"
                      (valueChange)="onFieldChange('from', $event)" [readOnly]="false" />
                    @if (fromWarning(); as warning) {
                      <ion-note color="warning" class="attachment">{{ warning }}</ion-note>
                    }
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="ccI18n" [value]="cc()"
                      (valueChange)="onFieldChange('cc', $event)" [maxLength]="200" [readOnly]="false" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="bccI18n" [value]="bcc()"
                      (valueChange)="onFieldChange('bcc', $event)" [maxLength]="200" [readOnly]="false" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12">
                    <bk-text-input [i18n]="subjectI18n" [value]="subject()"
                      (valueChange)="onFieldChange('subject', $event)" [maxLength]="100" [readOnly]="false" />
                  </ion-col>
                </ion-row>
                <ion-row class="ion-align-items-center">
                  <ion-col size="9">
                    <ion-chip [outline]="true">
                      <ion-icon src="{{ 'attach' | svgIcon }}" />
                      <ion-label>{{ filename() }}</ion-label>
                    </ion-chip>
                    @for (att of extraAttachments(); track att.filename) {
                      <ion-chip [outline]="true">
                        <ion-icon src="{{ 'attach' | svgIcon }}" />
                        <ion-label>{{ att.filename }}</ion-label>
                        <ion-icon src="{{ 'cancel' | svgIcon }}" (click)="removeAttachment(att.filename)" />
                      </ion-chip>
                    }
                  </ion-col>
                  <ion-col size="3" class="ion-text-end">
                    <ion-button fill="outline" size="small" (click)="fileInput.click()">
                      <ion-icon src="{{ 'add' | svgIcon }}" slot="start" />
                      Hinzufügen
                    </ion-button>
                    <input #fileInput type="file" hidden (change)="onFileSelected($event)" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12">
                    <bk-editor [content]="body()" (contentChange)="onFieldChange('body', $event)"
                      [readOnly]="false" [clearable]="false" [copyable]="false"
                      [buttonCopyI18n]="buttonCopyI18n" />
                    <div class="editor-actions">
                      <bk-button-copy [i18n]="buttonCopyI18n" [value]="body()" />
                      <ion-icon src="{{ 'cancel' | svgIcon }}" (click)="clearBody()" tabindex="-1" />
                    </div>
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        </form>
      }
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

  // form model + signal-forms validation
  protected readonly formData = linkedSignal<EmailComposerFormModel>(() => this.buildInitial());
  protected readonly composerForm = form(this.formData, (path) =>
    validateVestTree(path, emailComposerValidations as any));

  protected readonly isDirty = signal(false);
  protected readonly isSending = signal(false);
  protected readonly showForm = signal(true);
  protected readonly extraAttachments = signal<InlineAttachment[]>([]);
  protected readonly showConfirmation = computed(() =>
    this.composerForm().valid() && this.isDirty() && !this.isSending());

  // field accessors
  protected readonly toField  = computed(() => this.formData().to);
  protected readonly from     = computed(() => this.formData().from);
  protected readonly cc       = computed(() => this.formData().cc);
  protected readonly bcc      = computed(() => this.formData().bcc);
  protected readonly subject  = computed(() => this.formData().subject);
  protected readonly body     = computed(() => this.formData().body);

  /** The app's email domain (e.g. seeclub.org), always taken from app config. */
  protected readonly appDomain = computed(() => this.appStore.appConfig().appDomain?.toLowerCase() ?? '');

  protected readonly fromWarning = computed(() => {
    const from = this.formData().from?.trim() ?? '';
    if (from.length === 0) return '';
    const expected = this.appDomain();
    const domain = from.split('@')[1]?.toLowerCase() ?? '';
    return expected && domain === expected
      ? ''
      : `Warnung: Der Absender ist nicht auf der Domain ${expected || '(unbekannt)'} – der Versand wird abgelehnt.`;
  });

  // i18n objects (literals; this lib uses literal German strings, like the other modals)
  protected readonly toI18n: TextInputI18n      = { name: 'to', label: 'An', placeholder: 'email@domain.com', helper: '' };
  protected readonly fromI18n: EmailInputI18n   = { name: 'from', label: 'Von', placeholder: 'email@seeclub.org' };
  protected readonly ccI18n: TextInputI18n      = { name: 'cc', label: 'Cc', placeholder: 'email1@domain.com, email2@domain.com', helper: '' };
  protected readonly bccI18n: TextInputI18n     = { name: 'bcc', label: 'Bcc', placeholder: 'email1@domain.com, email2@domain.com', helper: '' };
  protected readonly subjectI18n: TextInputI18n = { name: 'subject', label: 'Betreff', placeholder: '', helper: '' };
  protected readonly buttonCopyI18n: ButtonCopyI18n = { copy_conf: 'Kopiert' };
  protected readonly changeConfirmationI18n: ChangeConfirmationI18n = { cancel: 'Verwerfen', save: 'Senden' };

  private buildInitial(): EmailComposerFormModel {
    const domain = this.appStore.appConfig().appDomain ?? '';
    return {
      to: this.to(),
      // Default sender on the app's own domain (e.g. app@seeclub.org), derived from app config.
      from: domain ? `app@${domain}` : '',
      cc: '',
      bcc: '',
      subject: `Dokument: ${this.filename()}`,
      body: '<p></p>',
    };
  }

  protected onFieldChange(field: keyof EmailComposerFormModel, value: string): void {
    this.isDirty.set(true);
    this.formData.update((vm) => ({ ...vm, [field]: value }));
  }

  protected clearBody(): void {
    this.onFieldChange('body', '<p></p>');
  }

  /** Read a user-picked file from the device and attach it inline (base64). */
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';                          // allow re-selecting the same file later
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      void this.showToast(`Datei zu gross (max. ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB): ${file.name}`, 'danger');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;        // data:<type>;base64,<data>
      const contentBase64 = result.split(',')[1] ?? '';
      this.extraAttachments.update((list) => [
        ...list,
        { filename: file.name, contentBase64, contentType: file.type || 'application/octet-stream' },
      ]);
      this.isDirty.set(true);
    };
    reader.readAsDataURL(file);
  }

  protected removeAttachment(filename: string): void {
    this.extraAttachments.update((list) => list.filter((a) => a.filename !== filename));
    this.isDirty.set(true);
  }

  protected revert(): void {
    this.isDirty.set(false);
    this.extraAttachments.set([]);
    this.formData.set(this.buildInitial());
    this.showForm.set(false);          // toggle to clear stale Vest state
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  protected async send(): Promise<void> {
    if (!this.composerForm().valid() || this.isSending()) return;
    this.isSending.set(true);
    try {
      const fd = this.formData();
      const cfg = this.appStore.appConfig();
      const imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;
      const rel = getImgixUrl(cfg.logoUrl, 'fm=png&w=240&auto=compress');
      const logoUrl = rel.startsWith('tenant') ? `${imgixBaseUrl}/${rel}` : rel;

      const html = buildBrandedEmailHtml(fd.body, {
        orgName: cfg.appName,
        logoUrl,
        contactEmail: cfg.opEmail,
        attachmentFilename: this.filename(),
      });

      const recipients = parseEmails(fd.to);
      await this.docEmailService.sendDocumentByEmail({
        to: recipients,
        cc: parseEmails(fd.cc),
        bcc: parseEmails(fd.bcc),
        from: fd.from,
        subject: fd.subject,
        html,
        storagePath: this.storagePath(),
        filename: this.filename(),
        extraAttachments: this.extraAttachments(),
      });

      await this.showToast(`Dokument gesendet an ${recipients.join(', ')}`);
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
