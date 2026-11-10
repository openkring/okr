// libs/content/pdf-template/feature/src/lib/mailing.page.ts
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip,
  IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote, IonSegment, IonSegmentButton, IonTitle, IonToolbar,
} from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import {
  deliveryStatusColor, deliveryStatusCounts, hasDeliveryReports, MailDeliveryStatus, MailingAnswer, mailingAnswerColor,
  mailingRecipientsFor, mailingStateColor, mailJobProgress, formatChf, lastSendingAt, sendingDateLabel, sendingHasTask,
  sendingStatusColor, sendingStatusLabelKey, sendingStatusOf, SendingStatus, summaryParts,
} from '@okr/content-pdf-template-util';
import { SendingModel } from '@okr/shared-models';
import { fill, prettyFormatDate, prettyFormatDateTime } from '@okr/shared-util-core';

import { MailingStore } from './mailing.store';

/** The download link of `getMailingLetters` lives 10 minutes; ask again a little before. */
const LETTERS_URL_TTL_MS = 9 * 60 * 1000;

/**
 * What became of one Versand (spec 1.145): the state and counts `onMailing` wrote, the E-Mail job's
 * progress and error, the letters while they are kept, who got it on which delivery type, and — for a
 * Versand with answer links — every recipient's answer as the event's attendee list has it now.
 *
 * Read-only. It names recipients but shows no address: the names come from the tenant-readable
 * persons, the channels from the `mailings` doc, which only privileged / memberAdmin may read.
 */
