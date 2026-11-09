// libs/content/pdf-template/ui/src/lib/email-composer.modal.ts
import { ChangeDetectionStrategy, Component, ComponentRef, computed, DestroyRef, effect, inject, input, linkedSignal, PLATFORM_ID, signal, untracked, ViewContainerRef, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { form } from '@angular/forms/signals';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { filter, firstValueFrom, tap } from 'rxjs';
import {
  IonButton, IonContent,
  IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonIcon, IonChip, IonLabel, IonNote,
  IonSegment, IonSegmentButton, IonItem, IonAccordionGroup, IonAccordion,
  ModalController, ToastController,
} from '@ionic/angular';

import { AppStore } from '@okr/shared-feature';
import { SvgIconPipe } from '@okr/shared-pipes';
import {
  ButtonCopy, ButtonCopyI18n, ChangeConfirmation, ChangeConfirmationI18n, Checkbox, CheckboxI18n,
  EmailInput, EmailInputI18n, ErrorNote, Header, Spinner, StringSelect, StringSelectI18n, TextInput, TextInputI18n,
} from '@okr/shared-ui';
import type { OkrEditor } from '@okr/shared-ui-editor';
import { DEFAULT_POST_OPTIONS, DeliveryChannel, EmailLayoutChoice, LAYOUT_CHOICES, PostOptions } from '@okr/shared-models';
import { fill, hasRole, needsEmailNormalization } from '@okr/shared-util-core';
import { dismissOverlay, isBrowser, validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';
import {
  ACTIVE_MAILING_CHANNELS, buildVersandRows, EMAIL_ONLY_MAILING_CHANNELS, emailBodyHasContent, emailLayoutOptions, emailOnlyDeliveries,
  GROUP_ADMIN_MAILING_CHANNELS, groupReachWarnings, hasPostDelivery, isSenderDomainAllowed,
  nonPdfAttachmentNames, parseEmails, toggleDelivery, versandBcc, versandDeliveries,
  EmailComposerFormModel, emailComposerValidations, VersandDeliveries, VersandEvent, VersandRow,
  EMAIL_COMPOSER_I18N_KEYS, EMAIL_COMPOSER_MSG_KEYS, EmailComposerI18n,
} from '@okr/content-pdf-template-util';
import { DocEmailService, InlineAttachment, MailingLetters, PostQuote, SendMailingRequest, TemplateService } from '@okr/content-pdf-template-data-access';

import { VersandAddressList } from './versand-address-list';
import { VersandDeliveryTable } from './versand-delivery-table';
import { VersandEventsSelect } from './versand-events-select';
import { PostMode, PostversandStep } from './postversand-step';
import { VersandInfoModal } from './versand-info.modal';

/** Debounce of the price request while the sender changes options or the draft. */
const QUOTE_DEBOUNCE_MS = 400;

/** The message and code a callable error carries: Firebase prefixes the code with `functions/`. */
function callableError(err: unknown): { code: string; message: string } {
  const e = err as { code?: unknown; message?: unknown } | undefined;
  const code = typeof e?.code === 'string' ? e.code.replace(/^functions\//, '') : '';
  return { code, message: typeof e?.message === 'string' ? e.message : String(err) };
}

/** Reject files larger than this client-side (the CF caps inline attachments at 8 MB). */
const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;

/**
 * A composed mail as handed to a caller-supplied send handler: recipients, sender, subject, the message
 * body with the layout it is wrapped in (the server does the wrapping), the name of the document the
 * mail announces as attached, and the files added in the composer. The caller attaches its own document.
 */
export interface ComposedEmail {
  to: string[];
  cc: string[];
  bcc: string[];
  from: string;
  subject: string;
  body: string;
  layout: EmailLayoutChoice;
  /** What the mail names as attached: the document, else the added files. Empty when there is none. */
  attachmentName: string;
  extraAttachments: InlineAttachment[];
}

/** A person a Versand goes to, as the list hands it over: `email` is empty when none is known. */
export interface VersandRecipient {
  personKey: string;
  name: string;
  email: string;
}

/**
 * The views of the composer: write the mail, see it rendered, choose the delivery types per recipient
 * (a Versand only, spec 1.145 §4.3), and the email addresses.
 */
type ComposerSegment = 'editor' | 'preview' | 'delivery' | 'list';

type AddressFieldKey = 'to' | 'cc' | 'bcc';

/** One accordion of the Verteiler: a recipient field shown one address per line. */
interface AddressField {
  key: AddressFieldKey;
  /** The mail header name, deliberately untranslated. */
  label: string;
  addresses: string[];
  editable: boolean;
  placeholder: string;
  errors: string[];
}

@Component({
  selector: 'okr-email-composer-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    SvgIconPipe,
    Header, Spinner, ButtonCopy, ChangeConfirmation, Checkbox, EmailInput, ErrorNote, StringSelect, TextInput,
    VersandDeliveryTable, VersandEventsSelect, PostversandStep,
    IonContent, IonButton,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonIcon, IonChip, IonLabel, IonNote,
    IonSegment, IonSegmentButton, IonItem, IonAccordionGroup, IonAccordion,
    VersandAddressList,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .segment { padding: 8px 12px 0; }
    .editor-actions { display: flex; justify-content: flex-end; align-items: center; gap: 4px; padding: 4px 12px; }
    .note { display: block; padding: 0 12px 8px; }
    .reach-warnings { background: var(--ion-background-color, #ffffff); border-left: 4px solid var(--ion-color-warning); padding: 8px 12px; }
    .reach-warning { display: flex; align-items: flex-start; gap: 8px; color: var(--ion-text-color); font-size: 0.9rem; line-height: 1.4; }
    .reach-warning + .reach-warning { margin-top: 4px; }
    .reach-warning ion-icon { flex: none; font-size: 1.1rem; margin-top: 1px; color: var(--ion-color-warning-shade); }
    .attachments { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .attachments .spacer { flex: 1; }
    /* each recipient field its own bordered block, so the accordions do not run into each other */
    .verteiler ion-accordion { margin: 0 0 12px; border: 1px solid var(--ion-border-color, #d0d7de); border-radius: 8px; overflow: hidden; }
    .verteiler ion-accordion ion-item[slot='header'] { --background: var(--ion-color-light); font-weight: 600; }
    .verteiler [slot='content'] { padding: 4px 0 8px; }
    .preview-frame { width: 100%; min-height: 420px; border: 0; background: #ffffff; }
  `],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true"
      [actionIcon]="isVersand() ? 'info-circle' : ''" [actionTitle]="i18n.info_action()" (actionClicked)="showInfo()" />

    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" [saveDisabled]="!canSend()" (saveClicked)="send()" (cancelClicked)="revert()" />
      @if (anyPost() && !postAllowsSend()) {
        <div class="reach-warnings" role="status">
          <div class="reach-warning">
            <ion-icon src="{{ 'warning' | svgIcon }}" />
            <span>{{ i18n.post_pending() }}</span>
          </div>
        </div>
      }
      @if (reachWarnings().length > 0) {
        <div class="reach-warnings" role="status">
          @for (warning of reachWarnings(); track warning.caleventKey) {
            <div class="reach-warning">
              <ion-icon src="{{ 'warning' | svgIcon }}" />
              <span>{{ reachWarningText(warning) }}</span>
            </div>
          }
        </div>
      }
    }

    <ion-content class="ion-no-padding">
      <!-- After a Versand with Post: the letters are built on the server, then downloaded here (P3). -->
      @if (letters(); as letters) {
        <ion-card>
          <ion-card-content>
            @switch (letters.state) {
              @case ('pending') { <okr-spinner /><ion-note>{{ i18n.letters_pending() }}</ion-note> }
              @case ('ready') {
                <ion-button expand="block" (click)="downloadLetters(letters)">
                  <ion-icon src="{{ 'download' | svgIcon }}" slot="start" />
                  {{ i18n.letters_download() }} ({{ letters.count }})
                </ion-button>
                <ion-note class="note">{{ i18n.letters_kept() }}</ion-note>
              }
              @case ('expired') { <ion-note color="warning">{{ i18n.letters_expired() }}</ion-note> }
              @default { <ion-note color="danger">{{ i18n.letters_failed() }}</ion-note> }
            }
            @if ((letters.missing ?? 0) > 0) {
              <ion-note color="warning" class="note">{{ i18n.letters_missing() }} {{ letters.missing }}</ion-note>
            }
          </ion-card-content>
        </ion-card>
      }
      <div class="segment">
        <ion-segment [(ngModel)]="activeSegment">
          <ion-segment-button value="editor"><ion-label>{{ i18n.segment_editor() }}</ion-label></ion-segment-button>
          <ion-segment-button value="preview"><ion-label>{{ i18n.segment_preview() }}</ion-label></ion-segment-button>
          @if (isVersand()) {
            <ion-segment-button value="delivery"><ion-label>{{ i18n.segment_delivery() }} ({{ versandRows().length }})</ion-label></ion-segment-button>
          }
          <ion-segment-button value="list"><ion-label>{{ i18n.segment_list() }} ({{ recipientCount() }})</ion-label></ion-segment-button>
        </ion-segment>
      </div>

      @if (showForm()) {
        <form novalidate (submit)="$event.preventDefault()">
          <!-- Editor: subject, layout, the message body and its attachments — in that order. -->
          @if (activeSegment() === 'editor') {
            <ion-card>
              <ion-card-content class="ion-no-padding">
                <ion-grid>
                  <ion-row>
                    <ion-col size="12">
                      <okr-text-input [i18n]="subjectI18n()" [value]="subject()"
                        (valueChange)="onFieldChange('subject', $event)"
                        [autofocus]="true" [maxLength]="subjectLength" [readOnly]="false" />
                      <okr-error-note [errors]="subjectErrors()" />
                    </ion-col>
                  </ion-row>
                  <ion-row>
                    <ion-col size="12" size-md="6">
                      <okr-string-select [i18n]="layoutI18n()" [stringList]="layoutChoices()" [labels]="layoutLabels()"
                        [selectedString]="layout()" (selectedStringChange)="onLayoutChange($event)" [readOnly]="false" />
                    </ion-col>
                  </ion-row>
                  @if (showEvents()) {
                    <ion-row>
                      <ion-col size="12">
                        <okr-versand-events-select [events]="versandEvents()" [label]="i18n.events_label()"
                          [placeholder]="i18n.events_placeholder()" [removeLabel]="i18n.events_remove()"
                          [selected]="caleventKeys()" (selectedChange)="onEventsChange($event)" />
                      </ion-col>
                    </ion-row>
                  }
                  <ion-row>
                    <ion-col size="12">
                      @if (!editorRef()) {
                        <okr-spinner />
                      }
                      <div #editorHost></div>
                      <div class="editor-actions">
                        <okr-button-copy [i18n]="buttonCopyI18n()" [value]="body()" />
                        <ion-icon src="{{ 'cancel' | svgIcon }}" (click)="clearBody()" tabindex="-1" />
                      </div>
                      <okr-error-note [errors]="bodyErrors()" />
                    </ion-col>
                  </ion-row>
                  <ion-row>
                    <ion-col size="12">
                      <div class="attachments">
                        <ion-label>{{ i18n.attachment_label() }}</ion-label>
                        @if (filename().length > 0) {
                          <ion-chip [outline]="true">
                            <ion-icon src="{{ 'attachment' | svgIcon }}" />
                            <ion-label>{{ filename() }}</ion-label>
                          </ion-chip>
                        }
                        @for (att of extraAttachments(); track att.filename) {
                          <ion-chip [outline]="true">
                            <ion-icon src="{{ 'attachment' | svgIcon }}" />
                            <ion-label>{{ att.filename }}</ion-label>
                            <ion-icon src="{{ 'cancel' | svgIcon }}" (click)="removeAttachment(att.filename)" />
                          </ion-chip>
                        }
                        <span class="spacer"></span>
                        <ion-button fill="outline" size="small" (click)="fileInput.click()">
                          <ion-icon src="{{ 'add' | svgIcon }}" slot="start" />
                          {{ i18n.attachment_add() }}
                        </ion-button>
                        <input #fileInput type="file" hidden (change)="onFileSelected($event)" />
                      </div>
                    </ion-col>
                  </ion-row>
                </ion-grid>
              </ion-card-content>
            </ion-card>
          }

          <!-- Preview: the mail as the server renders it, i.e. exactly what the recipient receives. -->
          @if (activeSegment() === 'preview') {
            <ion-card>
              <ion-card-content class="ion-no-padding">
                @if (!hasContent()) {
                  <ion-note class="note">{{ i18n.preview_empty() }}</ion-note>
                } @else if (previewLoading()) {
                  <okr-spinner />
                } @else if (previewFailed()) {
                  <ion-note color="danger" class="note">{{ i18n.preview_error() }}</ion-note>
                } @else {
                  <iframe class="preview-frame" [title]="i18n.preview_frame()" sandbox="" [srcdoc]="previewHtml()"></iframe>
                }
              </ion-card-content>
            </ion-card>
          }

          <!-- Zustellung (Versand only): the delivery types per recipient, for this Versand. -->
          @if (activeSegment() === 'delivery') {
            <ion-card>
              <ion-card-content class="ion-no-padding">
                @if (!versandLoaded()) {
                  <okr-spinner />
                } @else {
                  @if (versandFailed()) {
                    <ion-note color="warning" class="note">{{ i18n.delivery_error() }}</ion-note>
                  }
                  <!-- the options of this Versand: E-Mail only (then optionally on the dashboard), QR codes in the letters -->
                  <okr-checkbox [i18n]="emailOnlyI18n()" [checked]="emailOnly()" (checkedChange)="onEmailOnlyChange($event)" [readOnly]="false" />
                  @if (emailOnly()) {
                    <okr-checkbox [i18n]="dashboardI18n()" [checked]="showOnDashboard()" (checkedChange)="onDashboardChange($event)" [readOnly]="false" />
                  }
                  @if (showQrOption()) {
                    <okr-checkbox [i18n]="qrCodesI18n()" [checked]="letterQrCodes()" (checkedChange)="onQrCodesChange($event)" [readOnly]="false" />
                  }
                  <okr-versand-delivery-table [rows]="versandRows()" [deliveries]="deliveries()" [i18n]="i18n"
                    [active]="activeChannels()" (toggled)="onDeliveryToggle($event.row, $event.channel)" />
                  @if (postSkipped().length > 0) {
                    <ion-note color="warning" class="note">{{ i18n.post_skipped() }} {{ postSkipped().join(', ') }}</ion-note>
                  }
                  @if (anyPost()) {
                    <okr-postversand-step [i18n]="i18n" [quote]="postQuote()" [loading]="postLoading()" [error]="postError()"
                      [options]="postOptions()" (optionsChange)="onPostOptionsChange($event)"
                      [mode]="postMode()" (modeChange)="onPostModeChange($event)"
                      [accepted]="postAccepted()" (acceptedChange)="onPostAcceptedChange($event)"
                      [canTopUp]="canTopUp()" [pingenAvailable]="pingenAvailable()" (topUp)="topUp()" />
                    @if (postPriceChanged()) {
                      <ion-note color="warning" class="note">{{ i18n.post_price_changed() }}</ion-note>
                    }
                  }
                }
              </ion-card-content>
            </ion-card>
          }

          <!-- Verteiler: sender and addresses of the email part. -->
          @if (activeSegment() === 'list') {
            <ion-card>
              <ion-card-content class="ion-no-padding">
                @if (isVersand()) {
                  <ion-note class="note">{{ i18n.list_email_only() }}</ion-note>
                }
                @if (hasEvents()) {
                  <ion-note class="note">{{ i18n.list_personal() }}</ion-note>
                }
                @if (recipientCount() === 0) {
                  <ion-note class="note">{{ i18n.list_empty() }}</ion-note>
                }
                <!-- One accordion per address field, one address per line. The labels are the mail header names (not translated). -->
                <ion-accordion-group class="verteiler" [multiple]="true" [value]="openAccordions()">
                  @for (field of addressFields(); track field.key) {
                    <ion-accordion [value]="field.key">
                      <ion-item slot="header">
                        <ion-label>{{ field.label }} ({{ field.addresses.length }})</ion-label>
                      </ion-item>
                      <div slot="content">
                        @if (field.key === 'bcc' && isVersand()) {
                          <ion-note class="note">{{ i18n.bcc_from_delivery() }}</ion-note>
                        }
                        <okr-versand-address-list [addresses]="field.addresses" [editable]="field.editable"
                          [label]="field.label" [placeholder]="field.placeholder"
                          [addLabel]="field.label" [removeLabel]="field.label"
                          (added)="addAddresses(field.key, $event)" (removed)="removeAddress(field.key, $event)" />
                        <okr-error-note [errors]="field.errors" />
                      </div>
                    </ion-accordion>
                  }
                  <ion-accordion value="from">
                    <ion-item slot="header">
                      <ion-label>From: ({{ from() ? 1 : 0 }})</ion-label>
                    </ion-item>
                    <div slot="content">
                      <okr-email [i18n]="fromI18n()" [value]="from()"
                        (valueChange)="onFieldChange('from', $event)" [readOnly]="fromLocked()" />
                      <okr-error-note [errors]="fromErrors()" />
                      @if (fromWarning(); as warning) {
                        <ion-note color="warning" class="note">{{ warning }}</ion-note>
                      }
                    </div>
                  </ion-accordion>
                </ion-accordion-group>
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
  private readonly templateService = inject(TemplateService);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly i18nService = inject(I18nService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = this.i18nService.translateAll(EMAIL_COMPOSER_I18N_KEYS) as EmailComposerI18n;

  // Lazy: a static import of @okr/shared-ui-editor drags ngx-editor/ProseMirror into every page
  // that reaches this modal (spec 1.49, F1) — same shape as editor-configuration.ts.
  private editorHost = viewChild('editorHost', { read: ViewContainerRef });
  protected readonly editorRef = signal<ComponentRef<OkrEditor> | undefined>(undefined);
  /** Guards against a second mount while the chunk is still in flight. */
  private creatingEditor = false;
  /** Set when the modal closes: stops waiting for the letters. */
  private destroyed = false;

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
  /** Prefilled sender, subject and body (HTML); empty = the composer's own defaults. */
  public readonly fromDefault    = input<string>('');
  public readonly subjectDefault = input<string>('');
  public readonly bodyDefault    = input<string>('');
  /** The server decides the sender (a group admin's mail): show it, but don't let it be changed. */
  public readonly fromLocked     = input<boolean>(false);
  /**
   * Sends the mail instead of the generic document mailer (e.g. an invoice, whose PDF and sent mark the
   * server handles). It throws to report a failure; the composer then stays open with the error.
   */
  public readonly sendHandler    = input<((mail: ComposedEmail) => Promise<void>) | undefined>(undefined);
  /**
   * The persons of a Versand (spec 1.145). Set, the composer shows the Zustellung segment and derives
   * the Bcc from it; unset, it is a plain document mail with hand-typed addresses.
   */
  public readonly versandRecipients = input<VersandRecipient[] | undefined>(undefined);
  /** A group admin's Versand: the server only answers for the group's members. */
  public readonly groupKey       = input<string>('');
  /** The events a Versand may attach with answer links (empty on a group admin's path: field hidden). */
  public readonly versandEvents  = input<VersandEvent[]>([]);
  /** groupKey → personKeys of its members, for the «not in the group» note. */
  public readonly membersByGroup = input<Record<string, string[]>>({});

  protected readonly activeSegment = signal<ComposerSegment>('editor');

  // form model + signal-forms validation
  protected readonly formData = linkedSignal<EmailComposerFormModel>(() => this.buildInitial());
  protected readonly extraAttachments = signal<InlineAttachment[]>([]);
  /** What the mail names as «Beilage»: the document, else the added files. Empty without an attachment. */
  protected readonly attachmentName = computed(() =>
    this.filename() || this.extraAttachments().map((a) => a.filename).join(', '));
  protected readonly isVersand = computed(() => this.versandRecipients() !== undefined);
  // Anlässe: the events whose personal answer link every E-Mail recipient gets (own mail per person)
  protected readonly caleventKeys = computed(() => this.formData().caleventKeys ?? []);
  protected readonly showEvents = computed(() => this.isVersand() && !this.groupKey() && this.versandEvents().length > 0);
  protected readonly chosenEvents = computed(() => {
    if (!this.showEvents()) return [];
    const keys = new Set(this.caleventKeys());
    return this.versandEvents().filter((event) => keys.has(event.caleventKey));
  });
  protected readonly hasEvents = computed(() => this.chosenEvents().length > 0);

  // an attachment gives the mail content without a body, and chosen events hide the Cc: validateVestTree cannot pass either to the suite
  private readonly suiteWithContext = (model: EmailComposerFormModel) =>
    emailComposerValidations(model, this.attachmentName().length > 0, this.hasEvents());
  protected readonly composerForm = form(this.formData, (path) =>
    validateVestTree(path, this.suiteWithContext as any));
  private readonly validationResult = vestErrors(this.composerForm);
  protected readonly bodyErrors = computed(() => this.validationResult().getErrors('body'));
  protected readonly subjectErrors = computed(() => this.validationResult().getErrors('subject'));
  protected readonly fromErrors = computed(() => this.validationResult().getErrors('from'));
  protected readonly toErrors = computed(() => this.validationResult().getErrors('to'));
  protected readonly ccErrors = computed(() => this.validationResult().getErrors('cc'));
  protected readonly bccErrors = computed(() => this.validationResult().getErrors('bcc'));

  /** template caps: the suite sets none on these fields, so they only bound typing */
  protected readonly subjectLength = 100;

  // Versand (spec 1.145 §4.3): rows and ticks of the Zustellung table, loaded once from the server
  protected readonly versandRows = signal<VersandRow[]>([]);
  protected readonly deliveries = signal<VersandDeliveries>({});
  private initialDeliveries: VersandDeliveries = {};
  protected readonly versandLoaded = signal(false);
  /**
   * «Versand nur via E-Mail»: Post and In-App cannot be ticked. A group admin never has Post: the letters
   * would carry members' postal addresses (spec 1.145 §6.1).
   */
  protected readonly emailOnly = signal(false);
  /** With «Versand nur via E-Mail»: the message also appears on the recipients' dashboard (no push). */
  protected readonly showOnDashboard = signal(true);
  /** Each letter ends with the chosen events, each with a QR code of the recipient's answer link. */
  protected readonly letterQrCodes = signal(false);
  /** The Post and In-App ticks from before «Versand nur via E-Mail»: they come back when it is switched off. */
  private ticksBeforeEmailOnly: VersandDeliveries = {};
  protected readonly activeChannels = computed(() => {
    if (this.emailOnly()) return EMAIL_ONLY_MAILING_CHANNELS;
    return this.groupKey() ? GROUP_ADMIN_MAILING_CHANNELS : ACTIVE_MAILING_CHANNELS;
  });
  protected readonly anyPost = computed(() => hasPostDelivery(this.deliveries()));
  /** The QR option only makes sense with letters to print and events to answer. */
  protected readonly showQrOption = computed(() => this.anyPost() && this.hasEvents());
  /** The attachments left out of the letters while somebody is ticked under Post. */
  protected readonly postSkipped = computed(() => {
    if (!this.anyPost()) return [];
    const doc = this.filename() ? [{ filename: this.filename(), contentType: this.outputFormat() === 'pdf' ? 'application/pdf' : '' }] : [];
    return nonPdfAttachmentNames([...doc, ...this.extraAttachments()]);
  });
  // Postversand via Pingen (spec 1.150 §6.2): the options, the price the server quoted and the sender's consent to it
  protected readonly postMode = signal<PostMode>('pingen');
  /** Start from what the tenant set as default (`AppConfig.post*`); the sender may change them for this Versand. */
  protected readonly postOptions = signal<PostOptions>(this.tenantPostOptions());
  protected readonly postQuote = signal<PostQuote | undefined>(undefined);
  protected readonly postLoading = signal(false);
  protected readonly postError = signal<string | undefined>(undefined);
  protected readonly postAccepted = signal(false);
  /** The server refused the price the sender saw: it is quoted again and must be accepted again. */
  protected readonly postPriceChanged = signal(false);
  /** False once the server says the credit is not set up: only the PDF download is left. */
  protected readonly pingenAvailable = signal(true);
  protected readonly canTopUp = computed(() => hasRole('admin', this.appStore.currentUser()));
  /** The persons ticked under Post. */
  protected readonly postKeys = computed(() => {
    const deliveries = this.deliveries();
    return this.versandRows()
      .filter((row) => (deliveries[row.personKey] ?? []).includes(DeliveryChannel.Post))
      .map((row) => row.personKey);
  }, { equal: (a, b) => a.length === b.length && a.every((key, i) => key === b[i]) });
  private quoteTimer: ReturnType<typeof setTimeout> | undefined;
  /** Number of the latest quote request: a response with an older number is dropped. */
  private quoteRequest = 0;
  /** The letters of a sent Versand with Post recipients; undefined before sending or without Post. */
  protected readonly letters = signal<MailingLetters | undefined>(undefined);
  /** The server could not answer: every person with an email address is mailed, nothing else. */
  protected readonly versandFailed = signal(false);

  protected readonly isDirty = signal(false);
  protected readonly isSending = signal(false);
  /** Without an attached document this is a plain mail, not "send document". */
  protected readonly headerTitle = computed(() => {
    const title = this.isVersand() || this.filename().length === 0 ? this.i18n.title_plain() : this.i18n.title();
    const progress = this.progress();
    return progress ? `${title} — ${progress}` : title;
  });

  /** "<block>/<blocks>" while a chunked bulk send is running, empty for a single message. */
  protected readonly progress = signal('');
  protected readonly showForm = signal(true);

  /** Per chosen group event: the E-Mail recipients outside that group (they can still answer). */
  protected readonly reachWarnings = computed(() => {
    const deliveries = this.deliveries();
    const emailKeys = this.versandRows()
      .filter((row) => (deliveries[row.personKey] ?? []).includes(DeliveryChannel.Email))
      .map((row) => row.personKey);
    return groupReachWarnings(this.chosenEvents(), emailKeys, this.membersByGroup());
  });
  /**
   * The Senden toolbar appears with the first change, so a change in any segment shows how it is sent;
   * «Senden» stays disabled until the mail can go out (canSend).
   */
  protected readonly showConfirmation = computed(() => this.isDirty() && !this.isSending() && !this.letters());
  /** A valid form; a Versand also needs its Zustellung loaded and at least one ticked recipient. */
  protected readonly canSend = computed(() =>
    this.composerForm().valid()
    && (!this.isVersand() || (this.versandLoaded() && versandDeliveries(this.versandRows(), this.deliveries()).length > 0))
    && this.postAllowsSend());
  /** Post by download is free; by Pingen the sender needs a sufficient, accepted price. */
  private readonly postAllowsSend = computed(() => {
    if (!this.anyPost() || this.postMode() === 'download') return true;
    const quote = this.postQuote();
    return this.pingenAvailable() && !this.postLoading() && !!quote && quote.letters > 0 && quote.sufficient && this.postAccepted();
  });

  // field accessors
  protected readonly from     = computed(() => this.formData().from);
  protected readonly subject  = computed(() => this.formData().subject);
  protected readonly body     = computed(() => this.formData().body);
  protected readonly layout   = computed(() => this.formData().layout);

  /** Vorlage: standard and plain first, then the tenant's further email layouts by name (spec 1.145). */
  private readonly emailTemplates = toSignal(this.templateService.listEmailTemplates(), { initialValue: [] });
  private readonly layoutOptions = computed(() => emailLayoutOptions(this.emailTemplates(), this.appStore.tenantId()));
  protected readonly layoutChoices = computed<EmailLayoutChoice[]>(() => [...LAYOUT_CHOICES, ...this.layoutOptions().map((o) => o.key)]);
  protected readonly layoutLabels = computed(() => [
    this.i18n.layout_standard(), this.i18n.layout_plain(), ...this.layoutOptions().map((o) => o.name),
  ]);

  /**
   * The Verteiler accordions: To, CC (hidden while events are chosen: every person gets their own mail) and BCC,
   * each address on its own line. A Versand derives the BCC from the Zustellung, so it is read-only there.
   */
  protected readonly addressFields = computed<AddressField[]>(() => {
    const fd = this.formData();
    const fields: AddressField[] = [
      { key: 'to', label: 'To:', addresses: parseEmails(fd.to), editable: true, placeholder: this.i18n.to_placeholder(), errors: this.toErrors() },
    ];
    if (!this.hasEvents()) {
      fields.push({ key: 'cc', label: 'Cc:', addresses: parseEmails(fd.cc), editable: true, placeholder: this.i18n.to_placeholder(), errors: this.ccErrors() });
    }
    fields.push({ key: 'bcc', label: 'Bcc:', addresses: parseEmails(fd.bcc), editable: !this.isVersand(), placeholder: this.i18n.to_placeholder(), errors: this.bccErrors() });
    return fields;
  });
  protected readonly recipientCount = computed(() => this.addressFields().reduce((n, f) => n + f.addresses.length, 0));
  /** To and From open by default; a long BCC list stays folded. */
  protected readonly openAccordions = signal<string[]>(['to', 'from']);

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

  protected readonly hasContent = computed(() =>
    this.attachmentName().length > 0 || emailBodyHasContent(this.formData().body ?? ''));

  /**
   * The outgoing message as the server renders it (`renderEmailPreview`, the renderer that sends).
   * The HTML comes back sanitised from the server; the iframe is sandboxed on top of that.
   */
  protected readonly previewHtml = signal<SafeHtml | string>('');
  protected readonly previewLoading = signal(false);
  /** The preview could not be fetched; sending stays possible. */
  protected readonly previewFailed = signal(false);
  /** Number of the latest preview request: a response with an older number is dropped. */
  private previewRequest = 0;

  // adapters at the shared/ui boundary (these components define their own minimal i18n interfaces)
  protected readonly fromI18n = computed(() => ({
    // no visible label: the accordion header says From:, a second «Von» label only confused
    name: 'from', label: '', placeholder: this.i18n.from_placeholder(),
  } as EmailInputI18n));
  protected readonly layoutI18n = computed(() => ({
    name: 'layout', label: this.i18n.layout_label(),
  } as StringSelectI18n));
  protected readonly subjectI18n = computed(() => ({
    name: 'subject', label: this.i18n.subject_label(), placeholder: '', helper: '',
  } as TextInputI18n));
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.i18n.copy_conf() } as ButtonCopyI18n));
  protected readonly emailOnlyI18n = computed(() => ({
    name: 'emailOnly', label: this.i18n.delivery_email_only(), helper: '',
  } as CheckboxI18n));
  protected readonly dashboardI18n = computed(() => ({
    name: 'showOnDashboard', label: this.i18n.delivery_dashboard(), helper: '',
  } as CheckboxI18n));
  protected readonly qrCodesI18n = computed(() => ({
    name: 'letterQrCodes', label: this.i18n.delivery_qr_codes(), helper: '',
  } as CheckboxI18n));
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
      if (prefix.length === 0 || this.filename().length === 0 || this.subjectDefault().length > 0) return;
      untracked(() => {
        if (this.isDirty()) return;
        this.formData.update((vm) => ({ ...vm, subject: `${prefix} ${this.filename()}` }));
      });
    });
    // The preview is fetched every time its segment opens and again if what it shows changes while it is
    // open (layout, body, attachment name). Reads happen here, the request itself runs untracked.
    effect(() => {
      const open = this.activeSegment() === 'preview';
      const body = this.body();
      const layout = this.layout();
      const attachmentName = this.attachmentName();
      const events = this.chosenEvents();
      untracked(() => {
        if (open && this.hasContent()) {
          void this.loadPreview(body, layout, attachmentName, events);
        } else {
          this.previewRequest++;       // leaving the preview (or nothing to show): a late response is stale
          this.previewLoading.set(false);
          this.previewFailed.set(false);
        }
      });
    });
    // Pattern A (lazy-loading skill): the effect body stays synchronous and starts the async work
    // itself. `effect(async …)` would hand Angular a promise it ignores, and every signal read
    // after the first await lands outside the tracking context.
    effect(() => {
      const host = this.editorHost();
      // revert() briefly toggles showForm() off/on to clear stale Vest state, which tears down
      // #editorHost (and, with it, the OkrEditor Angular already destroyed as part of that view) —
      // drop the stale ref so the next mount recreates the component instead of staying empty.
      if (!host) {
        if (untracked(() => this.editorRef())) this.editorRef.set(undefined);
        return;
      }
      // `creating` closes the window the ref guard alone leaves open: between starting the import
      // and setting the ref, a second run would pass the guard and mount a second component.
      if (untracked(() => this.editorRef()) || this.creatingEditor || !isBrowser(this.platformId)) return;
      this.creatingEditor = true;
      void (async () => {
        try {
          const { OkrEditor } = await import('@okr/shared-ui-editor');
          const ref = host.createComponent(OkrEditor);
          ref.setInput('content', untracked(() => this.body()));
          ref.setInput('readOnly', false);
          ref.setInput('clearable', false);
          ref.setInput('copyable', false);
          ref.setInput('buttonCopyI18n', untracked(() => this.buttonCopyI18n()));
          // `content` is a model() — it doubles as the OkrEditor -> here change channel.
          ref.instance.content.subscribe((value: string) => this.onFieldChange('body', value));
          this.editorRef.set(ref);
        } finally {
          this.creatingEditor = false;
        }
      })();
    });
    effect(() => {
      const ref = this.editorRef();
      const content = this.body();
      const buttonCopyI18n = this.buttonCopyI18n();
      if (!ref) return;
      ref.setInput('content', content);
      ref.setInput('buttonCopyI18n', buttonCopyI18n);
    });
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.quoteTimer);
      this.editorRef()?.destroy();
    });
    // The price of the letters: asked when Post is ticked and again (debounced) whenever what it depends on changes.
    // Any change of the options or the draft also withdraws the consent to the price shown before.
    effect(() => {
      const wanted = this.anyPost() && this.postMode() === 'pingen' && this.pingenAvailable() && !this.letters();
      const keys = this.postKeys();
      const options = this.postOptions();
      this.subject(); this.body(); this.caleventKeys(); this.letterQrCodes();
      this.filename(); this.storagePath(); this.extraAttachments();
      untracked(() => {
        clearTimeout(this.quoteTimer);
        this.quoteRequest++;                          // a response still in flight is stale
        this.postAccepted.set(false);
        if (!wanted || keys.length === 0 || !isBrowser(this.platformId)) {
          this.postLoading.set(false);
          this.postQuote.set(undefined);
          return;
        }
        this.postLoading.set(true);
        this.quoteTimer = setTimeout(() => void this.loadQuote(keys, options), QUOTE_DEBOUNCE_MS);
      });
    });
    // The Zustellung table: asked once per opened Versand. The request runs untracked.
    effect(() => {
      const persons = this.versandRecipients();
      const groupKey = this.groupKey();
      if (!persons) return;
      untracked(() => void this.loadVersand(persons, groupKey));
    });
  }

  private async loadVersand(persons: VersandRecipient[], groupKey: string): Promise<void> {
    let channels;
    try {
      channels = await this.docEmailService.getMailingRecipients(
        this.appStore.tenantId(), persons.map((p) => p.personKey), groupKey || undefined);
    } catch (err) {
      console.error('EmailComposerModal.loadVersand: getMailingRecipients failed', err);
      this.versandFailed.set(true);
    }
    const { rows, deliveries } = buildVersandRows(persons, channels, this.activeChannels());
    this.versandRows.set(rows);
    this.initialDeliveries = deliveries;
    this.applyDeliveries(deliveries);
    this.versandLoaded.set(true);
  }

  private tenantPostOptions(): PostOptions {
    const cfg = this.appStore.appConfig();
    return {
      deliveryProduct: cfg.postDeliveryProduct ?? DEFAULT_POST_OPTIONS.deliveryProduct,
      printSpectrum: cfg.postPrintSpectrum ?? DEFAULT_POST_OPTIONS.printSpectrum,
      printMode: cfg.postPrintMode ?? DEFAULT_POST_OPTIONS.printMode,
    };
  }

  /** The Versand as the server prices it: the same content and attachments as the send, plus who gets a letter. */
  private async loadQuote(postKeys: string[], options: PostOptions): Promise<void> {
    const request = this.quoteRequest;
    try {
      const fd = this.formData();
      const quote = await this.docEmailService.quoteMailingLetters({
        tenantId: this.appStore.tenantId(),
        subject: fd.subject, body: fd.body,
        ...(this.storagePath() ? { storagePath: this.storagePath(), filename: this.filename() } : {}),
        extraAttachments: this.extraAttachments(),
        ...(this.hasEvents() ? { caleventKeys: this.chosenEvents().map((e) => e.caleventKey) } : {}),
        ...(this.showQrOption() && this.letterQrCodes() ? { letterQrCodes: true } : {}),
        postKeys, options,
      });
      if (request !== this.quoteRequest) return;
      this.postError.set(undefined);
      this.postQuote.set(quote);
    } catch (err) {
      if (request !== this.quoteRequest) return;
      this.postQuote.set(undefined);
      if (callableError(err).code === 'unavailable') {
        // the tenant's credit is not set up: only the free download is left
        this.pingenAvailable.set(false);
        this.postMode.set('download');
        this.postError.set(undefined);
      } else {
        console.error('EmailComposerModal.loadQuote: quoteMailingLetters failed', err);
        this.postError.set(this.i18n.post_error());
      }
    } finally {
      if (request === this.quoteRequest) this.postLoading.set(false);
    }
  }

  /** Asks for the price again right now (after the server refused the one the sender had accepted). */
  private requote(): void {
    const keys = this.postKeys();
    this.quoteRequest++;
    this.postAccepted.set(false);
    if (keys.length === 0) return;
    this.postLoading.set(true);
    void this.loadQuote(keys, this.postOptions());
  }

  protected onPostOptionsChange(options: PostOptions): void {
    this.isDirty.set(true);
    this.postPriceChanged.set(false);
    this.postOptions.set(options);
  }

  protected onPostModeChange(mode: PostMode): void {
    if (mode === 'pingen' && !this.pingenAvailable()) return;
    this.isDirty.set(true);
    this.postPriceChanged.set(false);
    this.postMode.set(mode);
  }

  protected onPostAcceptedChange(accepted: boolean): void {
    this.postPriceChanged.set(false);
    this.postAccepted.set(accepted);
  }

  /** The top-up screen is for administrators; the composer closes first so the sender lands on it. */
  protected async topUp(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
    await this.router.navigateByUrl('/billing');
  }

  /** The ticks decide the Bcc: set both together, so the email part never disagrees with the table. */
  private applyDeliveries(deliveries: VersandDeliveries): void {
    this.deliveries.set(deliveries);
    const bcc = versandBcc(this.versandRows(), deliveries).join(', ');
    this.formData.update((vm) => ({ ...vm, bcc }));
  }

  protected onDeliveryToggle(row: VersandRow, channel: DeliveryChannel): void {
    const next = toggleDelivery(this.deliveries(), row, channel, this.activeChannels());
    if (next === this.deliveries()) return;
    this.isDirty.set(true);
    this.applyDeliveries(next);
  }

  protected onEmailOnlyChange(emailOnly: boolean): void {
    if (emailOnly === this.emailOnly()) return;
    if (emailOnly) this.ticksBeforeEmailOnly = this.deliveries();
    this.isDirty.set(true);
    this.emailOnly.set(emailOnly);
    this.applyDeliveries(emailOnlyDeliveries(this.deliveries(), emailOnly, this.ticksBeforeEmailOnly));
  }

  protected onDashboardChange(show: boolean): void {
    if (show === this.showOnDashboard()) return;
    this.isDirty.set(true);
    this.showOnDashboard.set(show);
  }

  protected onQrCodesChange(qrCodes: boolean): void {
    if (qrCodes === this.letterQrCodes()) return;
    this.isDirty.set(true);
    this.letterQrCodes.set(qrCodes);
  }

  protected async showInfo(): Promise<void> {
    const modal = await this.modalController.create({
      component: VersandInfoModal,
      componentProps: { i18n: this.i18n },
    });
    await modal.present();
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
      // a caller-sent mail (invoice) never defaults to the club's own address: an empty `to` stays empty
      to: this.to() || (this.sendHandler() ? '' : fallback),
      from: this.fromDefault() || fallback,
      cc: this.cc(),
      // untracked: the rows land after the server answers, and a tracked read would reset the whole form
      bcc: this.isVersand() ? untracked(() => versandBcc(this.versandRows(), this.initialDeliveries)).join(', ') : this.bcc(),
      subject: this.subjectDefault() || this.initialSubject(prefix),
      body: this.bodyDefault() || '<p></p>',
      layout: 'standard',
      caleventKeys: [],
    };
  }

  /** Without an attached document there is nothing to derive a subject from — leave it empty. */
  private initialSubject(prefix: string): string {
    const filename = this.filename();
    if (filename.length === 0) return '';
    return prefix ? `${prefix} ${filename}` : filename;
  }

  /**
   * Ask the server for the rendered mail. The user may switch layout or segment while a request runs, so
   * only the latest request may write its result: an older response is dropped.
   */
  private async loadPreview(body: string, layout: EmailLayoutChoice, attachmentName: string, events: VersandEvent[]): Promise<void> {
    const request = ++this.previewRequest;
    this.previewLoading.set(true);
    this.previewFailed.set(false);
    try {
      const rendered = await this.docEmailService.renderPreview({
        body, layout, attachmentName,
        ...(events.length > 0 ? { answerEvents: events.map((e) => ({ name: e.name, when: e.when })) } : {}),
      });
      if (request !== this.previewRequest) return;
      this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(rendered.html));
    } catch (err) {
      if (request !== this.previewRequest) return;
      console.error('EmailComposerModal.loadPreview: renderEmailPreview failed', err);
      this.previewHtml.set('');
      this.previewFailed.set(true);
    } finally {
      if (request === this.previewRequest) this.previewLoading.set(false);
    }
  }

  protected onFieldChange(field: Exclude<keyof EmailComposerFormModel, 'caleventKeys'>, value: string): void {
    // pasted 'Name <a@b.ch>' / 'mailto:a@b.ch' recipients are reduced to the bare address
    if ((field === 'to' || field === 'cc' || field === 'bcc') && needsEmailNormalization(value)) {
      value = parseEmails(value).join(', ');
    }
    this.isDirty.set(true);
    this.formData.update((vm) => ({ ...vm, [field]: value }));
  }

  /** Only the offered layouts are accepted; the select can hand back nothing else, but the form is typed. */
  protected onLayoutChange(value: string): void {
    const layout = this.layoutChoices().find((choice) => choice === value);
    if (!layout || layout === this.layout()) return;
    this.isDirty.set(true);
    this.formData.update((vm) => ({ ...vm, layout }));
  }

  /** Adds typed addresses to an address field, skipping the ones it already holds. */
  protected addAddresses(field: AddressFieldKey, typed: string[]): void {
    const current = parseEmails(this.formData()[field]);
    const known = new Set(current.map((a) => a.toLowerCase()));
    const added = typed.filter((a) => !known.has(a.toLowerCase()));
    if (added.length === 0) return;
    this.onFieldChange(field, [...current, ...added].join(', '));
  }

  protected removeAddress(field: AddressFieldKey, address: string): void {
    this.onFieldChange(field, parseEmails(this.formData()[field]).filter((a) => a !== address).join(', '));
  }

  protected onEventsChange(keys: string[]): void {
    const current = this.caleventKeys();
    if (keys.length === current.length && keys.every((key, i) => key === current[i])) return;
    this.isDirty.set(true);
    this.formData.update((vm) => ({ ...vm, caleventKeys: keys }));
  }

  protected reachWarningText(warning: { eventName: string; count: number }): string {
    return fill(this.i18n.events_reach_warning(), { count: warning.count, eventName: warning.eventName });
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
    this.emailOnly.set(false);
    this.showOnDashboard.set(true);
    this.letterQrCodes.set(false);
    this.ticksBeforeEmailOnly = {};
    if (this.isVersand()) this.applyDeliveries(this.initialDeliveries);
    this.showForm.set(false);          // toggle to clear stale Vest state
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
  }

  protected async send(): Promise<void> {
    if (!this.canSend() || this.isSending()) return;
    this.isSending.set(true);
    try {
      const fd = this.formData();
      const recipients = parseEmails(fd.to);
      const request = {
        to: recipients,
        cc: parseEmails(fd.cc),
        bcc: parseEmails(fd.bcc),
        from: fd.from,
        subject: fd.subject,
        body: fd.body,
        layout: fd.layout,
        storagePath: this.storagePath(),
        filename: this.filename(),
        attachmentName: this.attachmentName(),
        extraAttachments: this.extraAttachments(),
      };
      // A Versand goes through `sendMailing`, which checks the sender and fans out by delivery type
      // server-side (spec 1.145 §10): the Bcc is resolved there, so the client's list is not sent.
      if (this.isVersand()) {
        const deliveries = versandDeliveries(this.versandRows(), this.deliveries());
        const mailingKey = await this.docEmailService.sendMailing({
          tenantId: this.appStore.tenantId(),
          ...(this.groupKey() ? { groupKey: this.groupKey() } : {}),
          to: request.to, from: request.from,
          // with events every person gets their own mail: no Cc, the address in «An» is the reply address
          cc: this.hasEvents() ? [] : request.cc,
          subject: request.subject, body: request.body, layout: request.layout,
          ...(request.storagePath ? { storagePath: request.storagePath, filename: request.filename } : {}),
          extraAttachments: request.extraAttachments,
          deliveries,
          ...(this.hasEvents() ? { caleventKeys: this.chosenEvents().map((e) => e.caleventKey) } : {}),
          ...(this.emailOnly() && this.showOnDashboard() ? { dashboard: true } : {}),
          ...(this.showQrOption() && this.letterQrCodes() ? { letterQrCodes: true } : {}),
          ...this.postPayload(),
        });
        await this.showParamToast(EMAIL_COMPOSER_MSG_KEYS.send_mailing, {
          emails: deliveries.filter((d) => d.channels.includes(DeliveryChannel.Email)).length,
          notices: deliveries.filter((d) => d.channels.includes(DeliveryChannel.Chat)).length,
        });
        // With Post the modal stays open: the letters are built on the server and downloaded here.
        if (deliveries.some((d) => d.channels.includes(DeliveryChannel.Post))) {
          this.letters.set({ state: 'pending' });
          void this.awaitLetters(mailingKey);
          return;
        }
        await dismissOverlay(this.modalController, { sent: true }, 'confirm');
        return;
      }
      const handler = this.sendHandler();
      // A bulk send (bcc list) runs server-side: the job survives closing this modal. A single
      // mail goes straight through the callable so the provider error surfaces immediately.
      if (handler) {
        const { to, cc, bcc, from, subject, body, layout, extraAttachments } = request;
        await handler({ to, cc, bcc, from, subject, body, layout, attachmentName: request.attachmentName, extraAttachments });
      } else if (request.bcc.length > 0) {
        await this.awaitJob(await this.docEmailService.queueBulkEmail(request));
      } else {
        await this.docEmailService.sendDocumentByEmail(request);
      }

      await this.showParamToast(EMAIL_COMPOSER_MSG_KEYS.send_conf, { recipients: recipients.join(', ') });
      await dismissOverlay(this.modalController, { sent: true }, 'confirm');
    } catch (err) {
      if (this.handlePostRefusal(err)) {
        this.isSending.set(false);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      // A bulk send aborts on the first failing block — say how far it got, never claim success.
      const sent = this.progress();
      await this.showParamToast(EMAIL_COMPOSER_MSG_KEYS.send_error,
        { error: sent ? `${message} (${sent})` : message }, 'danger');
      this.isSending.set(false);
    }
  }

  /** «Per Pingen senden»: the options and the signed quote the sender accepted. Without Pingen the letters are only built for download. */
  private postPayload(): Pick<SendMailingRequest, 'post'> {
    const quote = this.postQuote();
    if (!this.anyPost() || this.postMode() !== 'pingen' || !quote) return {};
    return { post: { via: 'pingen', options: this.postOptions(), token: quote.token, issuedAt: quote.issuedAt } };
  }

  /**
   * The server's refusals that only ask the sender to look at the price again. True = handled here (no error toast).
   * `price-changed`: quote again, consent withdrawn. `insufficient-credit`: the balance moved, quote again.
   * `unavailable`: only the download is left.
   */
  private handlePostRefusal(err: unknown): boolean {
    const { code, message } = callableError(err);
    if (code === 'failed-precondition' && message === 'price-changed') {
      this.postPriceChanged.set(true);
      this.requote();
      return true;
    }
    if (code === 'failed-precondition' && message === 'insufficient-credit') {
      this.requote();
      return true;
    }
    if (code === 'unavailable' && this.postMode() === 'pingen' && this.anyPost()) {
      this.pingenAvailable.set(false);
      this.postMode.set('download');
      return true;
    }
    return false;
  }

  /**
   * Asks for the letters every 3 s until they are no longer pending (at most ~9 minutes, the trigger's
   * own limit). Closing the modal stops the asking; the letters stay on the server for 7 days.
   */
  private async awaitLetters(mailingKey: string): Promise<void> {
    for (let attempt = 0; attempt < 180; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (this.destroyed) return;
      try {
        const letters = await this.docEmailService.getMailingLetters(mailingKey);
        if (letters.state !== 'pending' && letters.state !== 'none') {
          this.letters.set(letters);
          return;
        }
      } catch (err) {
        console.error('EmailComposerModal.awaitLetters: getMailingLetters failed', err);
        this.letters.set({ state: 'failed' });
        return;
      }
    }
    this.letters.set({ state: 'failed' });
  }

  /** The URL is fetched before the click, so the browser opens it without a popup block. */
  protected downloadLetters(letters: MailingLetters): void {
    if (letters.url) window.open(letters.url, '_blank', 'noopener');
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
