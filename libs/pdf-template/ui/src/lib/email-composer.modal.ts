// libs/pdf-template/ui/src/lib/email-composer.modal.ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { form } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonIcon, IonChip, IonLabel, IonNote,
  ModalController, ToastController,
} from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { SvgIconPipe } from '@okr/shared-pipes';
import {
  OkrEditor, ButtonCopy, ButtonCopyI18n, ChangeConfirmation, ChangeConfirmationI18n,
  EmailInput, EmailInputI18n, TextInput, TextInputI18n,
} from '@okr/shared-ui';
import { getImgixUrl } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';
import {
  buildBrandedEmailHtml, parseEmails,
  EmailComposerFormModel, emailComposerValidations,
  EMAIL_COMPOSER_I18N_KEYS, EMAIL_COMPOSER_MSG_KEYS, EmailComposerI18n,
} from '@okr/pdf-template-util';
import { DocEmailService, InlineAttachment } from '@okr/pdf-template-data-access';

/** Reject files larger than this client-side (the CF caps inline attachments at 8 MB). */
const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;

@Component({
  selector: 'okr-email-composer-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SvgIconPipe,
    OkrEditor, ButtonCopy, ChangeConfirmation, EmailInput, TextInput,
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
        <ion-title>{{ i18n.title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">
            <ion-icon src="{{ 'cancel-circle' | svgIcon }}" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="send()" (cancelClicked)="revert()" />
    }

    <ion-content class="ion-no-padding">
      @if (showForm()) {
        <form novalidate>
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="toI18n()" [value]="toField()"
                      (valueChange)="onFieldChange('to', $event)"
                      [autofocus]="true" [maxLength]="200" [readOnly]="false" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-email [i18n]="fromI18n()" [value]="from()"
                      (valueChange)="onFieldChange('from', $event)" [readOnly]="false" />
                    @if (fromWarning(); as warning) {
                      <ion-note color="warning" class="attachment">{{ warning }}</ion-note>
                    }
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="ccI18n()" [value]="cc()"
                      (valueChange)="onFieldChange('cc', $event)" [maxLength]="200" [readOnly]="false" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="bccI18n()" [value]="bcc()"
                      (valueChange)="onFieldChange('bcc', $event)" [maxLength]="200" [readOnly]="false" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12">
                    <okr-text-input [i18n]="subjectI18n()" [value]="subject()"
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
                      {{ i18n.attachment_add() }}
                    </ion-button>
                    <input #fileInput type="file" hidden (change)="onFileSelected($event)" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12">
                    <okr-editor [content]="body()" (contentChange)="onFieldChange('body', $event)"
                      [readOnly]="false" [clearable]="false" [copyable]="false"
                      [buttonCopyI18n]="buttonCopyI18n()" />
                    <div class="editor-actions">
                      <okr-button-copy [i18n]="buttonCopyI18n()" [value]="body()" />
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
  private readonly i18nService = inject(I18nService);
  protected readonly i18n = this.i18nService.translateAll(EMAIL_COMPOSER_I18N_KEYS) as EmailComposerI18n;

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
      : `${this.i18n.from_warning()} ${expected || this.i18n.from_unknown()}`;
  });

  // adapters at the shared/ui boundary (these components define their own minimal i18n interfaces)
  protected readonly toI18n = computed(() => ({
    name: 'to', label: this.i18n.to_label(), placeholder: this.i18n.to_placeholder(), helper: '',
  } as TextInputI18n));
  protected readonly fromI18n = computed(() => ({
    name: 'from', label: this.i18n.from_label(), placeholder: this.i18n.from_placeholder(),
  } as EmailInputI18n));
  protected readonly ccI18n = computed(() => ({
    name: 'cc', label: this.i18n.cc_label(), placeholder: this.i18n.cc_placeholder(), helper: '',
  } as TextInputI18n));
  protected readonly bccI18n = computed(() => ({
    name: 'bcc', label: this.i18n.bcc_label(), placeholder: this.i18n.bcc_placeholder(), helper: '',
  } as TextInputI18n));
  protected readonly subjectI18n = computed(() => ({
    name: 'subject', label: this.i18n.subject_label(), placeholder: '', helper: '',
  } as TextInputI18n));
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.i18n.copy_conf() } as ButtonCopyI18n));
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.revert(), save: this.i18n.send(),
  } as ChangeConfirmationI18n));

  constructor() {
    // The subject prefix resolves asynchronously, so buildInitial() may have run before it arrived
    // (it reads the prefix untracked — a tracked read would let a late translation reset the whole
    // form, wiping user input). Patch the subject in once the prefix lands, and only while the form
    // is still pristine.
    effect(() => {
      const prefix = this.i18n.subject_prefix();
      if (prefix.length === 0) return;
      untracked(() => {
        if (this.isDirty()) return;
        this.formData.update((vm) => ({ ...vm, subject: `${prefix} ${this.filename()}` }));
      });
    });
  }

  private buildInitial(): EmailComposerFormModel {
    const domain = this.appStore.appConfig().appDomain ?? '';
    const prefix = untracked(() => this.i18n.subject_prefix());
    return {
      to: this.to(),
      // Default sender on the app's own domain (e.g. app@seeclub.org), derived from app config.
      from: domain ? `app@${domain}` : '',
      cc: '',
      bcc: '',
      subject: prefix ? `${prefix} ${this.filename()}` : this.filename(),
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
      void this.showParamToast(EMAIL_COMPOSER_MSG_KEYS.attachment_toolarge, {
        maxMb: Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024),
        name: file.name,
      }, 'danger');
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

      await this.showParamToast(EMAIL_COMPOSER_MSG_KEYS.send_conf, { recipients: recipients.join(', ') });
      await this.modalController.dismiss({ sent: true }, 'confirm');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.showParamToast(EMAIL_COMPOSER_MSG_KEYS.send_error, { error: message }, 'danger');
      this.isSending.set(false);
    }
  }

  /**
   * Resolve a parameterised message key and show it as a toast. Parameterised keys must go through
   * translate(key, params) — translateAll() passes no params and would strip the placeholders.
   */
  private async showParamToast(key: string, params: Record<string, string | number>, color = 'success'): Promise<void> {
    const message = await firstValueFrom(this.i18nService.translate(key, params));
    const toast = await this.toastController.create({ message, duration: 3000, color, position: 'bottom' });
    await toast.present();
  }
}
