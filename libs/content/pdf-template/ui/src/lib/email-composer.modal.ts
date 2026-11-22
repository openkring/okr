// libs/content/pdf-template/ui/src/lib/email-composer.modal.ts
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, linkedSignal, PLATFORM_ID, signal, untracked } from '@angular/core';
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
  AlertController, ModalController, ToastController,
} from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import {
  ChangeConfirmation, ChangeConfirmationI18n, Checkbox, CheckboxI18n,
  EmailInput, EmailInputI18n, ErrorNote, Header, Spinner, TextareaInputI18n, TextInput, TextInputI18n,
} from '@okr/shared-ui';
import { RichTextInput } from '@okr/shared-ui-editor';
import { DEFAULT_POST_OPTIONS, DeliveryChannel, EmailLayoutChoice, LAYOUT_CHOICES, PostOptions } from '@okr/shared-models';
import { fill, hasRole, householdRecipientKey, MailingHousehold, needsEmailNormalization } from '@okr/shared-util-core';
import { dismissOverlay, isBrowser, validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';
import {
  ACTIVE_MAILING_CHANNELS, applyHouseholds, buildVersandRows, EMAIL_ONLY_MAILING_CHANNELS, emailBodyHasContent, emailLayoutOptions, emailOnlyDeliveries,
  GROUP_ADMIN_MAILING_CHANNELS, groupReachWarnings, hasPostDelivery, isSenderDomainAllowed,
  nonPdfAttachmentNames, parseEmails, sharedEmailCount, untickEmailAddress, withLinksInNewTab, toggleDelivery, versandBcc, versandDeliveries,
  EmailComposerFormModel, emailComposerValidations, VersandDeliveries, VersandEvent, VersandRow,
  EMAIL_COMPOSER_I18N_KEYS, EMAIL_COMPOSER_MSG_KEYS, EmailComposerI18n,
} from '@okr/content-pdf-template-util';
import { DocEmailService, InlineAttachment, MailingLetters, PostQuote, SendMailingRequest, TemplateService } from '@okr/content-pdf-template-data-access';

import { EmailLayoutPicker } from './email-layout-picker';
import { VersandAddressList } from './versand-address-list';
import { VersandDeliveryTable } from './versand-delivery-table';
import { VersandEventsSelect } from './versand-events-select';
import { PostMode, PostversandStep } from './postversand-step';
import { VersandInfoModal } from './versand-info.modal';
import { APP_STORE_MIN } from '@okr/shared-data-access';
import { MailPageService } from '@okr/content-pdf-template-data-access';
import { MailPageDraft } from './mail-page-draft';
import { MailPageEditor } from './mail-page-editor';

/** Debounce of the price request while the sender changes options or the draft. */
const QUOTE_DEBOUNCE_MS = 400;

/** The message and code a callable error carries: Firebase prefixes the code with `functions/`. */
function callableError(err: unknown): { code: string; message: string } {
  const e = err as { code?: unknown; message?: unknown } | undefined;
  const code = typeof e?.code === 'string' ? e.code.replace(/^functions\//, '') : '';
  return { code, message: typeof e?.message === 'string' ? e.message : String(err) };
}

/** Above this many recipients the sender confirms the counts before anything goes out. */
const CONFIRM_ABOVE = 10;

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
type ComposerSegment = 'editor' | 'preview' | 'delivery' | 'post' | 'list';

type AddressFieldKey = 'to' | 'cc' | 'bcc';

/** One accordion of the Verteiler: a recipient field shown one address per line. */
interface AddressField {
  key: AddressFieldKey;
  /** The mail header name, deliberately untranslated. */
  label: string;
  addresses: string[];
  editable: boolean;
  /** A Versand's Bcc cannot be typed into, but an address can be removed: that unticks E-Mail in the Zustellung. */
  removable: boolean;
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
    Header, Spinner, RichTextInput, ChangeConfirmation, Checkbox, EmailInput, ErrorNote, TextInput,
    VersandDeliveryTable, VersandEventsSelect, PostversandStep,
    IonContent, IonButton,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonIcon, IonChip, IonLabel, IonNote,
    IonSegment, IonSegmentButton, IonItem, IonAccordionGroup, IonAccordion,
    VersandAddressList, EmailLayoutPicker, MailPageEditor,
  ],
  // the Versand's draft page, shared with the page editor (which is destroyed whenever the Editor segment closes)
  providers: [MailPageDraft],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .segment { padding: 8px 12px 0; }
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
    /* the same height whether the preview is empty, loading or shown: the segment does not jump */
    .preview-card { min-height: 420px; }
  `],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true"
      [actionIcon]="isVersand() ? 'info-circle' : ''" [actionTitle]="i18n.info_action()" (actionClicked)="showInfo()" />

    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="send()" (cancelClicked)="revert()" />
    }
    @if (showSendHints()) {
      @if (isVersand() && draft.loaded() && !draft.hasContent()) {
        <div class="reach-warnings" role="status">
          <div class="reach-warning">
            <ion-icon src="{{ 'warning' | svgIcon }}" />
            <span>{{ i18n.page_no_content() }}</span>
          </div>
        </div>
      }
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
            @if (anyPost()) {
              <ion-segment-button value="post"><ion-label>{{ i18n.segment_post() }}</ion-label></ion-segment-button>
            }
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
                        [autofocus]="!focusPage()" [maxLength]="subjectLength" [readOnly]="false" />
                      <okr-error-note [errors]="subjectErrors()" />
                    </ion-col>
                  </ion-row>
                  <ion-row>
                    <ion-col size="12">
                      <okr-email-layout-picker [label]="i18n.layout_label()" [choices]="layoutChoices()" [labels]="layoutLabels()"
                        [thumbnails]="layoutThumbnails()" [selected]="layout()" (selectedChange)="onLayoutChange($event)" />
                    </ion-col>
                  </ion-row>
                  <!-- Versand (spec 1.171 §7.2): the web version switch, then the mail as a page of sections -->
                  @if (isVersand()) {
                    <ion-row>
                      <ion-col size="12">
                        <okr-checkbox [i18n]="webVersionI18n()" [checked]="webVersion()" (checkedChange)="onWebVersionChange($event)"
                          [toggle]="true" [readOnly]="false" />
                        <ion-note class="note">{{ i18n.web_version_helper() }}</ion-note>
                      </ion-col>
                    </ion-row>
                    <ion-row>
                      <ion-col size="12">
                        <okr-mail-page-editor [i18n]="i18n" [autofocus]="focusPage()" />
                      </ion-col>
                    </ion-row>
                  }
                  @if (showEvents()) {
                    <ion-row>
                      <ion-col size="12">
                        <okr-versand-events-select [events]="versandEvents()" [label]="i18n.events_label()"
                          [placeholder]="i18n.events_placeholder()" [removeLabel]="i18n.events_remove()"
                          [selected]="caleventKeys()" (selectedChange)="onEventsChange($event)" />
                      </ion-col>
                    </ion-row>
                  }
                  @if (!isVersand()) {
                    <ion-row>
                      <ion-col size="12">
                        <okr-rich-text-input [i18n]="bodyI18n" [value]="body()" (valueChange)="onFieldChange('body', $event)"
                          [readOnly]="false" [copyable]="true" [errors]="bodyErrors()" />
                      </ion-col>
                    </ion-row>
                  }
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
              <ion-card-content class="ion-no-padding preview-card">
                @if (!hasContent()) {
                  <ion-note class="note">{{ i18n.preview_empty() }}</ion-note>
                } @else if (previewLoading()) {
                  <okr-spinner />
                } @else if (previewFailed()) {
                  <ion-note color="danger" class="note">{{ i18n.preview_error() }}</ion-note>
                } @else {
                  <!-- no scripts; links open in a new tab (allow-popups) outside the sandbox, so they can be tried out -->
                  <iframe class="preview-frame" [title]="i18n.preview_frame()" sandbox="allow-popups allow-popups-to-escape-sandbox" [srcdoc]="previewHtml()"></iframe>
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
                  @if (hasHouseholds() && hasEvents()) {
                    <ion-note class="note">{{ i18n.delivery_households_answers() }}</ion-note>
                  }
                  <okr-versand-delivery-table [rows]="versandRows()" [deliveries]="deliveries()" [i18n]="i18n"
                    [active]="activeChannels()" (toggled)="onDeliveryToggle($event.row, $event.channel)" (split)="onSplitHousehold($event)" />
                  @if (postSkipped().length > 0) {
                    <ion-note color="warning" class="note">{{ i18n.post_skipped() }} {{ postSkipped().join(', ') }}</ion-note>
                  }
                  @if (newsletterPostLocked()) {
                    <ion-note class="note">{{ i18n.post_newsletter_locked() }}</ion-note>
                  }
                }
              </ion-card-content>
            </ion-card>
          }

          <!-- Postversand (Versand with at least one letter): Pingen or PDF, delivery, print, sides, price and consent. -->
          @if (activeSegment() === 'post' && anyPost()) {
            <okr-postversand-step [i18n]="i18n" [quote]="postQuote()" [loading]="postLoading()" [error]="postError()"
              [options]="postOptions()" (optionsChange)="onPostOptionsChange($event)"
              [mode]="postMode()" (modeChange)="onPostModeChange($event)"
              [accepted]="postAccepted()" (acceptedChange)="onPostAcceptedChange($event)"
              [canTopUp]="canTopUp()" [canSaveDefaults]="canTopUp()" (saveDefaults)="saveDefaults($event)"
              [pingenAvailable]="pingenAvailable()" [needsSubject]="postNeedsSubject()" (topUp)="topUp()" />
            @if (postPriceChanged()) {
              <ion-note color="warning" class="note">{{ i18n.post_price_changed() }}</ion-note>
            }
          }

          <!-- Verteiler: sender and addresses of the email part. -->
          @if (activeSegment() === 'list') {
            <ion-card>
              <ion-card-content class="ion-no-padding">
                @if (isVersand()) {
                  <ion-note class="note">{{ i18n.list_email_only() }}</ion-note>
                }
                @if (personalMails()) {
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
                          @if (sharedEmails() > 0) {
                            <ion-note class="note">{{ sharedEmailsNote() }}</ion-note>
                          }
                        }
                        <okr-versand-address-list [addresses]="field.addresses" [editable]="field.editable" [removable]="field.removable"
                          [label]="field.label" [placeholder]="field.placeholder"
                          [addLabel]="field.label" [removeLabel]="i18n.list_remove()" [copyLabel]="i18n.list_copy()"
                          (added)="addAddresses(field.key, $event)" (removed)="removeAddress(field.key, $event)"
                          (copied)="showToast(i18n.copy_conf(), 'success')" />
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
  private readonly appStore = inject(APP_STORE_MIN);
  private readonly docEmailService = inject(DocEmailService);
  private readonly templateService = inject(TemplateService);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly alertController = inject(AlertController);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly i18nService = inject(I18nService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mailPageService = inject(MailPageService);
  /** A Versand's content: the draft page `mailPages/{pk}` (spec 1.171), created when the composer opens. */
  protected readonly draft = inject(MailPageDraft);
  protected readonly i18n = this.i18nService.translateAll(EMAIL_COMPOSER_I18N_KEYS) as EmailComposerI18n;

  /** the body has no label of its own; the subject above introduces it */
  protected readonly bodyI18n: TextareaInputI18n = { name: 'body', label: '', placeholder: '' };
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
  /**
   * `groupKey` names a newsletter (spec 1.169 §5.6): the recipients are its subscribers. A member admin or
   * privileged user keeps Post; the newsletter's own admins get the group-admin channels, like a group admin.
   */
  public readonly newsletter     = input<boolean>(false);
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
  /**
   * Every recipient gets their own mail: with chosen events (answer link) and on every newsletter send (unsubscribe
   * link). There is no Cc then, and the address in «An» is the reply address; the server refuses a Cc on a newsletter.
   */
  protected readonly personalMails = computed(() => this.hasEvents() || this.newsletter());

  // an attachment gives the mail content without a body, and personal mails hide the Cc: validateVestTree cannot pass either to the suite
  // A Versand's content is its page, not the body: the body rule must not block it (canSend asks the page instead).
  private readonly suiteWithContext = (model: EmailComposerFormModel) =>
    emailComposerValidations(model, this.attachmentName().length > 0 || this.isVersand(), this.personalMails());
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
  private initialRows: VersandRow[] = [];
  /** The rows and ticks per person, before households are combined (spec 1.168 §6.1). */
  private baseRows: VersandRow[] = [];
  private baseDeliveries: VersandDeliveries = {};
  /** The households touching this Versand, as the server answered. */
  private households: MailingHousehold[] = [];
  /** The households the sender split for this Versand («einzeln zustellen»): delivered per member. */
  protected readonly split = signal<ReadonlySet<string>>(new Set());
  /** Whether any household touches this Versand (for the «own letter with events» hint). */
  protected readonly hasHouseholds = signal(false);
  /**
   * Whether the rows were last combined for a Versand with answers (events): then no household is combined, every
   * member answers for themself (ruling 15). `initialAnswers` is the state of the rows loaded first.
   */
  private appliedAnswers = false;
  private initialAnswers = false;
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
    if (!this.groupKey()) return ACTIVE_MAILING_CHANNELS;
    return this.newsletter() && this.mayPostNewsletter() ? ACTIVE_MAILING_CHANNELS : GROUP_ADMIN_MAILING_CHANNELS;
  });
  /** The server's elevated roles: they may send a newsletter by post (`newsletterSendCheck`). */
  private readonly mayPostNewsletter = computed(() =>
    hasRole('memberAdmin', this.appStore.currentUser()) || hasRole('privileged', this.appStore.currentUser()));
  /** A newsletter admin's Versand: the Post column stays locked, and a note says why. */
  protected readonly newsletterPostLocked = computed(() => this.newsletter() && !this.mayPostNewsletter() && !this.emailOnly());
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
  /** False once the server says Pingen is not available here (no credit set up, or no right to post): only the PDF download is left. */
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
  /** The Senden toolbar appears once something changed and the mail can go out (canSend). */
  protected readonly showConfirmation = computed(() => this.showSendHints() && this.canSend());
  /** After the first change the reach and post hints explain how (or why not yet) the mail is sent. */
  protected readonly showSendHints = computed(() => this.isDirty() && !this.isSending() && !this.letters());
  /** A valid form; a Versand also needs its Zustellung loaded and at least one ticked recipient. */
  protected readonly canSend = computed(() =>
    this.composerForm().valid()
    && (!this.isVersand() || (this.versandLoaded() && versandDeliveries(this.versandRows(), this.deliveries()).length > 0 && this.draft.hasContent()))
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
  /** The server refuses to price letters without a subject (it is printed in them): no request until there is one. */
  protected readonly postNeedsSubject = computed(() => this.subject().trim().length === 0);
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
   * Miniatures of the layouts for the Vorlage cards: each rendered once per opened composer, with a sample
   * text (not the draft, so they do not re-render while typing). Missing = still loading, '' = failed.
   */
  protected readonly layoutThumbnails = signal<Record<string, SafeHtml | ''>>({});
  private readonly thumbnailsRequested = new Set<string>();

  /**
   * The Verteiler accordions: To, CC (hidden for personal mails: events or a newsletter) and BCC,
   * each address on its own line. A Versand derives the BCC from the Zustellung, so it is read-only there.
   */
  protected readonly addressFields = computed<AddressField[]>(() => {
    const fd = this.formData();
    const fields: AddressField[] = [
      { key: 'to', label: 'To:', addresses: parseEmails(fd.to), editable: true, removable: true, placeholder: this.i18n.to_placeholder(), errors: this.toErrors() },
    ];
    if (!this.personalMails()) {
      fields.push({ key: 'cc', label: 'Cc:', addresses: parseEmails(fd.cc), editable: true, removable: true, placeholder: this.i18n.to_placeholder(), errors: this.ccErrors() });
    }
    fields.push({ key: 'bcc', label: 'Bcc:', addresses: parseEmails(fd.bcc), editable: !this.isVersand(), removable: true, placeholder: this.i18n.to_placeholder(), errors: this.bccErrors() });
    return fields;
  });
  /** E-Mail ticks whose address another ticked person already has: the E-Mail column counts them, the Bcc not. */
  protected readonly sharedEmails = computed(() => sharedEmailCount(this.versandRows(), this.deliveries()));
  protected readonly sharedEmailsNote = computed(() => fill(this.i18n.list_shared(), { count: this.sharedEmails() }));
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
    this.attachmentName().length > 0
    || (this.isVersand() ? this.draft.hasContent() : emailBodyHasContent(this.formData().body ?? '')));

  /**
   * The page's content as one value: a change of any section changes it, a stored copy of what was typed does not
   * (the overlay and the stored version compare equal), so the preview and the price are not asked for twice.
   */
  private readonly pageVersion = computed(() => JSON.stringify(this.draft.sections()));
  /** `pageVersion` when the draft was loaded: a later difference means the sender changed the page. */
  private pageBaseline: string | undefined;
  /** Resolves once the draft page exists (or failed); a dismiss waits for it before discarding the draft. */
  private draftReady: Promise<void> | undefined;
  /** «Zurücksetzen» is replacing the draft: the old page vanishing is not a change of the sender's. */
  private draftResetting = false;
  /** Set as soon as `sendMailing` accepted the Versand: the page is then the mailing's and must stay. */
  private sent = false;
  /** A Versand send under way (flush + `sendMailing`); settles, never rejects, and marks `sent` on success. */
  private sendInFlight: Promise<void> | undefined;

  /**
   * Where the cursor starts (spec 1.171 §7.2, R13): a mail needs a subject first, so an empty subject keeps the
   * focus; with a prefilled subject a Versand starts in the text of its first article.
   */
  protected readonly focusPage = computed(() => this.isVersand() && this.subjectDefault().trim().length > 0);

  /** «Webversion anbieten» (spec 1.171 R4): on for a newsletter, else off, until the sender switches it. */
  private readonly webVersionChoice = signal<boolean | undefined>(undefined);
  private readonly groupIsNewsletter = computed(() => {
    if (this.newsletter()) return true;
    const groupKey = this.groupKey();
    return !!groupKey && this.appStore.allGroupsAndChats().some((g) => g.okey === groupKey && g.kind === 'newsletter');
  });
  protected readonly webVersion = computed(() => this.webVersionChoice() ?? this.groupIsNewsletter());

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
  protected readonly subjectI18n = computed(() => ({
    name: 'subject', label: this.i18n.subject_label(), placeholder: '', helper: '',
  } as TextInputI18n));
  protected readonly emailOnlyI18n = computed(() => ({
    name: 'emailOnly', label: this.i18n.delivery_email_only(), helper: '',
  } as CheckboxI18n));
  protected readonly dashboardI18n = computed(() => ({
    name: 'showOnDashboard', label: this.i18n.delivery_dashboard(), helper: '',
  } as CheckboxI18n));
  protected readonly webVersionI18n = computed(() => ({
    // the helper is shown below the switch at all times (not only with «Hilfetexte anzeigen»): it says who can read it
    name: 'webVersion', label: this.i18n.web_version_label(), helper: '',
  } as CheckboxI18n));
  protected readonly qrCodesI18n = computed(() => ({
    name: 'letterQrCodes', label: this.i18n.delivery_qr_codes(), helper: '',
  } as CheckboxI18n));
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.revert(), save: this.i18n.send(),
  } as ChangeConfirmationI18n));

  constructor() {
    // The Postversand segment exists only while someone gets a letter: once the last one is unticked, go back to Zustellung.
    effect(() => {
      if (this.activeSegment() === 'post' && !this.anyPost()) this.activeSegment.set('delivery');
    });
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
      this.pageVersion();
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
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.quoteTimer);
      // Closed without sending (close icon, back button, swipe, «Guthaben aufladen»): the draft page goes too.
      // A sent page belongs to its mailing (the rules forbid deleting it). The draft may still be being created.
      // A send under way is awaited first (the header close stays active while sending): only a page that ended
      // unsent is discarded, so a sent mail never loses its page and a failed one leaves no draft behind.
      if (this.isVersand() && !this.sent) {
        void (this.draftReady ?? Promise.resolve()).then(() => this.sendInFlight)
          .then(() => this.sent ? undefined : this.draft.discard())
          .catch((err) => console.warn('EmailComposerModal: could not discard the draft page', err));
      }
    });
    // A Versand composes a page (spec 1.171): its draft is created once, with the prefilled body as its first article.
    effect(() => {
      if (!this.isVersand() || this.draftReady) return;
      untracked(() => { this.draftReady = this.createDraft(); });
    });
    // Any change of the page makes the composer dirty, like a change of the body (the send bar appears).
    effect(() => {
      const version = this.pageVersion();
      if (!this.draft.loaded()) return;
      untracked(() => {
        if (this.draftResetting) return;
        if (this.pageBaseline === undefined) this.pageBaseline = version;
        else if (version !== this.pageBaseline) this.isDirty.set(true);
      });
    });
    // The price of the letters: asked when Post is ticked and again (debounced) whenever what it depends on changes.
    // Any change of the options or the draft also withdraws the consent to the price shown before.
    effect(() => {
      const wanted = this.anyPost() && this.postMode() === 'pingen' && this.pingenAvailable() && !this.letters();
      const keys = this.postKeys();
      const options = this.postOptions();
      const needsSubject = this.postNeedsSubject();
      this.subject(); this.body(); this.pageVersion(); this.caleventKeys(); this.letterQrCodes();
      this.filename(); this.storagePath(); this.extraAttachments();
      untracked(() => {
        clearTimeout(this.quoteTimer);
        this.quoteRequest++;                          // a response still in flight is stale
        this.postAccepted.set(false);
        if (!wanted || needsSubject || keys.length === 0 || !isBrowser(this.platformId)) {
          this.postLoading.set(false);
          this.postQuote.set(undefined);
          return;
        }
        this.postLoading.set(true);
        this.quoteTimer = setTimeout(() => void this.loadQuote(keys, options), QUOTE_DEBOUNCE_MS);
      });
    });
    // The Vorlage thumbnails: every layout once, as soon as it is offered (tenant layouts arrive later).
    effect(() => {
      const choices = this.layoutChoices();
      const sample = this.i18n.layout_sample();
      if (sample.length === 0) return;
      untracked(() => {
        if (!isBrowser(this.platformId)) return;
        for (const layout of choices) {
          if (this.thumbnailsRequested.has(layout)) continue;
          this.thumbnailsRequested.add(layout);
          void this.loadThumbnail(layout, sample);
        }
      });
    });
    // Events with answer links: households are not combined (each member answers for themself, ruling 15).
    effect(() => {
      const hasAnswers = this.hasEvents();
      untracked(() => {
        if (this.versandLoaded() && hasAnswers !== this.appliedAnswers) this.reapplyHouseholds(hasAnswers);
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
    let households: MailingHousehold[] = [];
    try {
      ({ recipients: channels, households } = await this.docEmailService.getMailingRecipients(
        this.appStore.tenantId(), persons.map((p) => p.personKey), groupKey || undefined));
    } catch (err) {
      console.error('EmailComposerModal.loadVersand: getMailingRecipients failed', err);
      this.versandFailed.set(true);
    }
    const base = buildVersandRows(persons, channels, this.activeChannels());
    this.baseRows = base.rows;
    this.baseDeliveries = base.deliveries;
    // a newsletter send is never combined per household (spec 1.169 §6.4): every subscriber gets their own mail
    this.households = this.newsletter() ? [] : households;
    this.hasHouseholds.set(this.households.length > 0);
    this.appliedAnswers = this.initialAnswers = this.hasEvents();
    const { rows, deliveries } = applyHouseholds(base.rows, base.deliveries, households, this.split(), { hasAnswers: this.appliedAnswers, newsletter: this.newsletter() });
    this.versandRows.set(rows);
    this.initialRows = rows;
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
      // the server prices the page as stored: the last typed characters first, and none may be missing
      if (this.isVersand() && !(await this.draft.flush())) {
        if (request !== this.quoteRequest) return;
        this.postQuote.set(undefined);
        this.postError.set(this.i18n.page_save_error());
        await this.showToast(this.i18n.page_save_error(), 'danger');
        return;
      }
      if (request !== this.quoteRequest) return;
      const fd = this.formData();
      const quote = await this.docEmailService.quoteMailingLetters({
        tenantId: this.appStore.tenantId(),
        // a newsletter's letters end with the unsubscribe block: the server counts its pages only with the group
        ...(this.groupKey() ? { groupKey: this.groupKey() } : {}),
        subject: fd.subject,
        ...(this.isVersand() ? { pageKey: this.draft.pageKey() } : { body: fd.body }),
        ...(this.storagePath() ? { storagePath: this.storagePath(), filename: this.filename() } : {}),
        extraAttachments: this.extraAttachments(),
        ...(this.hasEvents() ? { caleventKeys: this.chosenEvents().map((e) => e.caleventKey) } : {}),
        ...(this.showQrOption() && this.letterQrCodes() ? { letterQrCodes: true } : {}),
        postKeys, options,
      });
      if (request !== this.quoteRequest) return;
      this.postError.set(undefined);
      if (!quote.pingenAvailable) {
        // spec 1.150 §10: no prepaid credit for the tenant, or the sender may not send by post: only the download
        this.postQuote.set(undefined);
        this.pingenAvailable.set(false);
        this.postMode.set('download');
        return;
      }
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
    if (keys.length === 0 || this.postNeedsSubject()) return;
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

  /** «Als Vorgabe speichern» (administrators only; the server checks it again). */
  protected async saveDefaults(options: PostOptions): Promise<void> {
    try {
      await this.docEmailService.setPostDefaults(this.appStore.tenantId(), options);
      await this.showToast(this.i18n.post_defaults_saved(), 'success');
    } catch (e) {
      console.warn('EmailComposerModal: could not save the post defaults', e);
      await this.showToast(this.i18n.post_defaults_failed(), 'danger');
    }
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

  /**
   * «einzeln zustellen» (spec 1.168 §6.2): the household row goes, its members get their own ticks back; every
   * other row keeps the ticks the sender set. The household itself stays as it is.
   */
  protected onSplitHousehold(householdKey: string): void {
    if (this.split().has(householdKey)) return;
    const split = new Set(this.split()).add(householdKey);
    this.split.set(split);
    const household = this.households.find((h) => h.okey === householdKey);
    const members = new Set(household?.memberKeys ?? []);
    const { rows, deliveries } = applyHouseholds(this.baseRows, this.baseDeliveries, this.households, split, { hasAnswers: this.appliedAnswers, newsletter: this.newsletter() });
    const current = this.deliveries();
    let next: VersandDeliveries = {};
    for (const row of rows) {
      const key = row.personKey;
      next[key] = members.has(key) || !(key in current) ? deliveries[key] ?? [] : current[key];
    }
    if (this.emailOnly()) {
      next = emailOnlyDeliveries(next, true);
      // the ticks that come back when «Versand nur via E-Mail» is switched off: per member, no household row
      const before: VersandDeliveries = { ...this.ticksBeforeEmailOnly };
      delete before[householdRecipientKey(householdKey)];
      for (const key of members) if (key in deliveries) before[key] = deliveries[key];
      this.ticksBeforeEmailOnly = before;
    }
    this.isDirty.set(true);
    this.versandRows.set(rows);
    this.applyDeliveries(next);
  }

  /**
   * Events chosen or removed: the households are combined again (no events) or taken apart (events). The rows and
   * ticks of household members and household rows come from the server's answer again; every other row keeps the
   * ticks the sender set.
   */
  private reapplyHouseholds(hasAnswers: boolean): void {
    this.appliedAnswers = hasAnswers;
    if (this.households.length === 0) return;
    const { rows, deliveries } = applyHouseholds(this.baseRows, this.baseDeliveries, this.households, this.split(), { hasAnswers, newsletter: this.newsletter() });
    const touched = new Set(this.households.flatMap((h) => [...h.memberKeys, householdRecipientKey(h.okey)]));
    const current = this.deliveries();
    let next: VersandDeliveries = {};
    for (const row of rows) {
      const key = row.personKey;
      next[key] = touched.has(key) || !(key in current) ? deliveries[key] ?? [] : current[key];
    }
    if (this.emailOnly()) {
      next = emailOnlyDeliveries(next, true);
      const before: VersandDeliveries = { ...this.ticksBeforeEmailOnly };
      for (const key of touched) delete before[key];
      for (const key of touched) if (key in deliveries) before[key] = deliveries[key];
      this.ticksBeforeEmailOnly = before;
    }
    this.versandRows.set(rows);
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

  private async loadThumbnail(layout: EmailLayoutChoice, sample: string): Promise<void> {
    let html: SafeHtml | '' = '';
    try {
      const rendered = await this.docEmailService.renderPreview({ body: `<p>${sample}</p>`.repeat(3), layout, attachmentName: '' });
      html = this.sanitizer.bypassSecurityTrustHtml(rendered.html);
    } catch (err) {
      console.warn(`EmailComposerModal.loadThumbnail(${layout}) failed`, err);
    }
    if (!this.destroyed) this.layoutThumbnails.update((map) => ({ ...map, [layout]: html }));
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
      // a Versand's page is rendered from Firestore: the last typed characters first, and none may be missing
      if (this.isVersand() && !(await this.draft.flush())) {
        if (request !== this.previewRequest) return;
        this.previewHtml.set('');
        this.previewFailed.set(true);
        await this.showToast(this.i18n.page_save_error(), 'danger');
        return;
      }
      if (request !== this.previewRequest) return;
      const rendered = await this.docEmailService.renderPreview({
        ...(this.isVersand() ? { pageKey: this.draft.pageKey() } : { body }), layout, attachmentName,
        ...(events.length > 0 ? { answerEvents: events.map((e) => ({ name: e.name, when: e.when })) } : {}),
      });
      if (request !== this.previewRequest) return;
      this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(withLinksInNewTab(rendered.html)));
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
    // a Versand's Bcc follows the Zustellung: untick E-Mail there (for everybody with that address), the Bcc follows
    if (field === 'bcc' && this.isVersand()) {
      const next = untickEmailAddress(this.versandRows(), this.deliveries(), address);
      if (next === this.deliveries()) return;
      this.isDirty.set(true);
      this.applyDeliveries(next);
      return;
    }
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

  protected onWebVersionChange(on: boolean): void {
    if (on === this.webVersion()) return;
    this.isDirty.set(true);
    this.webVersionChoice.set(on);
  }

  /** Creates the draft page with the prefilled body (if any) as its first article; a failure is shown in the editor. */
  private async createDraft(): Promise<void> {
    if (!isBrowser(this.platformId) || this.destroyed) return;
    const uid = this.appStore.fbUser()?.uid ?? '';
    try {
      const { pageKey } = await this.mailPageService.createDraft(
        this.appStore.tenantId(), uid, this.groupKey() || undefined, this.bodyDefault() || undefined);
      this.pageBaseline = undefined;       // the first version of the new draft is its baseline
      this.draft.start(pageKey);
      this.draft.createFailed.set(false);
    } catch (err) {
      console.error('EmailComposerModal.createDraft: creating the draft page failed', err);
      this.draft.createFailed.set(true);
    } finally {
      this.draftResetting = false;
    }
  }

  protected revert(): void {
    this.isDirty.set(false);
    this.extraAttachments.set([]);
    this.formData.set(this.buildInitial());
    this.emailOnly.set(false);
    this.showOnDashboard.set(true);
    this.letterQrCodes.set(false);
    this.ticksBeforeEmailOnly = {};
    if (this.isVersand()) {
      this.webVersionChoice.set(undefined);
      this.draftResetting = true;
      // the page starts over too: a fresh draft with the prefilled body, the changed one is thrown away
      this.draftReady = (this.draftReady ?? Promise.resolve()).then(() => this.draft.discard()).catch((err) =>
        console.warn('EmailComposerModal: could not discard the draft page', err)).then(() => this.createDraft());
      this.split.set(new Set());
      this.versandRows.set(this.initialRows);
      this.applyDeliveries(this.initialDeliveries);
      this.appliedAnswers = this.initialAnswers;
      if (this.hasEvents() !== this.initialAnswers) this.reapplyHouseholds(this.hasEvents());
    }
    this.showForm.set(false);          // toggle to clear stale Vest state
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
  }

  /**
   * The recipients per delivery type: a Versand counts persons per ticked type (the E-Mail line also says how
   * many distinct addresses that is), a plain mail its To, Cc and Bcc addresses.
   */
  private recipientSummary(): { total: number; lines: string[] } {
    if (!this.isVersand()) {
      const fd = this.formData();
      const total = parseEmails(fd.to).length + parseEmails(fd.cc).length + parseEmails(fd.bcc).length;
      return { total, lines: [`${this.i18n.delivery_email()}: ${total}`] };
    }
    const deliveries = versandDeliveries(this.versandRows(), this.deliveries());
    const count = (channel: DeliveryChannel) => deliveries.filter((d) => d.channels.includes(channel)).length;
    const lines: string[] = [];
    const emails = count(DeliveryChannel.Email);
    if (emails > 0) {
      const addresses = versandBcc(this.versandRows(), this.deliveries()).length;
      lines.push(`${this.i18n.delivery_email()}: ${emails}` + (addresses !== emails ? ` (${fill(this.i18n.confirm_addresses(), { count: addresses })})` : ''));
    }
    if (count(DeliveryChannel.Chat) > 0) lines.push(`${this.i18n.delivery_chat()}: ${count(DeliveryChannel.Chat)}`);
    if (count(DeliveryChannel.Post) > 0) lines.push(`${this.i18n.delivery_post()}: ${count(DeliveryChannel.Post)}`);
    return { total: deliveries.length, lines };
  }

  /** More than CONFIRM_ABOVE recipients: ask before sending, with the counts per delivery type. True = go. */
  private async confirmRecipients(): Promise<boolean> {
    const { total, lines } = this.recipientSummary();
    if (total <= CONFIRM_ABOVE) return true;
    const alert = await this.alertController.create({
      header: this.i18n.confirm_header(),
      subHeader: fill(this.i18n.confirm_message(), { count: total }),
      message: lines.join(' · '),
      buttons: [
        { text: this.i18n.confirm_cancel(), role: 'cancel' },
        { text: this.i18n.send(), role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }

  protected async send(): Promise<void> {
    if (!this.canSend() || this.isSending()) return;
    this.isSending.set(true);
    if (!(await this.confirmRecipients())) {
      this.isSending.set(false);
      return;
    }
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
        const mailing: SendMailingRequest = {
          tenantId: this.appStore.tenantId(),
          ...(this.groupKey() ? { groupKey: this.groupKey() } : {}),
          to: request.to, from: request.from,
          // with events or to a newsletter every person gets their own mail: no Cc, the address in «An» is the reply address
          cc: this.personalMails() ? [] : request.cc,
          // the content is the page; `body` is ignored with a pageKey
          subject: request.subject, body: '', layout: request.layout,
          pageKey: this.draft.pageKey(), webVersion: this.webVersion(),
          ...(request.storagePath ? { storagePath: request.storagePath, filename: request.filename } : {}),
          extraAttachments: request.extraAttachments,
          deliveries,
          ...(this.hasEvents() ? { caleventKeys: this.chosenEvents().map((e) => e.caleventKey) } : {}),
          ...(this.emailOnly() && this.showOnDashboard() ? { dashboard: true } : {}),
          ...(this.showQrOption() && this.letterQrCodes() ? { letterQrCodes: true } : {}),
          ...this.postPayload(),
        };
        // The server renders the page as stored: the last typed characters first. An edit that could not be
        // stored stops the send (undefined), the server would send the page without it.
        const sending = (async (): Promise<string | undefined> =>
          (await this.draft.flush()) ? this.docEmailService.sendMailing(mailing) : undefined)();
        // A close while this runs (onDestroy) waits for it: a sent page stays, an unsent draft is discarded.
        this.sendInFlight = sending.then((key) => { if (key) this.sent = true; }, () => undefined);
        const mailingKey = await sending;
        if (!mailingKey) {
          await this.showToast(this.i18n.page_save_error(), 'danger');
          this.isSending.set(false);
          return;
        }
        this.sent = true;
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

  protected async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 3000, color, position: 'bottom' });
    await toast.present();
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