@Component({
  selector: 'okr-mailing-page',
  standalone: true,
  providers: [MailingStore],
  imports: [
    SvgIconPipe, Spinner, EmptyList,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonList, IonItem, IonLabel, IonNote, IonChip, IonBadge,
    IonButton, IonIcon, IonSegment, IonSegmentButton,
  ],
  styles: [`
    .wrap { max-width: 900px; margin: 0 auto; }
    ion-card-title { font-size: 1.1rem; }
    ion-note { display: block; padding: 4px 16px; }
    ion-badge { font-weight: normal; }
    .counts ion-chip { font-size: 0.8rem; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/mailings/all" [text]="store.i18n.back()" /></ion-buttons>
        <ion-title>{{ mailing()?.subject || store.i18n.list_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="wrap">
      @if (!mailing()) {
        @if (store.isMailingLoading()) { <okr-spinner /> } @else { <okr-empty-list [message]="store.i18n.not_found()" /> }
      } @else {
        @let m = mailing()!;
        <!-- what onMailing wrote -->
        <ion-card>
          <ion-card-header><ion-card-title>{{ store.i18n.summary() }}</ion-card-title></ion-card-header>
          <ion-card-content>
            <ion-list lines="none">
              <ion-item>
                <ion-label>{{ store.i18n.state() }}</ion-label>
                <ion-chip slot="end" [outline]="true" [color]="stateColor()">{{ stateLabel(m.state) }}</ion-chip>
              </ion-item>
              <ion-item><ion-label>{{ store.i18n.sender() }}</ion-label><ion-note slot="end">{{ m.senderName }}</ion-note></ion-item>
              <ion-item><ion-label>{{ store.i18n.date() }}</ion-label><ion-note slot="end">{{ dateTime(m.createdAt) }}</ion-note></ion-item>
              <ion-item><ion-label>{{ store.i18n.recipients() }}</ion-label><ion-note slot="end">{{ m.deliveries?.length ?? 0 }}</ion-note></ion-item>
              @if (m.attachments?.length) {
                <ion-item>
                  <ion-label>{{ store.i18n.attachments() }}</ion-label>
                  <ion-note slot="end">{{ attachmentNames() }}</ion-note>
                </ion-item>
              }
              @if (m.validUntil) {
                <ion-item><ion-label>{{ store.i18n.valid_until() }}</ion-label><ion-note slot="end">{{ date(m.validUntil) }}</ion-note></ion-item>
              }
            </ion-list>
            @if (m.state !== 'pending') {
              <div class="counts">
                <ion-chip [outline]="true">{{ m.emails ?? 0 }} {{ store.i18n.emails() }}</ion-chip>
                <ion-chip [outline]="true">{{ m.notices ?? 0 }} {{ store.i18n.notices() }}</ion-chip>
                <ion-chip [outline]="true">{{ m.pushes ?? 0 }} {{ store.i18n.pushes() }}</ion-chip>
                @if (m.letters) {
                  <ion-chip [outline]="true">{{ m.letters.count ?? 0 }} {{ store.i18n.letters_count() }}</ion-chip>
                }
              </div>
            }
            @if (m.error) {
              <ion-note color="danger">{{ store.i18n.error() }}: {{ m.error }}</ion-note>
            }
          </ion-card-content>
        </ion-card>

        <!-- the E-Mail part: the mailJobs doc onMailJob keeps up to date -->
        <ion-card>
          <ion-card-header><ion-card-title>{{ store.i18n.job_title() }}</ion-card-title></ion-card-header>
          <ion-card-content>
            @if (!m.mailJobKey) {
              <ion-note>{{ store.i18n.job_none() }}</ion-note>
            } @else {
              @let job = store.mailJob();
              <ion-list lines="none">
                <ion-item>
                  <ion-label>{{ store.i18n.state() }}</ion-label>
                  <ion-chip slot="end" [outline]="true" [color]="jobColor()">{{ jobLabel() }}</ion-chip>
                </ion-item>
                @if (jobProgress()) {
                  <ion-item><ion-label>{{ store.i18n.job_progress() }}</ion-label><ion-note slot="end">{{ jobProgress() }}</ion-note></ion-item>
                }
                @if (job?.errorCode) {
                  <ion-item><ion-label>{{ store.i18n.job_error_code() }}</ion-label><ion-note slot="end">{{ job?.errorCode }}</ion-note></ion-item>
                }
              </ion-list>
              @if (job?.error) {
                <ion-note color="danger">{{ store.i18n.error() }}: {{ job?.error }}</ion-note>
              }
            }
          </ion-card-content>
        </ion-card>

        <!-- the Post part (P3) -->
        @if (m.letters) {
          <ion-card>
            <ion-card-header><ion-card-title>{{ store.i18n.letters_title() }}</ion-card-title></ion-card-header>
            <ion-card-content>
              @switch (lettersState()) {
                @case ('pending') { <ion-note>{{ store.i18n.letters_pending() }}</ion-note> }
                @case ('failed') {
                  <ion-note color="danger">{{ store.i18n.letters_failed() }}{{ m.letters.error ? ' ' + m.letters.error : '' }}</ion-note>
                }
                @case ('expired') { <ion-note>{{ store.i18n.letters_expired() }}</ion-note> }
                @case ('ready') {
                  <ion-button expand="block" [disabled]="store.lettersLoading()" (click)="downloadLetters()">
                    <ion-icon slot="start" src="{{ 'download' | svgIcon }}" />
                    {{ store.i18n.letters_download() }} ({{ m.letters.count ?? 0 }})
                  </ion-button>
                  <ion-note>{{ store.i18n.letters_kept() }}</ion-note>
                }
                @default { <okr-spinner /> }
              }
              @if ((m.letters.missing ?? 0) > 0) {
                <ion-note color="warning">{{ store.i18n.letters_missing() }} {{ m.letters.missing }}</ion-note>
              }
              @if (store.lettersError()) {
                <ion-note color="danger">{{ store.i18n.letters_load_error() }}</ion-note>
              }
            </ion-card-content>
          </ion-card>
        }

        <!-- the Pingen part (spec 1.150 §9): one row per letter, live -->
        @if (store.isPingen()) {
          <ion-card>
            <ion-card-header><ion-card-title>{{ store.sendingI18n.card_title() }}</ion-card-title></ion-card-header>
            <ion-card-content>
              @if (store.sendings().length === 0) {
                @if (store.sendingsLoading()) { <okr-spinner /> } @else { <ion-note>{{ store.sendingI18n.page_empty() }}</ion-note> }
              } @else {
                <ion-note>{{ sendingSummaryLine() }}</ion-note>
                <ion-list lines="inset">
                  @for (s of store.sendings(); track s.okey) {
                    <ion-item>
                      <ion-label>
                        {{ recipientName(s) }}
                        <p>{{ s.pages }} {{ store.sendingI18n.pages() }} · {{ sendingDate(s) }} · {{ chf(s.price) }}</p>
                      </ion-label>
                      @if (hasTask(s)) { <ion-chip slot="end" [outline]="true" color="medium">{{ store.sendingI18n.task_created() }}</ion-chip> }
                      <ion-badge slot="end" [color]="sendingColor(s)">{{ sendingLabel(s) }}</ion-badge>
                    </ion-item>
                  }
                </ion-list>
              }
            </ion-card-content>
          </ion-card>
        }

        <!-- who got it on which delivery type -->
        <ion-card>
          <ion-card-header><ion-card-title>{{ store.i18n.deliveries_title() }}</ion-card-title></ion-card-header>
          <ion-card-content>
            <ion-segment [value]="channel()" (ionChange)="channel.set($any($event.detail.value))">
              @for (c of store.channels(); track c.channel) {
                <ion-segment-button [value]="c.channel">
                  <ion-label>{{ channelLabel(c.channel) }} ({{ c.rows.length }})</ion-label>
                </ion-segment-button>
              }
            </ion-segment>
            @let showStatus = channel() === 'email' && !!m.mailJobKey;
            @if (showStatus) {
              <!-- the mail server's reports (Mailtrap events via getMailingDeliveries), kept 30 days -->
              @if (store.deliveriesError()) {
                <ion-note color="danger">{{ store.i18n.status_error() }}</ion-note>
              } @else if (store.deliveries() && !hasReports()) {
                <ion-note>{{ store.i18n.status_none() }}</ion-note>
              } @else if (hasReports()) {
                <div class="counts">
                  @for (s of statusKinds; track s) {
                    @if (statusCounts()[s] > 0) {
                      <ion-chip [outline]="true" [color]="statusColor(s)">{{ statusCounts()[s] }} {{ statusLabel(s) }}</ion-chip>
                    }
                  }
                </div>
              }
              <ion-button fill="clear" size="small" [disabled]="store.deliveriesLoading()" (click)="store.loadDeliveries(m)">
                <ion-icon slot="start" src="{{ 'reload' | svgIcon }}" />
                {{ store.i18n.status_refresh() }}
              </ion-button>
            }
            @if (channelRows().length === 0) {
              <ion-note>{{ store.i18n.deliveries_empty() }}</ion-note>
            } @else {
              <ion-list lines="inset">
                @for (row of channelRows(); track row.personKey) {
                  <ion-item>
                    <ion-label>
                      {{ row.name }}
                      @if (showStatus && hasReports()) {
                        @let d = store.deliveryByPerson().get(row.personKey);
                        @if (d?.reason) { <p>{{ d?.reason }}</p> }
                      }
                    </ion-label>
                    @if (showStatus && hasReports()) {
                      @let s = store.deliveryByPerson().get(row.personKey)?.status ?? 'pending';
                      <ion-badge slot="end" [color]="statusColor(s)">{{ statusLabel(s) }}</ion-badge>
                    }
                  </ion-item>
                }
              </ion-list>
            }
            @if (showStatus && store.deliveries(); as reports) {
              @if (reports.addresses.length > 0) {
                <ion-list lines="inset">
                  <ion-item lines="none"><ion-label><strong>{{ store.i18n.status_addresses() }}</strong></ion-label></ion-item>
                  @for (a of reports.addresses; track a.email) {
                    <ion-item>
                      <ion-label>{{ a.email }}@if (a.reason) { <p>{{ a.reason }}</p> }</ion-label>
                      <ion-badge slot="end" [color]="statusColor(a.status)">{{ statusLabel(a.status) }}</ion-badge>
                    </ion-item>
                  }
                </ion-list>
              }
              @if (reports.unmatched > 0) {
                <ion-note>{{ unmatchedNote() }}</ion-note>
              }
            }
          </ion-card-content>
        </ion-card>

        <!-- a Versand with answer links: the answers, read from each event's attendee list -->
        @for (ev of store.events(); track ev.key) {
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ store.i18n.events_title() }}: {{ ev.event?.name ?? ev.key }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              @if (!ev.event) {
                <ion-note>{{ store.i18n.event_missing() }}</ion-note>
              } @else {
                <div class="counts">
                  @for (a of answerKinds; track a) {
                    <ion-chip [outline]="true" [color]="answerColor(a)">{{ ev.counts[a] }} {{ answerLabel(a) }}</ion-chip>
                  }
                </div>
                <ion-note>{{ store.i18n.answer_hint() }}</ion-note>
                <ion-list lines="inset">
                  @for (row of ev.answers; track row.personKey) {
                    <ion-item>
                      <ion-label>{{ row.name }}</ion-label>
                      <ion-badge slot="end" [color]="answerColor(row.answer)">{{ answerLabel(row.answer) }}</ion-badge>
                    </ion-item>
                  }
                </ion-list>
              }
            </ion-card-content>
          </ion-card>
        }
      }
      </div>
    </ion-content>
  `,
})
export class MailingPage {
  protected readonly store = inject(MailingStore);

  /** route param `:mailingKey` */
  public readonly mailingKey = input.required<string>();

  protected readonly answerKinds: MailingAnswer[] = ['accepted', 'waiting', 'declined', 'open'];
  protected readonly statusKinds: (MailDeliveryStatus | 'pending')[] = ['delivered', 'deferred', 'spam', 'rejected', 'pending'];
  protected readonly channel = signal<string>('email');
  private lettersFetchedAt = 0;

  protected readonly mailing = computed(() => this.store.mailing());
  protected readonly channelRows = computed(() => this.store.channels().find((c) => c.channel === this.channel())?.rows ?? []);
  protected readonly attachmentNames = computed(() => (this.mailing()?.attachments ?? []).map((a) => a.filename).join(', '));
  protected readonly hasReports = computed(() => hasDeliveryReports(this.store.deliveries()));
  protected readonly statusCounts = computed(() =>
    deliveryStatusCounts(mailingRecipientsFor(this.mailing()?.deliveries, 'email'), this.store.deliveryByPerson()));
  protected readonly unmatchedNote = computed(() =>
    fill(this.store.i18n.status_unmatched(), { count: this.store.deliveries()?.unmatched ?? 0 }));
  protected readonly stateColor = computed(() => mailingStateColor(this.mailing()?.state, this.store.partlyFailed()));
  protected readonly jobProgress = computed(() => mailJobProgress(this.store.mailJob()));
  protected readonly jobColor = computed(() => {
    const state = this.store.mailJob()?.state;
    return state === 'sending' ? 'primary' : mailingStateColor(state);
  });
  protected readonly jobLabel = computed(() => {
    switch (this.store.mailJob()?.state) {
      case 'sending': return this.store.i18n.job_sending();
      case 'sent': return this.store.i18n.job_sent();
      case 'failed': return this.store.i18n.job_failed();
      default: return this.store.i18n.job_pending();
    }
  });
  /**
   * The letters' state: the doc says pending/failed; once it says ready, the server decides whether
   * they are still kept (`expired` after 7 days). Undefined while that answer is out.
   */
  protected readonly lettersState = computed(() => {
    const state = this.mailing()?.letters?.state;
    if (state !== 'ready') return state;
    const answer = this.store.letters()?.state;
    return answer === 'ready' || answer === 'expired' || answer === 'failed' ? answer : undefined;
  });

  constructor() {
    effect(() => this.store.setMailingKey(this.mailingKey()));
    // ask for the download link once the doc says the letters are ready (and again when the doc changes)
    effect(() => {
      const mailing = this.mailing();
      if (mailing?.letters?.state !== 'ready') return;
      untracked(() => {
        if (!this.store.letters()) void this.fetchLetters();
      });
    });
    // the mail server's reports, once per Versand with an E-Mail part (the button asks again)
    effect(() => {
      const mailing = this.mailing();
      if (!mailing?.mailJobKey) return;
      untracked(() => {
        if (!this.store.deliveries() && !this.store.deliveriesLoading() && !this.store.deliveriesError()) void this.store.loadDeliveries(mailing);
      });
    });
    // open on the delivery type that has recipients
    effect(() => {
      const first = this.store.channels().find((c) => c.rows.length > 0);
      if (first) untracked(() => { if (this.channelRows().length === 0) this.channel.set(first.channel); });
    });
  }

  private async fetchLetters(): Promise<void> {
    await this.store.loadLetters(this.mailing());
    this.lettersFetchedAt = Date.now();
  }

  /** The link was fetched before the click so the browser opens it without a popup block; a stale one is renewed first. */
  protected async downloadLetters(): Promise<void> {
    if (Date.now() - this.lettersFetchedAt > LETTERS_URL_TTL_MS) await this.fetchLetters();
    const url = this.store.letters()?.url;
    if (url) window.open(url, '_blank', 'noopener');
  }

  protected readonly sendingSummaryLine = computed(() => {
    const summary = this.store.sendingSummary();
    const parts = summaryParts(summary).map((p) => `${p.count} ${this.partLabel(p.status)}`);
    const total = fill(this.store.sendingI18n.summary_total(), { count: summary.total });
    return parts.length > 0 ? `${total}: ${parts.join(' · ')}` : total;
  });

  private partLabel(status: SendingStatus): string {
    const i18n = this.store.sendingI18n;
    switch (status) {
      case 'sent': return i18n.part_sent();
      case 'delivered': return i18n.part_delivered();
      case 'problem': return i18n.part_problem();
      case 'undeliverable': return i18n.part_undeliverable();
      default: return i18n.part_in_production();
    }
  }

  protected recipientName(s: SendingModel): string {
    return s.recipientName || this.store.sendingI18n.unknown_recipient();
  }

  protected sendingLabel(s: SendingModel): string {
    return this.store.sendingI18n[sendingStatusLabelKey(sendingStatusOf(s.state))]();
  }

  protected sendingColor(s: SendingModel): string {
    return sendingStatusColor(sendingStatusOf(s.state));
  }

  protected sendingDate(s: SendingModel): string {
    return sendingDateLabel(lastSendingAt(s));
  }

  protected hasTask(s: SendingModel): boolean {
    return sendingHasTask(s.state);
  }

  protected chf(rappen: number): string {
    return formatChf(rappen);
  }

  protected date(storeDate: string | undefined): string {
    return prettyFormatDate(storeDate);
  }

  protected dateTime(storeDateTime: string | undefined): string {
    return prettyFormatDateTime(storeDateTime);
  }

  protected stateLabel(state: string | undefined): string {
    switch (state) {
      case 'sent': return this.store.i18n.state_sent();
      case 'failed': return this.store.i18n.state_failed();
      default: return this.store.i18n.state_pending();
    }
  }

  protected channelLabel(channel: string): string {
    switch (channel) {
      case 'chat': return this.store.i18n.delivery_chat();
      case 'post': return this.store.i18n.delivery_post();
      default: return this.store.i18n.delivery_email();
    }
  }

  protected answerLabel(answer: MailingAnswer): string {
    switch (answer) {
      case 'accepted': return this.store.i18n.answer_accepted();
      case 'waiting': return this.store.i18n.answer_waiting();
      case 'declined': return this.store.i18n.answer_declined();
      default: return this.store.i18n.answer_open();
    }
  }

  protected statusLabel(status: MailDeliveryStatus | 'pending'): string {
    switch (status) {
      case 'delivered': return this.store.i18n.status_delivered();
      case 'deferred': return this.store.i18n.status_deferred();
      case 'rejected': return this.store.i18n.status_rejected();
      case 'spam': return this.store.i18n.status_spam();
      default: return this.store.i18n.status_pending();
    }
  }

  protected statusColor(status: MailDeliveryStatus | 'pending'): string {
    return deliveryStatusColor(status);
  }

  protected answerColor(answer: MailingAnswer): string {
    return mailingAnswerColor(answer);
  }
}
