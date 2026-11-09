import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import {
  IonAvatar, IonBadge, IonButton, IonChip, IonContent, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote,
  IonReorder, IonReorderGroup, IonSegment, IonSegmentButton, ReorderEndCustomEvent,
} from '@ionic/angular';

import { NewsChannelModel, NewsChannelRequestModel, NewsSegment } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Checkbox, CheckboxI18n, Header, ImgDirective } from '@okr/shared-ui';
import { prettyFormatDateTime } from '@okr/shared-util-core';
import { NewsCenterI18n, NewsItem, NewsRequestFormData, ResolvedNewsSource } from '@okr/social-news-center-util';

import { NewsImagePipe } from './news-image.pipe';

import { NewsChannelAdd, NewsResolveError } from './news-channel-add';
import { NewsRequestForm } from './news-request.form';

type SettingsView = 'mine' | 'club';

/**
 * Settings of one NewsCenter segment. A list manager, not an edit form: every tap saves through
 * an output (no change-confirmation). Members hide / show / add channels and suggest new ones;
 * admin and contentAdmin additionally curate the club list and decide on suggestions.
 */
@Component({
  selector: 'okr-news-settings-modal',
  standalone: true,
  imports: [NewsImagePipe, 
    NgTemplateOutlet, IonContent, IonList, IonListHeader, IonItem, IonLabel, IonAvatar, IonButton, IonIcon, IonChip,
    IonNote, IonBadge, IonSegment, IonSegmentButton, IonReorderGroup, IonReorder, SvgIconPipe, ImgDirective, Header,
    Checkbox, NewsRequestForm, NewsChannelAdd,
  ],
  styles: [`
    .initial { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;
      background: var(--ion-color-medium-tint); color: #fff; font-weight: 600; }
    .hint { display: block; padding: 8px 16px; }
    .actions { padding: 8px 16px; display: flex; gap: 8px; align-items: center; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n().settings() }" [isModal]="true" />
    <ion-content>
      @if (isCurator()) {
        <ion-segment [value]="view()" (ionChange)="onViewChange($event.detail.value)">
          <ion-segment-button value="mine"><ion-label>{{ i18n().my_channels() }}</ion-label></ion-segment-button>
          <ion-segment-button value="club">
            <ion-label>{{ i18n().club_list() }}</ion-label>
            @if (openRequests().length > 0) { <ion-badge color="danger">{{ openRequests().length }}</ion-badge> }
          </ion-segment-button>
        </ion-segment>
      }

      @if (view() === 'mine' || !isCurator()) {
        <ion-list lines="full">
          <ion-list-header><ion-label>{{ i18n().my_channels() }}</ion-label></ion-list-header>
          @for (channel of mine(); track channel.okey) {
            <ion-item>
              <ng-container *ngTemplateOutlet="avatarTpl; context: { $implicit: channel }" />
              <ion-label>{{ channel.name }}</ion-label>
              <ion-button slot="end" fill="clear" color="medium" [attr.aria-label]="i18n().remove_channel()" (click)="hide.emit(channel.okey)">
                <ion-icon slot="icon-only" src="{{ 'cancel-circle' | svgIcon }}" />
              </ion-button>
            </ion-item>
          }
        </ion-list>

        @if (hidden().length > 0) {
          <ion-list lines="full">
            <ion-list-header><ion-label>{{ i18n().hidden_channels() }}</ion-label></ion-list-header>
            @for (channel of hidden(); track channel.okey) {
              <ion-item>
                <ng-container *ngTemplateOutlet="avatarTpl; context: { $implicit: channel }" />
                <ion-label>{{ channel.name }}</ion-label>
                <ion-button slot="end" fill="clear" (click)="show.emit(channel.okey)">{{ i18n().show_again() }}</ion-button>
              </ion-item>
            }
          </ion-list>
        }

        @if (optional().length > 0) {
          <ion-list lines="full">
            <ion-list-header><ion-label>{{ i18n().add_channel() }}</ion-label></ion-list-header>
            @for (channel of optional(); track channel.okey) {
              <ion-item button detail="false" (click)="add.emit(channel.okey)">
                <ng-container *ngTemplateOutlet="avatarTpl; context: { $implicit: channel }" />
                <ion-label>{{ channel.name }}</ion-label>
                <ion-icon slot="end" src="{{ 'add-circle' | svgIcon }}" />
              </ion-item>
            }
          </ion-list>
        }

        <div class="actions">
          <ion-button fill="outline" size="small" (click)="resetDefaults.emit()">{{ i18n().reset_defaults() }}</ion-button>
        </div>

        <ion-list lines="none">
          <ion-item button detail="false" (click)="toggleRequestForm()">
            <ion-label color="primary">{{ i18n().suggest_channel() }}</ion-label>
          </ion-item>
        </ion-list>
        @if (showRequestForm()) {
          @if (!canSuggest()) { <ion-note class="hint" color="medium">{{ i18n().suggest_limit() }}</ion-note> }
          <okr-news-request-form [i18n]="i18n()" [formData]="requestData()" (formDataChange)="requestData.set($event)"
            (valid)="requestValid.set($event)" />
          <div class="actions">
            <ion-button [disabled]="!requestValid() || !canSuggest()" (click)="sendSuggestion()">{{ i18n().send() }}</ion-button>
          </div>
        }

        @if (myRequests().length > 0) {
          <ion-list lines="full">
            <ion-list-header><ion-label>{{ i18n().your_suggestions() }}</ion-label></ion-list-header>
            @for (request of myRequests(); track request.okey) {
              <ion-item>
                <ion-label class="ion-text-wrap">{{ request.url }}</ion-label>
                <ion-chip slot="end" [color]="statusColor(request.status)">{{ statusLabel(request.status) }}</ion-chip>
              </ion-item>
            }
          </ion-list>
        }
        <ion-note class="hint">{{ i18n().ip_hint() }}</ion-note>
      } @else {
        @if (openRequests().length > 0) {
          <ion-list lines="full">
            <ion-list-header><ion-label>{{ i18n().requests_title() }}</ion-label></ion-list-header>
            @for (request of openRequests(); track request.okey) {
              <ion-item>
                <ion-label class="ion-text-wrap">
                  <h3>{{ request.url }}</h3>
                  <p>{{ segmentLabel(request.segment) }} · {{ request.requesterName }} · {{ prettyDate(request.createdAt) }}</p>
                  @if (request.note) { <p>{{ request.note }}</p> }
                </ion-label>
                <ion-button slot="end" size="small" (click)="startAccept(request)">{{ i18n().accept() }}</ion-button>
                <ion-button slot="end" size="small" fill="outline" color="medium" (click)="reject.emit(request)">{{ i18n().reject() }}</ion-button>
              </ion-item>
            }
          </ion-list>
        }

        <ion-list lines="none">
          <ion-list-header>
            <ion-label>{{ i18n().club_list() }}</ion-label>
            <ion-button size="small" fill="clear" (click)="startAdd()">
              <ion-icon slot="start" src="{{ 'add' | svgIcon }}" />{{ i18n().add_channel() }}
            </ion-button>
          </ion-list-header>
        </ion-list>
        @if (adding()) {
          <okr-news-channel-add [segment]="addSegment()" [resolved]="resolved()" [preview]="preview()" [error]="resolveError()"
            [prefillUrl]="prefillUrl()" [i18n]="i18n()"
            (resolve)="resolve.emit({ url: $event, segment: addSegment() })" (save)="onClubSave($event)" />
        }
        <ion-list lines="full">
          <ion-reorder-group [disabled]="false" (ionReorderEnd)="onReorder($event)">
            @for (channel of club(); track channel.okey) {
              <ion-item>
                <okr-checkbox slot="start" [i18n]="channel.defaultOn ? defaultOnI18n() : offeredOnlyI18n()" [checked]="channel.defaultOn"
                  [ariaLabel]="(channel.defaultOn ? defaultOnI18n() : offeredOnlyI18n()).label"
                  [readOnly]="false" [toggle]="true" (checkedChange)="toggleDefaultOn(channel, $event)" />
                <ng-container *ngTemplateOutlet="avatarTpl; context: { $implicit: channel }" />
                <ion-label>{{ channel.name }}</ion-label>
                <ion-button slot="end" fill="clear" color="medium" [attr.aria-label]="i18n().edit_channel()" (click)="edit.emit(channel)">
                  <ion-icon slot="icon-only" src="{{ 'edit' | svgIcon }}" />
                </ion-button>
                <ion-button slot="end" fill="clear" color="medium" [attr.aria-label]="i18n().archive_channel()" (click)="clubArchive.emit(channel.okey)">
                  <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                </ion-button>
                <ion-reorder slot="end" />
              </ion-item>
            }
          </ion-reorder-group>
        </ion-list>
      }
    </ion-content>

    <ng-template #avatarTpl let-channel>
      <ion-avatar slot="start">
        @if (avatarOk(channel.okey); as avatar) {
          <img okrImg [src]="avatar | newsImage" alt="" referrerpolicy="no-referrer" (error)="onAvatarError(avatar)" />
        } @else {
          <div class="initial">{{ channel.name.charAt(0) }}</div>
        }
      </ion-avatar>
    </ng-template>
  `,
})
export class NewsSettingsModal {
  public readonly segment = input.required<NewsSegment>();
  public readonly isCurator = input(false);

  /** avatar URLs that failed to load (a camera that is down): they show the initial; a new still URL gets a fresh chance */
  protected readonly failedAvatars = signal<ReadonlySet<string>>(new Set());
  protected onAvatarError(url: string): void {
    this.failedAvatars.update((s) => new Set(s).add(url));
  }
  protected avatarOk(okey: string): string {
    const url = this.avatars()[okey] ?? '';
    return url && !this.failedAvatars().has(url) ? url : '';
  }
  public readonly avatars = input<Record<string, string>>({});
  public readonly mine = input<NewsChannelModel[]>([]);
  public readonly hidden = input<NewsChannelModel[]>([]);
  public readonly optional = input<NewsChannelModel[]>([]);
  public readonly club = input<NewsChannelModel[]>([]);
  public readonly myRequests = input<NewsChannelRequestModel[]>([]);
  public readonly openRequests = input<NewsChannelRequestModel[]>([]);
  public readonly canSuggest = input(true);
  /** The curator add flow: what the relay answered for the last `resolve`. */
  public readonly resolved = input<ResolvedNewsSource | undefined>();
  public readonly preview = input<NewsItem[]>([]);
  public readonly resolveError = input<NewsResolveError | undefined>();
  public readonly i18n = input.required<NewsCenterI18n>();

  public readonly hide = output<string>();
  public readonly show = output<string>();
  public readonly add = output<string>();
  public readonly resetDefaults = output<void>();
  public readonly suggest = output<NewsRequestFormData>();
  public readonly clubSave = output<NewsChannelModel>();
  public readonly clubArchive = output<string>();
  /** curator: open the edit modal of a club channel (design 2026-11-09 §5.3) */
  public readonly edit = output<NewsChannelModel>();
  public readonly clubReorder = output<string[]>();
  public readonly accept = output<NewsChannelRequestModel>();
  public readonly reject = output<NewsChannelRequestModel>();
  public readonly resolve = output<{ url: string; segment: NewsSegment }>();
  /** A new add flow starts: drop the previous link's resolution, so its preview cannot be saved for this one. */
  public readonly resolveClear = output<void>();

  protected readonly view = signal<SettingsView>('mine');
  protected readonly showRequestForm = signal(false);
  protected readonly requestValid = signal(false);
  protected readonly requestData = signal<NewsRequestFormData>({ segment: 'video', url: '', note: '' });
  protected readonly adding = signal(false);
  protected readonly prefillUrl = signal('');
  /** The suggestion being accepted; marked accepted once its channel is saved. */
  private readonly pendingRequest = signal<NewsChannelRequestModel | undefined>(undefined);
  /**
   * The segment the add flow resolves and saves for: an accepted suggestion keeps the segment the
   * member chose, which need not be the tab the settings were opened from.
   */
  protected readonly addSegment = computed(() => this.pendingRequest()?.segment ?? this.segment());

  protected readonly defaultOnI18n = computed(() => ({
    name: 'defaultOn', label: this.i18n().default_on(), helper: '',
  } as CheckboxI18n));
  protected readonly offeredOnlyI18n = computed(() => ({
    name: 'defaultOn', label: this.i18n().offered_only(), helper: '',
  } as CheckboxI18n));

  protected onViewChange(value: string | number | null | undefined): void {
    this.view.set(value === 'club' ? 'club' : 'mine');
  }

  protected toggleRequestForm(): void {
    this.requestData.update((d) => ({ ...d, segment: this.segment() }));
    this.showRequestForm.update((v) => !v);
  }

  protected sendSuggestion(): void {
    const data = this.requestData();
    this.suggest.emit({ segment: data.segment, url: data.url.trim(), note: data.note.trim() });
    this.requestData.set({ segment: this.segment(), url: '', note: '' });
    this.showRequestForm.set(false);
  }

  protected startAccept(request: NewsChannelRequestModel): void {
    this.resolveClear.emit();
    this.pendingRequest.set(request);
    this.prefillUrl.set(request.url);
    this.adding.set(true);
  }

  protected startAdd(): void {
    this.resolveClear.emit();
    this.pendingRequest.set(undefined);
    this.prefillUrl.set('');
    this.adding.set(true);
  }

  protected onClubSave(channel: NewsChannelModel): void {
    this.clubSave.emit(channel);
    const request = this.pendingRequest();
    if (request) this.accept.emit(request);
    this.pendingRequest.set(undefined);
    this.adding.set(false);
  }

  protected toggleDefaultOn(channel: NewsChannelModel, defaultOn: boolean): void {
    if (channel.defaultOn !== defaultOn) this.clubSave.emit({ ...channel, defaultOn });
  }

  protected onReorder(event: ReorderEndCustomEvent): void {
    const keys = event.detail.complete(this.club().map((c) => c.okey)) as string[];
    this.clubReorder.emit(keys);
  }

  protected segmentLabel(segment: NewsSegment): string {
    return this.i18n()[`segment_${segment}`]();
  }

  protected statusLabel(status: NewsChannelRequestModel['status']): string {
    return this.i18n()[`status_${status}`]();
  }

  protected statusColor(status: NewsChannelRequestModel['status']): string {
    return status === 'accepted' ? 'success' : status === 'rejected' ? 'medium' : 'warning';
  }

  protected prettyDate(createdAt: string): string {
    return prettyFormatDateTime(createdAt);
  }
}
