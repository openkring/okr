import { Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController, IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar,
  ModalController, ToastController,
} from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';

import { MapView, RouteMap, RoutePin } from '@okr/shared-ui';
import { FootprintEditModal } from '@okr/travel-journal-ui';
import {
  FootprintFormModel, flyoverInputOf, flyoverTimeline, footprintChips, journalMapData, newFootprintFormModel, routeLengthKm,
} from '@okr/travel-journal-util';

import { JournalFileUrlService } from './journal-file-url.service';
import { showJournalError } from './journal-errors';
import { openJournalFlyover } from './journal-flyover-open';
import { openJournalInfo } from './journal-info';
import { choosePhotoMode } from './journal-photo-mode';
import { JournalOfflineMap } from './journal-offline-map';
import { JournalSyncLine } from './journal-sync-line';
import { JournalStore } from './journal.store';

/** Wide screens (iPad landscape, desktop) get layout B — Ionic's `lg` breakpoint, spec 1.113 §9.1. */
const WIDE_QUERY = '(min-width: 992px)';

/**
 * The journal overview (spec 1.113 §9.1): stat cards, the route map with photo pins and the footprint
 * cards. Layout A (narrow) stacks map over cards; layout B (wide) shows a full-height map with a drawer.
 */
@Component({
  selector: 'okr-journal-overview-page',
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonCard, IonCardContent, IonIcon, SvgIconPipe, RouteMap, JournalSyncLine, JournalOfflineMap],
  styles: [`
    .layout { display: flex; flex-direction: column; height: 100%; }
    .layout.wide { flex-direction: row; }
    .map { height: 45%; min-height: 260px; position: relative; }
    .wide .map { height: 100%; flex: 1; }
    .side { flex: 1; overflow-y: auto; padding: 8px; }
    .wide .side { flex: 0 0 36%; max-width: 420px; border-left: 1px solid var(--ion-color-light); }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px; }
    .stat { text-align: center; padding: 6px 2px; border-radius: 8px; background: var(--ion-color-light); }
    .stat b { display: block; font-size: 1.2rem; }
    .stat span { font-size: 0.75rem; color: var(--ion-color-medium); }
    .card { display: flex; gap: 10px; align-items: center; margin: 6px 0; cursor: pointer; }
    .card.selected { outline: 2px solid var(--ion-color-tertiary); }
    .thumb { width: 64px; height: 64px; border-radius: 8px; object-fit: cover; background: var(--ion-color-light); flex: none; }
    .card h3 { margin: 0 0 2px; font-size: 1rem; }
    .card p { margin: 0; font-size: 0.8rem; color: var(--ion-color-medium); }
    .badge { font-size: 0.7rem; padding: 1px 6px; border-radius: 8px; background: var(--ion-color-light); }
    .empty { color: var(--ion-color-medium); padding: 12px 4px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/journal" /></ion-buttons>
        <ion-title>{{ journal()?.title || store.i18n.untitled() }}</ion-title>
        <ion-buttons slot="end">
          @if (flyover()) { <ion-button (click)="fly()">{{ store.i18n.flyover() }}</ion-button> }
          <ion-button (click)="info()" [attr.aria-label]="store.i18n.info()"><ion-icon slot="icon-only" src="{{ 'info-circle' | svgIcon }}" /></ion-button>
          @if (store.native()) { <ion-button (click)="newFootprint()">{{ store.i18n.footprints_new() }}</ion-button> }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content [scrollY]="!wide()">
      <div class="layout" [class.wide]="wide()">
        <div class="map">
          <okr-route-map [route]="map().route" [pins]="pins()" [selectedKey]="selectedKey()" [tiles]="mapLayers()"
            (pinClicked)="openFootprint($event)" (viewChanged)="view.set($event)" />
        </div>
        <div class="side">
          @if (store.native()) {
            <okr-journal-sync-line [status]="store.syncStatus()" [photoMode]="store.photoMode()" [peerStatus]="store.peerStatus()" [i18n]="store.i18n"
              (syncNow)="store.syncNow()" (choosePhotoMode)="photoMode()" />
            <okr-journal-offline-map [journalKey]="journalKey()" [view]="view()" />
          }
          <div class="stats">
            <div class="stat"><b>{{ days() }}</b><span>{{ store.i18n.stats_days() }}</span></div>
            <div class="stat"><b>{{ km() }}</b><span>{{ store.i18n.stats_km() }}</span></div>
            <div class="stat"><b>{{ footprints().length }}</b><span>{{ store.i18n.stats_footprints() }}</span></div>
            <div class="stat"><b>{{ images().size }}</b><span>{{ store.i18n.stats_photos() }}</span></div>
          </div>
          @for (card of cards(); track card.key) {
            <ion-card class="card" [class.selected]="card.key === selectedKey()" (click)="openFootprint(card.key)">
              <ion-card-content class="card">
                @if (card.thumbnail) { <img class="thumb" [src]="card.thumbnail" alt="" /> } @else { <div class="thumb"></div> }
                <div>
                  <h3>{{ card.title || store.i18n.untitled() }}</h3>
                  <p>{{ card.facts }}</p>
                  <span class="badge">{{ card.published ? store.i18n.story_published() : store.i18n.story_draft() }}</span>
                </div>
              </ion-card-content>
            </ion-card>
          } @empty {
            <p class="empty">{{ store.i18n.footprints_empty() }}</p>
          }
        </div>
      </div>
    </ion-content>
  `,
})
export class JournalOverviewPage {
  protected readonly store = inject(JournalStore);
  private readonly fileUrl = inject(JournalFileUrlService);
  private readonly router = inject(Router);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly actionSheetController = inject(ActionSheetController);

