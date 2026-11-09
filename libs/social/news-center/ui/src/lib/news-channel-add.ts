import { Component, computed, effect, input, output, signal } from '@angular/core';
import { IonAvatar, IonButton, IonItem, IonLabel, IonList, IonNote, IonText } from '@ionic/angular';

import { NewsChannelModel, NewsSegment } from '@okr/shared-models';
import { Checkbox, CheckboxI18n, ErrorNote, ImgDirective, TextInput, TextInputI18n } from '@okr/shared-ui';
import { NEWS_CENTER_I18N_KEYS, NewsCenterI18n, NewsItem, ResolvedNewsSource, newsRelayState, parseNewsFeed } from '@okr/social-news-center-util';

import { NewsImagePipe } from './news-image.pipe';

/** Why the relay could not resolve a pasted link; the store sets it, this component words it. */
export type NewsResolveError = 'no-feed' | 'segment' | 'url' | 'blocked' | 'http-not-image' | 'permission-denied' | 'unknown';

/**
 * Curator flow: paste a link, let the relay resolve it, look at the preview, save the channel.
 * Dumb: `resolve` and `save` go up; `resolved`, `preview` and `error` come down from the store.
 */
@Component({
  selector: 'okr-news-channel-add',
  standalone: true,
  imports: [NewsImagePipe, IonList, IonItem, IonLabel, IonAvatar, IonButton, IonNote, IonText, TextInput, Checkbox, ErrorNote, ImgDirective],
  styles: [`.actions { padding: 8px 16px; } img.still { width: 100%; max-height: 220px; object-fit: contain; }`],
  template: `
    <okr-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="onUrlChange($event)"
      [autofocus]="true" [maxLength]="2000" [readOnly]="false" inputMode="url" />
    @if (errorKey(); as key) {
      <okr-error-note [errors]="[key]" />
    }
    <div class="actions">
      <ion-button size="small" [disabled]="!url().trim()" (click)="resolve.emit(url().trim())">{{ i18n().check_link() }}</ion-button>
    </div>

    @if (resolved(); as source) {
      <ion-list lines="none">
        <ion-item>
          @if (source.avatarUrl) {
            <ion-avatar slot="start"><img okrImg [src]="source.avatarUrl | newsImage" alt="" referrerpolicy="no-referrer" /></ion-avatar>
          }
          <ion-label>
            <h2>{{ source.name }}</h2>
            <ion-note>{{ i18n().preview() }}</ion-note>
          </ion-label>
        </ion-item>
        @if (source.kind === 'image') {
          <ion-item>
            <img class="still" okrImg [src]="source.feedUrl" alt="" referrerpolicy="no-referrer" />
          </ion-item>
        } @else {
          @for (item of topItems(); track item.id) {
            <ion-item><ion-label class="ion-text-wrap">{{ item.title }}</ion-label></ion-item>
          }
        }
        @if (source.kind === 'image') {
          <okr-checkbox [i18n]="relayI18n()" [checked]="viaRelay()" (checkedChange)="viaRelayChoice.set($event)"
            [readOnly]="relayState().readOnly" [toggle]="true" [showHelper]="true" />
        }
        <okr-checkbox [i18n]="defaultOnI18n()" [checked]="defaultOn()" (checkedChange)="defaultOn.set($event)"
          [readOnly]="false" [toggle]="true" />
      </ion-list>
      <div class="actions">
        <ion-button (click)="onSave(source)">{{ i18n().accept() }}</ion-button>
      </div>
    }
  `,
})
export class NewsChannelAdd {
  public readonly segment = input.required<NewsSegment>();
  public readonly resolved = input<ResolvedNewsSource | undefined>();
  /** At most the first three are shown. */
  public readonly preview = input<NewsItem[]>([]);
  public readonly error = input<NewsResolveError | undefined>();
  public readonly prefillUrl = input('');
  public readonly i18n = input.required<NewsCenterI18n>();

  public readonly resolve = output<string>();
  public readonly save = output<NewsChannelModel>();

  protected readonly typedUrl = signal<string | undefined>(undefined);
  protected readonly url = computed(() => this.typedUrl() ?? this.prefillUrl());
  protected readonly viaRelayChoice = signal<boolean | undefined>(undefined);
  protected readonly defaultOn = signal(true);

  /** http: camera → on and locked; an image the relay would refuse → off and locked (design §7.1). */
  protected readonly relayState = computed(() => newsRelayState(this.resolved(), this.viaRelayChoice()));
  protected readonly viaRelay = computed(() => this.relayState().viaRelay);

  /** The store's parsed preview when it gives one, else the resolved feed text parsed here; three items at most. */
  protected readonly topItems = computed(() => {
    if (this.preview().length) return this.preview().slice(0, 3);
    const source = this.resolved();
    if (!source || source.kind === 'image' || !source.body) return [];
    try {
      return parseNewsFeed(source.body, source.kind, '', 3);
    } catch {
      return [];
    }
  });

  /** A scoped i18n key; `okr-error-note` resolves it. */
  protected readonly errorKey = computed(() => {
    const e = this.error();
    if (!e) return '';
    const map: Record<NewsResolveError, keyof typeof NEWS_CENTER_I18N_KEYS> = {
      'no-feed': 'no_feed_found', segment: 'error_segment', url: 'error_url', blocked: 'error_blocked',
      'http-not-image': 'error_http_not_image', 'permission-denied': 'error_permission_denied', unknown: 'error_unknown',
    };
    return NEWS_CENTER_I18N_KEYS[map[e]];
  });

  protected readonly urlI18n = computed(() => ({
    name: 'feedUrl', label: this.i18n().paste_link(), placeholder: this.i18n().link_placeholder(), helper: '',
  } as TextInputI18n));
  protected readonly relayI18n = computed(() => ({
    name: 'viaRelay', label: this.i18n().via_relay(), helper: this.i18n().via_relay_hint(),
  } as CheckboxI18n));
  /** The switch says what the channel will be: «standardmässig an» or «nur angeboten». */
  protected readonly defaultOnI18n = computed(() => ({
    name: 'defaultOn', label: this.defaultOn() ? this.i18n().default_on() : this.i18n().offered_only(), helper: '',
  } as CheckboxI18n));

  constructor() {
    // another link to check (a different suggestion, or a fresh add) replaces what was typed
    effect(() => {
      this.prefillUrl();
      this.typedUrl.set(undefined);
    });
    // a new resolution starts from its own defaults: relay as resolved, «standardmässig an»
    effect(() => {
      this.resolved();
      this.viaRelayChoice.set(undefined);
      this.defaultOn.set(true);
    });
  }

  protected onUrlChange(value: string): void {
    this.typedUrl.set(value);
  }

  protected onSave(source: ResolvedNewsSource): void {
    const channel = new NewsChannelModel();
    channel.segment = this.segment();
    channel.kind = source.kind;
    channel.feedUrl = source.feedUrl;
    channel.siteUrl = source.siteUrl;
    channel.name = source.name;
    channel.avatarUrl = source.avatarUrl;
    channel.defaultOn = this.defaultOn();
    channel.viaRelay = this.viaRelay();
    this.save.emit(channel);
  }
}
