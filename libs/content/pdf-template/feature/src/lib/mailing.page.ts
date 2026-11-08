// libs/content/pdf-template/feature/src/lib/mailing.page.ts
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip,
  IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote, IonSegment, IonSegmentButton, IonTitle, IonToolbar,
} from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { MailingAnswer, mailingAnswerColor, mailingStateColor, mailJobProgress } from '@okr/content-pdf-template-util';
import { prettyFormatDate, prettyFormatDateTime } from '@okr/shared-util-core';

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
            @if (channelRows().length === 0) {
              <ion-note>{{ store.i18n.deliveries_empty() }}</ion-note>
            } @else {
              <ion-list lines="inset">
                @for (row of channelRows(); track row.personKey) {
                  <ion-item><ion-label>{{ row.name }}</ion-label></ion-item>
                }
              </ion-list>
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
  protected readonly channel = signal<string>('email');
  private lettersFetchedAt = 0;

  protected readonly mailing = computed(() => this.store.mailing());
  protected readonly channelRows = computed(() => this.store.channels().find((c) => c.channel === this.channel())?.rows ?? []);
  protected readonly attachmentNames = computed(() => (this.mailing()?.attachments ?? []).map((a) => a.filename).join(', '));
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

  protected answerColor(answer: MailingAnswer): string {
    return mailingAnswerColor(answer);
  }
}
