import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  ActionSheetController, AlertController, IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonHeader, IonSpinner, IonTitle,
  IonToolbar, ModalController, ToastController,
} from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { RouteMap, RoutePin } from '@okr/shared-ui';
import { okrPrompt } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { GuestFootprintView, GuestJournalView, guestErrorOf, JournalGuestService } from '@okr/travel-journal-data-access';
import { JournalReactions, ReactionComment } from '@okr/travel-journal-ui';
import {
  FlyPoint, FlyStop, flyoverTimeline, GIBS_BLUE_MARBLE, JOURNAL_I18N_KEYS, JournalI18n, stopTime, weatherLine, weatherOf,
} from '@okr/travel-journal-util';

import { openJournalFlyover } from './journal-flyover-open';

/**
 * The journal for a guest (spec 1.113 §7, plan 7): opened with the personal link, no sign-in. Everything comes
 * from the `journalGuest` callable with the link code — published footprints, photos, likes and comments —
 * and the guest likes, comments and chooses their notifications. `?mute=1` (the link in every message)
 * switches notifications off on opening.
 */
@Component({
  selector: 'okr-journal-guest-page',
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonCard, IonCardContent, IonSpinner, RouteMap, JournalReactions],
  styles: [`
    .center { text-align: center; padding: 48px 16px; color: var(--ion-color-medium); }
    .map { height: 40vh; min-height: 240px; }
    .wrap { max-width: 860px; margin: 0 auto; padding: 8px; }
    .hello { color: var(--ion-color-medium); font-size: 0.9rem; margin: 8px 8px 0; }
    .card { display: flex; gap: 12px; align-items: center; cursor: pointer; }
    .thumb { width: 72px; height: 72px; border-radius: 8px; object-fit: cover; background: var(--ion-color-light); flex: none; }
    .card h3 { margin: 0 0 4px; font-size: 1rem; }
    .card p { margin: 0; font-size: 0.8rem; color: var(--ion-color-medium); }
    .story { max-width: 760px; margin: 0 auto; padding: 0 16px; }
    .story h2 { margin: 16px 0 4px; }
    .story .facts { color: var(--ion-color-medium); font-size: 0.9rem; margin-bottom: 16px; }
    .block { margin: 16px 0; }
    .block .by { font-size: 0.8rem; color: var(--ion-color-medium); }
    .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 6px; }
    .photos img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 6px; cursor: zoom-in; }
  `],
  template: `
    <ion-header>
      <ion-toolbar>
        @if (selected()) {
          <ion-buttons slot="start"><ion-button (click)="selectedKey.set(undefined)">{{ i18n.guest_back() }}</ion-button></ion-buttons>
        }
        <ion-title>{{ view()?.journal?.title || i18n.untitled() }}</ion-title>
        @if (view()) {
          <ion-buttons slot="end">
            @if (flyover() && !selected()) { <ion-button (click)="fly()">{{ i18n.flyover() }}</ion-button> }
            <ion-button (click)="settings()">{{ i18n.guest_settings() }}</ion-button></ion-buttons>
        }
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (error()) {
        <p class="center">{{ error() }}</p>
      } @else if (!view()) {
        <div class="center"><ion-spinner /><p>{{ i18n.guest_loading() }}</p></div>
      } @else if (selected(); as fp) {
        <div class="story">
          <h2>{{ fp.title || i18n.untitled() }}</h2>
          <div class="facts">{{ facts(fp) }}</div>
          @for (block of fp.blocks; track block.key) {
            <div class="block">
              <div class="by">{{ block.authorName }}</div>
              @if (block.kind === 'text') {
                <div [innerHTML]="block.html"></div>
              } @else {
                <div class="photos">
                  @for (photo of block.photos; track photo.key) {
                    <img [src]="photo.thumb" alt="" (click)="openPhoto(photo.url)" />
                  }
                </div>
              }
            </div>
          }
        </div>
        <okr-journal-reactions [likes]="fp.likes" [liked]="fp.liked" [comments]="comments(fp)" [i18n]="i18n"
          (likeToggled)="toggleLike(fp)" (writeClicked)="writeComment(fp)" (deleteClicked)="deleteComment($event)" />
      } @else {
        <div class="map">
          <okr-route-map [route]="route()" [pins]="pins()" [tiles]="tiles" (pinClicked)="open($event)" />
        </div>
        <div class="wrap">
          <p class="hello">{{ hello() }}</p>
          @for (fp of view()?.footprints ?? []; track fp.key) {
            <ion-card (click)="open(fp.key)">
              <ion-card-content class="card">
                @if (thumbOf(fp); as thumb) { <img class="thumb" [src]="thumb" alt="" /> } @else { <div class="thumb"></div> }
                <div>
                  <h3>{{ fp.title || i18n.untitled() }}</h3>
                  <p>{{ facts(fp) }}</p>
                  <p>{{ counts(fp) }}</p>
                </div>
              </ion-card-content>
            </ion-card>
          } @empty {
            <p class="center">{{ i18n.guest_empty() }}</p>
          }
        </div>
      }
    </ion-content>
  `,
})
export class JournalGuestPage {
  private readonly guestService = inject(JournalGuestService);
  private readonly route$ = inject(ActivatedRoute);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(JOURNAL_I18N_KEYS) as JournalI18n;

  public readonly journalKey = input.required<string>();
  public readonly code = input.required<string>();

  protected readonly tiles = GIBS_BLUE_MARBLE;
  protected readonly view = signal<GuestJournalView | undefined>(undefined);
  protected readonly error = signal('');
  protected readonly selectedKey = signal<string | undefined>(undefined);
  protected readonly selected = computed(() => this.view()?.footprints.find((f) => f.key === this.selectedKey()));

