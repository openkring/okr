import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonLabel, IonMenuButton, IonPopover, IonSegment, IonSegmentButton,
  IonTitle, IonToolbar,
} from '@ionic/angular';

import { Menu, MenuItemsStore } from '@okr/cms-menu-feature';
import { NEWS_SEGMENTS, NewsSegment } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { contextMenuId } from '@okr/shared-util-core';
import { NewsChannelList, NewsChannelSheet, NewsGrid, NewsWebcamView } from '@okr/social-news-center-ui';

import { toNewsSegment } from './news-center.service';
import { NewsCenterStore } from './news-center.store';

/**
 * NewsCenter — `/private/news-center/:segment` (design 2026-11-08 §5). One tab per segment (video,
 * audio, text, webcam) bound to the url; channels on the left from 768 px, below that a chip that
 * opens the channel sheet; then the grid.
 *
 * The context menu name is FIXED (`c-news-center`), not a route segment: the segment is the tab.
 * Its one row «Einstellungen» is a `call` item that dismisses the popover with 'settings'.
 */
@Component({
  selector: 'okr-news-center-page',
  standalone: true,
  imports: [
    SvgIconPipe, Menu, NewsChannelList, NewsChannelSheet, NewsGrid, NewsWebcamView,
    IonHeader, IonToolbar, IonButtons, IonButton, IonMenuButton, IonTitle, IonIcon, IonPopover, IonContent,
    IonSegment, IonSegmentButton, IonLabel, IonChip,
  ],
  providers: [NewsCenterStore],
  styles: [`
    .layout { display: flex; align-items: flex-start; }
    .channels { display: none; }
    .main { flex: 1; min-width: 0; }
    .filter { padding: 8px 8px 0; }
    .webcam { padding: 16px; }
    @media (min-width: 768px) {
      .channels { display: block; flex: 0 0 260px; position: sticky; top: 0; max-height: 100%; overflow-y: auto;
        border-right: 1px solid var(--ion-color-light-shade); }
      .filter { display: none; }
    }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.i18n.title() }}</ion-title>
        <ion-buttons slot="end">
          @if (menuItemsStore.canOpen(contextMenuName)) {
            <ion-button id="{{ popupId }}">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"
              (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName" />
                </ion-content>
              </ng-template>
            </ion-popover>
          }
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="store.segment()" (ionChange)="onSegmentChange($event.detail.value)">
          @for (s of segments; track s) {
            <ion-segment-button [value]="s"><ion-label>{{ segmentLabel(s) }}</ion-label></ion-segment-button>
          }
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="layout">
        <aside class="channels">
          <okr-news-channel-list [channels]="store.channels()" [selectedKey]="store.activeKey()" [failedKeys]="store.failedKeys()" [avatars]="store.avatars()"
            [i18n]="store.i18n" (selected)="store.select($event)" />
        </aside>
        <div class="main">
          <div class="filter">
            <ion-chip (click)="sheetOpen.set(true)">
              <ion-label>{{ selectedName() }}</ion-label>
              <ion-icon src="{{ 'chevron-down' | svgIcon }}" />
            </ion-chip>
          </div>
          @if (singleWebcam(); as cam) {
            <!-- one camera selected: its image full width right in the page, no modal -->
            <okr-news-webcam-view class="webcam" [imageUrl]="cam.imageUrl" [capturedAt]="cam.capturedAt"
              [i18n]="store.i18n" />
          } @else {
            <okr-news-grid [items]="store.visibleItems()" [channels]="store.channels()" [avatars]="store.avatars()" [segment]="store.segment()"
              [loading]="store.isLoading()" [i18n]="store.i18n" (opened)="store.openItem($event)" />
          }
        </div>
      </div>
      <okr-news-channel-sheet [open]="sheetOpen()" [channels]="store.channels()" [selectedKey]="store.activeKey()"
        [failedKeys]="store.failedKeys()" [avatars]="store.avatars()" [i18n]="store.i18n" (selected)="store.select($event)" (closed)="sheetOpen.set(false)" />
    </ion-content>
  `,
})
export class NewsCenterPage {
  protected readonly store = inject(NewsCenterStore);
  protected readonly menuItemsStore = inject(MenuItemsStore);
  private readonly router = inject(Router);

  /** route param (withComponentInputBinding); unknown values show the video tab */
  public readonly segment = input<string>();

  protected readonly contextMenuName = 'c-news-center';
  protected readonly popupId = contextMenuId('c_news_center');
  protected readonly segments: NewsSegment[] = NEWS_SEGMENTS;
  protected readonly sheetOpen = signal(false);

  protected readonly selectedName = computed(() => {
    const key = this.store.activeKey();
    return key === 'all' ? this.store.i18n.all_channels() : (this.store.channels().find((c) => c.okey === key)?.name ?? this.store.i18n.all_channels());
  });

  /**
   * The webcam tab with ONE camera selected shows that camera full width in the page. The item comes
   * from the store, so it follows the camera's refreshMinutes timer like the detail modal does.
   */
  protected readonly singleWebcam = computed(() => {
    if (this.store.segment() !== 'webcam' || this.store.activeKey() === 'all') return undefined;
    const item = this.store.visibleItems()[0];
    if (!item) return undefined;
    return { imageUrl: item.mediaUrl ?? '', capturedAt: item.publishedAt ? new Date(item.publishedAt) : null };
  });

  constructor() {
    effect(() => {
      const segment = toNewsSegment(this.segment());
      untracked(() => this.store.setSegment(segment));
    });
  }

  /** Ionic lifecycle: the page stays alive in the stack when navigating away, so its timers must pause. */
  public ionViewDidEnter(): void {
    this.store.setActive(true);
  }

  public ionViewWillLeave(): void {
    this.store.setActive(false);
  }

  protected segmentLabel(segment: NewsSegment): string {
    return this.store.i18n[`segment_${segment}`]();
  }

  protected async onSegmentChange(value: string | number | undefined | null): Promise<void> {
    const segment = toNewsSegment(value === undefined || value === null ? undefined : String(value));
    if (segment === this.store.segment()) return;
    this.store.setSegment(segment);
    await this.router.navigate(['/private/news-center', segment], { replaceUrl: true });
  }

  protected async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape)
    switch (selectedMethod) {
      case 'settings': await this.store.openSettings(); break;
      default: console.warn(`NewsCenterPage.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }
}