  public readonly journalKey = input.required<string>();

  protected readonly selectedKey = signal<string | undefined>(undefined);
  protected readonly view = signal<MapView | undefined>(undefined);
  protected readonly mapLayers = computed(() => this.store.mapLayersFor(this.journalKey()));
  protected readonly wide = signal(typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches);

  protected readonly journal = computed(() => this.store.journals().find((j) => j.key === this.journalKey()));
  protected readonly footprints = computed(() => this.store.footprints(this.journalKey()));
  protected readonly images = computed(() => this.store.images(this.journalKey()));
  protected readonly map = computed(() => journalMapData(this.footprints(), this.images()));
  protected readonly pins = computed<RoutePin[]>(() =>
    this.map().pins.map((p) => ({ key: p.key, lat: p.lat, lng: p.lng, label: p.label, thumbnailUrl: this.fileUrl.url(p.imagePath) })));
  protected readonly flyover = computed(() => {
    const { stops, points } = flyoverInputOf(this.footprints(), this.images(), (path) => this.fileUrl.url(path) ?? '');
    return flyoverTimeline(stops, points);
  });
  protected readonly km = computed(() => routeLengthKm(this.map().route));
  protected readonly days = computed(() => new Set(this.footprints().map((f) => f.date).filter((d) => d !== '')).size);
  protected readonly cards = computed(() => {
    const images = this.images();
    return this.footprints().map((f) => {
      const firstKey = f.blocks.find((b) => b.kind === 'photos')?.imageKeys?.find((k) => images.has(k));
      return {
        key: f.key,
        title: f.title,
        facts: footprintChips(f).join(' · '),
        published: f.publishState === 'published',
        thumbnail: this.fileUrl.url(firstKey ? images.get(firstKey)?.path400 : undefined),
      };
    });
  });

  public constructor() {
    void this.store.init();
    // the journal on screen is the one the other iPad syncs with (P2P, plan 5)
    effect(() => {
      const journalKey = this.journalKey();
      untracked(() => void this.store.openJournal(journalKey));
    });
    if (typeof window !== 'undefined') {
      const query = window.matchMedia(WIDE_QUERY);
      const listener = (e: MediaQueryListEvent) => this.wide.set(e.matches);
      query.addEventListener('change', listener);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', listener));
    }
  }

  protected info(): Promise<void> {
    return openJournalInfo(this.modalController);
  }

  protected async fly(): Promise<void> {
    const timeline = this.flyover();
    if (timeline) await openJournalFlyover(this.modalController, timeline, this.mapLayers(), this.store.i18n);
  }

  protected photoMode(): Promise<void> {
    return choosePhotoMode(this.actionSheetController, this.store.i18n, this.store.photoMode(), (mode) => this.store.setPhotoMode(mode));
  }

  protected openFootprint(footprintKey: string): void {
    this.selectedKey.set(footprintKey);
    void this.router.navigate(['/journal', this.journalKey(), footprintKey]);
  }

  protected async newFootprint(): Promise<void> {
    const modal = await this.modalController.create({
      component: FootprintEditModal, componentProps: { footprint: newFootprintFormModel() }, cssClass: 'auto-height-modal',
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<FootprintFormModel>();
    if (role !== 'confirm' || !data) return;
    try {
      const key = await this.store.addFootprint(this.journalKey(), data.title);
      await this.store.saveFootprintForm(key, data);
      this.openFootprint(key);
    } catch (error) {
      await showJournalError(this.toastController, this.store.i18n, error);
    }
  }
}