  protected readonly pins = computed<RoutePin[]>(() => (this.view()?.footprints ?? [])
    .filter((f) => typeof f.latitude === 'number' && typeof f.longitude === 'number')
    .map((f) => ({ key: f.key, lat: f.latitude as number, lng: f.longitude as number, label: f.title, thumbnailUrl: this.thumbOf(f) })));
  protected readonly route = computed<[number, number][]>(() => (this.view()?.footprints ?? [])
    .flatMap((f) => f.blocks.flatMap((b) => b.photos))
    .filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number')
    .sort((a, b) => ((a.takenAt ?? '') < (b.takenAt ?? '') ? -1 : 1))
    .map((p) => [p.latitude as number, p.longitude as number] as [number, number]));
  /** Published footprints only (the guest view): a hidden draft merges into the next stretch. */
  protected readonly flyover = computed(() => {
    const footprints = (this.view()?.footprints ?? []).filter((f) => typeof f.latitude === 'number' && typeof f.longitude === 'number');
    const stops = footprints.map((f): FlyStop => ({
      key: f.key, lat: f.latitude as number, lng: f.longitude as number, at: stopTime(f.date, f.time), title: f.title,
      transport: f.transport, thumb: this.thumbOf(f),
    }));
    const points = (this.view()?.footprints ?? []).flatMap((f) => f.blocks.flatMap((b) => b.photos))
      .filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number')
      .map((p): FlyPoint => ({ lat: p.latitude as number, lng: p.longitude as number, at: p.takenAt ?? '' }));
    return flyoverTimeline(stops, points);
  });
  protected readonly hello = computed(() => fill(this.i18n.guest_hello(), { name: this.view()?.me.name ?? '' }));

  public constructor() {
    effect(() => {
      const journalKey = this.journalKey();
      const code = this.code();
      untracked(() => void this.start(journalKey, code));
    });
  }

  private async start(journalKey: string, code: string): Promise<void> {
    if (this.route$.snapshot.queryParamMap.get('mute') === '1') {
      await this.guestService.act(journalKey, code, 'mute').then(() => this.toast(this.i18n.guest_muted()), () => undefined);
    }
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      this.view.set(await this.guestService.view(this.journalKey(), this.code()));
      this.error.set('');
    } catch (error) {
      const { code } = guestErrorOf(error);
      this.error.set(code === 'permission-denied' || code === 'not-found' || code === 'invalid-argument' ? this.i18n.guest_link_invalid() : this.i18n.error_generic());
    }
  }

  protected async fly(): Promise<void> {
    const timeline = this.flyover();
    if (timeline) await openJournalFlyover(this.modalController, timeline, [GIBS_BLUE_MARBLE], this.i18n);
  }

  protected open(footprintKey: string): void {
    this.selectedKey.set(footprintKey);
  }

  protected thumbOf(fp: GuestFootprintView): string | undefined {
    return fp.blocks.flatMap((b) => b.photos)[0]?.thumb;
  }

  protected facts(fp: GuestFootprintView): string {
    const date = /^\d{8}$/.test(fp.date) ? `${fp.date.slice(6, 8)}.${fp.date.slice(4, 6)}.${fp.date.slice(0, 4)}` : '';
    return [date, fp.time, fp.placeName, weatherLine(weatherOf(fp.weather))].filter((x) => x).join(' · ');
  }

  protected counts(fp: GuestFootprintView): string {
    return [fp.likes > 0 ? `♥ ${fp.likes}` : '', fp.comments.length > 0 ? `💬 ${fp.comments.length}` : ''].filter((x) => x).join('  ');
  }

  protected comments(fp: GuestFootprintView): ReactionComment[] {
    return fp.comments; // `mine` from the server: guests delete their own comments (plan 8)
  }

  protected openPhoto(url: string): void {
    window.open(url, '_blank', 'noopener');
  }

  protected async toggleLike(fp: GuestFootprintView): Promise<void> {
    await this.act(fp.liked ? 'unlike' : 'like', { footprintKey: fp.key });
  }

  protected async writeComment(fp: GuestFootprintView): Promise<void> {
    const text = await okrPrompt(this.alertController, this.i18n.comment_write(), this.i18n.comment_prompt(), this.i18n.comment_send(), this.i18n.cancel());
    if (text?.trim()) await this.act('comment', { footprintKey: fp.key, text: text.trim() });
  }

  protected async deleteComment(commentKey: string): Promise<void> {
    await this.act('deleteComment', { commentKey });
  }

  protected async settings(): Promise<void> {
    const me = this.view()?.me;
    if (!me) return;
    const mark = (on: boolean) => (on ? '✓ ' : '');
    const sheet = await this.actionSheetController.create({
      header: this.i18n.guest_settings_title(),
      buttons: [
        { text: mark(me.channel === 'email') + this.i18n.guest_channel_email(), handler: () => void this.act('settings', { channel: 'email' }) },
        { text: mark(me.channel === 'signal') + this.i18n.guest_channel_signal(), handler: () => void this.act('settings', { channel: 'signal' }) },
        me.muted
          ? { text: this.i18n.guest_unmute(), handler: () => void this.act('unmute').then(() => this.toast(this.i18n.guest_unmuted())) }
          : { text: this.i18n.guest_mute(), handler: () => void this.act('mute').then(() => this.toast(this.i18n.guest_muted())) },
        { text: this.i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async act(action: Parameters<JournalGuestService['act']>[2], extra: Parameters<JournalGuestService['act']>[3] = {}): Promise<void> {
    try {
      await this.guestService.act(this.journalKey(), this.code(), action, extra);
      await this.load();
    } catch {
      await this.toast(this.i18n.error_generic());
    }
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 2500, position: 'bottom' });
    await toast.present();
  }
}
