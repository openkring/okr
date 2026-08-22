// libs/content/pdf-template/ui/src/lib/email-composer.modal.ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { form } from '@angular/forms/signals';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { filter, firstValueFrom, tap } from 'rxjs';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonIcon, IonChip, IonLabel, IonNote,
  IonSegment, IonSegmentButton, IonList, IonItem,
  ModalController, ToastController,
} from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { SvgIconPipe } from '@okr/shared-pipes';
import {
  OkrEditor, ButtonCopy, ButtonCopyI18n, ChangeConfirmation, ChangeConfirmationI18n,
  EmailInput, EmailInputI18n, TextInput, TextInputI18n,
} from '@okr/shared-ui';
import { getImgixUrl } from '@okr/shared-util-core';
import { dismissOverlay, validateVestTree } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';
import {
  buildBrandedEmailHtml, isSenderDomainAllowed, parseEmails,
  EmailComposerFormModel, emailComposerValidations,
  EMAIL_COMPOSER_I18N_KEYS, EMAIL_COMPOSER_MSG_KEYS, EmailComposerI18n,
} from '@okr/content-pdf-template-util';
import { DocEmailService, InlineAttachment } from '@okr/content-pdf-template-data-access';

/** Reject files larger than this client-side (the CF caps inline attachments at 8 MB). */
const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;

/** The three views of the composer: write the mail, see it rendered, check the recipients. */
type ComposerSegment = 'editor' | 'preview' | 'list';

@Component({
  selector: 'okr-email-composer-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    SvgIconPipe,
    OkrEditor, ButtonCopy, ChangeConfirmation, EmailInput, TextInput,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonIcon, IonChip, IonLabel, IonNote,
    IonSegment, IonSegmentButton, IonList, IonItem,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .editor-actions { display: flex; justify-content: flex-end; align-items: center; gap: 4px; padding: 4px 12px; }
    .attachment { padding: 0 12px; }
    .preview-frame { width: 100%; min-height: 420px; border: 0; background: #ffffff; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ headerTitle() }}@if (progress(); as p) { <span> — {{ p }}</span> }</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">
            <ion-icon src="{{ 'cancel-circle' | svgIcon }}" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [(ngModel)]="activeSegment">
          <ion-segment-button value="editor"><ion-label>{{ i18n.segment_editor() }}</ion-label></ion-segment-button>
          <ion-segment-button value="preview"><ion-label>{{ i18n.segment_preview() }}</ion-label></ion-segment-button>
          <ion-segment-button value="list"><ion-label>{{ i18n.segment_list() }} ({{ recipientCount() }})</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="send()" (cancelClicked)="revert()" />
    }

    <ion-content class="ion-no-padding">
      @if (showForm()) {
        <form novalidate>
          <!-- Editor: sender, subject, attachments and the message body. -->
          @if (activeSegment() === 'editor') {
            <ion-card>
              <ion-card-content class="ion-no-padding">
                <ion-grid>
                  <ion-row>
                    <ion-col size="12" size-md="6">
                      <okr-email [i18n]="fromI18n()" [value]="from()"
                        (valueChange)="onFieldChange('from', $event)" [readOnly]="false" />
                      @if (fromWarning(); as warning) {
                        <ion-note color="warning" class="attachment">{{ warning }}</ion-note>
                      }
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <okr-text-input [i18n]="subjectI18n()" [value]="subject()"
                        (valueChange)="onFieldChange('subject', $event)"
                        [autofocus]="true" [maxLength]="100" [readOnly]="false" />
                    </ion-col>
                  </ion-row>
                  <ion-row class="ion-align-items-center">
                    <ion-col size="9">
                      @if (filename().length > 0) {
                        <ion-chip [outline]="true">
                          <ion-icon src="{{ 'attach' | svgIcon }}" />
                          <ion-label>{{ filename() }}</ion-label>
                        </ion-chip>
                      }
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
          }

          <!-- Preview: the branded HTML exactly as the recipient receives it. -->
          @if (activeSegment() === 'preview') {
            <ion-card>
              <ion-card-content class="ion-no-padding">
                @if (hasBody()) {
                  <iframe class="preview-frame" [title]="i18n.preview_frame()" [srcdoc]="previewHtml()"></iframe>
                } @else {
                  <ion-note class="attachment">{{ i18n.preview_empty() }}</ion-note>
                }
              </ion-card-content>
            </ion-card>
          }

          <!-- Verteiler: who the mail goes to, editable here and nowhere else. -->
          @if (activeSegment() === 'list') {
            <ion-card>
              <ion-card-content class="ion-no-padding">
                <ion-grid>
                  <ion-row>
                    <ion-col size="12">
                      <okr-text-input [i18n]="toI18n()" [value]="toField()"
                        (valueChange)="onFieldChange('to', $event)" [maxLength]="200" [readOnly]="false" />
                    </ion-col>
                  </ion-row>
                  <ion-row>
                    <ion-col size="12" size-md="6">
                      <okr-text-input [i18n]="ccI18n()" [value]="ccField()"
                        (valueChange)="onFieldChange('cc', $event)" [maxLength]="200" [readOnly]="false" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <okr-text-input [i18n]="bccI18n()" [value]="bccField()"
                        (valueChange)="onFieldChange('bcc', $event)" [maxLength]="200" [readOnly]="false" />
                    </ion-col>
                  </ion-row>
                </ion-grid>
                @if (recipientCount() === 0) {
                  <ion-note class="attachment">{{ i18n.list_empty() }}</ion-note>
                } @else {
                  <ion-list lines="full">
                    @for (entry of recipients(); track entry.email) {
                      <ion-item>
                        <ion-label>
                          <p>{{ entry.kind }}</p>
                          {{ entry.email }}
                        </ion-label>
                      </ion-item>
                    }
                  </ion-list>
                }
              </ion-card-content>
            </ion-card>
          }
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
  private readonly sanitizer = inject(DomSanitizer);
  private readonly i18nService = inject(I18nService);
  protected readonly i18n = this.i18nService.translateAll(EMAIL_COMPOSER_I18N_KEYS) as EmailComposerI18n;

  // inputs
  public readonly to            = input<string>('');
  public readonly cc            = input<string>('');
  public readonly bcc           = input<string>('');
  public readonly recipientName = input<string | undefined>(undefined);
  /** Storage path of a generated document to attach. Empty when composing a plain mail. */
  public readonly storagePath   = input<string>('');
  /** Filename of that document — drives the attachment chip and the subject prefix. */
  public readonly filename      = input<string>('');
  public readonly outputFormat  = input<'pdf' | 'docx' | 'html'>('pdf');

  protected readonly activeSegment = signal<ComposerSegment>('editor');

  // form model + signal-forms validation
  protected readonly formData = linkedSignal<EmailComposerFormModel>(() => this.buildInitial());
  protected readonly composerForm = form(this.formData, (path) =>
    validateVestTree(path, emailComposerValidations as any));

  protected readonly isDirty = signal(false);
  protected readonly isSending = signal(false);
  /** Without an attached document this is a plain mail, not "send document". */
  protected readonly headerTitle = computed(() =>
    this.filename().length === 0 ? this.i18n.title_plain() : this.i18n.title());

  /** "<block>/<blocks>" while a chunked bulk send is running, empty for a single message. */
  protected readonly progress = signal('');
  protected readonly showForm = signal(true);
  protected readonly extraAttachments = signal<InlineAttachment[]>([]);
  protected readonly showConfirmation = computed(() =>
    this.composerForm().valid() && this.isDirty() && !this.isSending());

  // field accessors
  protected readonly toField  = computed(() => this.formData().to);
  protected readonly from     = computed(() => this.formData().from);
  protected readonly ccField  = computed(() => this.formData().cc);
  protected readonly bccField = computed(() => this.formData().bcc);
  protected readonly subject  = computed(() => this.formData().subject);
  protected readonly body     = computed(() => this.formData().body);

  /** Every recipient of this mail, flattened for the Verteiler overview. */
  protected readonly recipients = computed(() => {
    const fd = this.formData();
    return [
      ...parseEmails(fd.to).map((email) => ({ email, kind: 'To' })),
      ...parseEmails(fd.cc).map((email) => ({ email, kind: 'Cc' })),
      ...parseEmails(fd.bcc).map((email) => ({ email, kind: 'Bcc' })),
    ];
  });
  protected readonly recipientCount = computed(() => this.recipients().length);

  /**
   * Domain the mail provider has verified as a sender. The app is served from `app.<domain>` while
   * mail leaves the apex, so `emailDomain` wins over `appDomain` when the tenant sets it.
   */
  protected readonly senderDomain = computed(() => {
    const cfg = this.appStore.appConfig();
    return (cfg.emailDomain || cfg.appDomain || '').toLowerCase();
  });

  protected readonly fromWarning = computed(() => {
    const from = this.formData().from?.trim() ?? '';
    if (from.length === 0) return '';
    const expected = this.senderDomain();
    return isSenderDomainAllowed(from, expected)
      ? ''
      : `${this.i18n.from_warning()} ${expected || this.i18n.from_unknown()}`;
  });

  protected readonly hasBody = computed(() => {
    const body = this.formData().body ?? '';
    return body.replace(/<[^>]*>/g, '').trim().length > 0;
  });

  /** The outgoing message rendered exactly as `send()` builds it — one source of truth. */
  protected readonly previewHtml = computed((): SafeHtml =>
    this.sanitizer.bypassSecurityTrustHtml(this.buildHtml(this.formData().body)));

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
      if (prefix.length === 0 || this.filename().length === 0) return;
      untracked(() => {
        if (this.isDirty()) return;
        this.formData.update((vm) => ({ ...vm, subject: `${prefix} ${this.filename()}` }));
      });
    });
  }

  /**
   * Default sender/recipient: the tenant's configured mail address (`mailFrom`), falling back to
   * `app@<verified sending domain>`. The caller's `to` always wins when it supplies one.
   */
  private defaultAddress(): string {
    const cfg = this.appStore.appConfig();
    const configured = (cfg.mailFrom ?? '').trim();
    if (configured.length > 0) return configured;
    const domain = cfg.emailDomain || cfg.appDomain || '';
    return domain ? `app@${domain}` : '';
  }

  private buildInitial(): EmailComposerFormModel {
    const fallback = this.defaultAddress();
    const prefix = untracked(() => this.i18n.subject_prefix());
    return {
      to: this.to() || fallback,
      from: fallback,
      cc: this.cc(),
      bcc: this.bcc(),
      subject: this.initialSubject(prefix),
      body: '<p></p>',
    };
  }

  /** Without an attached document there is nothing to derive a subject from — leave it empty. */
  private initialSubject(prefix: string): string {
    const filename = this.filename();
    if (filename.length === 0) return '';
    return prefix ? `${prefix} ${filename}` : filename;
  }

  /** Wrap a message body in the tenant's branded email shell (used by preview and send alike). */
  private buildHtml(body: string): string {
    const cfg = this.appStore.appConfig();
    const imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;
    const rel = getImgixUrl(cfg.logoUrl, 'fm=png&w=240&auto=compress');
    const logoUrl = rel.startsWith('tenant') ? `${imgixBaseUrl}/${rel}` : rel;
    return buildBrandedEmailHtml(body, {
      orgName: cfg.appName,
      logoUrl,
      contactEmail: cfg.opEmail,
      attachmentFilename: this.filename(),
    });
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
    await dismissOverlay(this.modalController, null, 'cancel');
  }

  protected async send(): Promise<void> {
    if (!this.composerForm().valid() || this.isSending()) return;
    this.isSending.set(true);
    try {
      const fd = this.formData();
      const html = this.buildHtml(fd.body);

      const recipients = parseEmails(fd.to);
      const request = {
        to: recipients,
        cc: parseEmails(fd.cc),
        bcc: parseEmails(fd.bcc),
        from: fd.from,
        subject: fd.subject,
        html,
        storagePath: this.storagePath(),
        filename: this.filename(),
        extraAttachments: this.extraAttachments(),
      };
      // A bulk send (bcc list) runs server-side: the job survives closing this modal. A single
      // mail goes straight through the callable so the provider error surfaces immediately.
      if (request.bcc.length > 0) {
        await this.awaitJob(await this.docEmailService.queueBulkEmail(request));
      } else {
        await this.docEmailService.sendDocumentByEmail(request);
      }

      await this.showParamToast(EMAIL_COMPOSER_MSG_KEYS.send_conf, { recipients: recipients.join(', ') });
      await dismissOverlay(this.modalController, { sent: true }, 'confirm');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A bulk send aborts on the first failing block — say how far it got, never claim success.
      const sent = this.progress();
      await this.showParamToast(EMAIL_COMPOSER_MSG_KEYS.send_error,
        { error: sent ? `${message} (${sent})` : message }, 'danger');
      this.isSending.set(false);
    }
  }

  /**
   * Follow a queued bulk send until it is done, showing "<block>/<blocks>" in the title.
   * Closing the modal only stops the watching — the job keeps running server-side.
   */
  private async awaitJob(key: string | undefined): Promise<void> {
    if (!key) throw new Error(this.i18n.send_queue_error());
    const job = await firstValueFrom(this.docEmailService.mailJob(key).pipe(
      tap((j) => this.progress.set((j?.blocksTotal ?? 0) > 1 ? `${j?.blocksSent ?? 0}/${j?.blocksTotal}` : '')),
      filter((j) => j?.state === 'sent' || j?.state === 'failed'),
    ));
    if (job?.state === 'failed') throw new Error(job.error ?? '');
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
