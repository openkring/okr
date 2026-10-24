import { Component, computed, DestroyRef, effect, ElementRef, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonPopover, ModalController, ToastController } from '@ionic/angular';

import { ENV } from '@okr/shared-config';
import { AdventDoor, AdventSection, IMAGE_STYLE_SHAPE, ImageConfig } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ImgDirective, showImageSlider } from '@okr/shared-ui';
import { showToast } from '@okr/shared-util-angular';
import { fill, getImgixUrlWithAutoParams } from '@okr/shared-util-core';
import {
  adventImageName, adventLinkKind, adventStorageKey, coverBox, isDoorUnlocked, openDoorsOnLoad, parseOpenedUpTo,
  resolveAdventBackground, SECTION_I18N_KEYS
} from '@okr/cms-section-util';

/** imgix widths are bucketed so a resize does not refetch the background for every pixel */
const BG_WIDTH_STEP = 400;
const BG_MAX_WIDTH = 2400;
const DOOR_THUMB_PARAMS = 'w=400&h=400&fit=crop&auto=format,compress';

/**
 * Advent calendar (spec 1.119): 25 doors cut out of a full-height background image. Door n opens
 * from n December (device-local date); an opened door shows its thumbnail (the app logo while the
 * door has no image), a tap on that follows the link or shows the image full-screen with its overlay. The highest door a user has opened is
 * kept in localStorage, so the doors stay open on the next visit.
 *
 * With several backgrounds every user picks their own (the button top right); the choice is kept in
 * localStorage, the section's `backgroundUrl` is only the default. The preview (toggled from the
 * page's context menu, read-only mode only) unlocks every door regardless of the date and remembers nothing.
 *
 * The cut-out: the cover box of the background (size + offset, as `background-size: cover` would
 * place it) is computed here and every door paints the same image shifted by its own offset.
 * `background-attachment: fixed` would be simpler but is broken on iOS Safari.
 */
@Component({
  selector: 'okr-advent-section',
  standalone: true,
  imports: [ImgDirective, SvgIconPipe, IonButton, IonIcon, IonPopover, IonList, IonItem, IonLabel],
  styles: [`
    :host { display: block; }
    .advent {
      position: relative; overflow: hidden; width: 100%;
      height: calc(100dvh - 56px - var(--ion-safe-area-top, 0px));
      min-height: 420px;
      background-color: var(--ion-color-primary);
      background-repeat: no-repeat;
    }
    .title {
      position: absolute; top: 3%; left: 0; right: 0; margin: 0; padding: 0 16px; z-index: 2;
      text-align: center; color: #fff; font-size: clamp(1.8rem, 6vmin, 4rem); font-weight: 700; line-height: 1.1;
      text-shadow: 0 2px 6px rgba(0, 0, 0, 0.7), 0 0 2px rgba(0, 0, 0, 0.9);
    }
    .bg-select { position: absolute; top: 8px; right: 8px; z-index: 3; margin: 0; max-width: calc(100% - 16px);
      text-transform: none; --background: rgba(0, 0, 0, 0.35); --background-hover: rgba(0, 0, 0, 0.5); --color: #fff; }
    .bg-select span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .door {
      position: absolute; padding: 0; margin: 0; border: none; background: none; cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .door:focus-visible { outline: 3px solid var(--ion-color-warning); outline-offset: 2px; }
    .door.locked { cursor: default; }
    .frame {
      position: relative; width: 100%; height: 100%; perspective: 900px; border-radius: 4px;
      border: 2px solid rgba(255, 255, 255, 0.85);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5), inset 0 0 10px rgba(0, 0, 0, 0.55);
    }
    .inside { position: absolute; inset: 0; overflow: hidden; border-radius: 2px; background: #2a1d14; }
    .inside img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .inside img.logo { object-fit: contain; padding: 12%; box-sizing: border-box; background: #fff; }
    .leaf {
      position: absolute; inset: 0; transform-origin: left center; transform-style: preserve-3d;
      transition: transform 600ms cubic-bezier(0.3, 0.7, 0.4, 1);
    }
    .face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 2px; }
    .front {
      display: flex; align-items: center; justify-content: center; background-repeat: no-repeat;
      outline: 1px dashed rgba(255, 255, 255, 0.55); outline-offset: -5px;
    }
    .back { transform: rotateY(180deg); background: #6b4a33; box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.5); }
    .num {
      color: #fff; font-weight: 800; font-size: clamp(1.1rem, 4.5vmin, 2.8rem); line-height: 1;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8), 0 0 2px rgba(0, 0, 0, 0.9);
    }
    .locked .num { opacity: 0.65; }
    .open .leaf { transform: rotateY(-105deg); pointer-events: none; }
    .instant .leaf { transition: none; }
    .shake { animation: shake 400ms ease; }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .leaf { transition: opacity 300ms ease; }
      .open .leaf { transform: none; opacity: 0; }
      .shake { animation: none; }
    }
  `],
  template: `
    @if(section(); as section) {
      <div #container class="advent"
        [style.background-image]="backgroundCss()"
        [style.background-size]="backgroundSize()"
        [style.background-position]="backgroundPosition()">
        @if(section.properties.showTitle && section.title) {
          <h1 class="title">{{ section.title }}</h1>
        }
        @if(backgrounds().length > 1) {
          <ion-button class="bg-select" size="small" [attr.aria-label]="i18n.advent_background()" (click)="openBackgrounds($event)">
            <span>{{ backgroundName() }}</span>
            <ion-icon slot="end" src="{{'chevron-down' | svgIcon }}" />
          </ion-button>
          <ion-popover [isOpen]="backgroundsOpen()" [event]="backgroundsEvent()" (didDismiss)="backgroundsOpen.set(false)">
            <ng-template>
              <ion-list lines="none">
                @for(img of otherBackgrounds(); track img.url) {
                  <ion-item button [detail]="false" (click)="chooseBackground(img.url)">
                    <ion-label>{{ imageName(img) }}</ion-label>
                  </ion-item>
                }
              </ion-list>
            </ng-template>
          </ion-popover>
        }
        @for(door of doors(); track door.day) {
          <button type="button" class="door"
            [class.open]="isOpen(door.day)" [class.locked]="!isUnlocked(door.day)"
            [class.instant]="instant().has(door.day)" [class.shake]="shaking() === door.day"
            [style.left.%]="door.x" [style.top.%]="door.y" [style.width.%]="door.w" [style.height.%]="door.h"
            [attr.aria-label]="doorLabel(door.day)"
            (click)="onDoorClick(door)">
            <div class="frame">
              <div class="inside">
                @if(isOpen(door.day)) {
                  @if(door.image.url) {
                    <img okrImg [src]="thumbnailUrl(door)" [alt]="door.image.altText || doorLabel(door.day)" />
                  } @else if(logoUrl()) {
                    <!-- a door nobody configured yet shows the app logo -->
                    <img okrImg class="logo" [src]="logoUrl()" [alt]="doorLabel(door.day)" />
                  }
                }
              </div>
              <div class="leaf">
                <div class="face front"
                  [style.background-image]="backgroundCss()"
                  [style.background-size]="backgroundSize()"
                  [style.background-position]="doorBackgroundPosition(door)">
                  <span class="num">{{ door.day }}</span>
                </div>
                <div class="face back"></div>
              </div>
            </div>
          </button>
        }
      </div>
    }
  `
})
export class AdventSectionComponent {
  private readonly appStore = inject(AppStore);
  private readonly env = inject(ENV);
  private readonly router = inject(Router);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);

  protected readonly i18n = inject(I18nService).translateAll({
    advent_locked: SECTION_I18N_KEYS.advent_locked,
    advent_background: SECTION_I18N_KEYS.advent_background_label,
    advent_door: SECTION_I18N_KEYS.advent_door,
  });

  // inputs
  public section = input<AdventSection>();
  public editMode = input(false);

  private readonly container = viewChild<ElementRef<HTMLElement>>('container');
  private readonly imgixBaseUrl = this.env.services.imgixBaseUrl;

  // state
  /** preview: every door can be opened regardless of the date; toggled by the hosting page */
  public readonly preview = signal(false);
  private readonly chosenBackgroundUrl = signal<string | undefined>(undefined); // this user's choice
  protected readonly backgroundsOpen = signal(false);
  protected readonly backgroundsEvent = signal<Event | undefined>(undefined);
  private readonly today = signal(new Date());
  private readonly opened = signal(new Set<number>());
  protected readonly instant = signal(new Set<number>()); // opened from storage: shown open without animation
  protected readonly shaking = signal<number | undefined>(undefined);
  private readonly containerSize = signal({ width: 0, height: 0 });
  private readonly imageSize = signal({ width: 0, height: 0 });
  private readonly requestWidth = signal(0); // only grows, see backgroundUrl

  // derived values
  private readonly year = computed(() => this.section()?.properties.year ?? new Date().getFullYear());
  protected readonly doors = computed(() => this.section()?.properties.doors ?? []);
  protected readonly backgrounds = computed(() => (this.section()?.properties.backgrounds ?? []).filter(img => !!img.url));
  private readonly storageKey = computed(() => {
    const section = this.section();
    if (!section) return '';
    return adventStorageKey(this.appStore.tenantId(), section.okey, this.year(), this.appStore.fbUser()?.uid);
  });
  private readonly backgroundKey = computed(() => this.storageKey() ? `${this.storageKey()}.bg` : '');
  private readonly background = computed(() =>
    resolveAdventBackground(this.backgrounds(), this.chosenBackgroundUrl() ?? this.section()?.properties.backgroundUrl));
  private readonly backgroundUrl = computed(() => {
    const url = this.background()?.url ?? '';
    const width = this.requestWidth();
    if (!url || width === 0) return '';
    if (/^https?:\/\//.test(url)) return url;
    return `${this.imgixBaseUrl}/${url}?w=${width}&auto=format,compress`;
  });
  private readonly cover = computed(() => {
    const c = this.containerSize();
    const i = this.imageSize();
    return coverBox(c.width, c.height, i.width, i.height);
  });
  /** same derivation as the login page: the tenant logo through imgix */
  protected readonly logoUrl = computed(() => {
    const logo = this.appStore.appConfig()?.logoUrl;
    return logo ? `${this.imgixBaseUrl}/${getImgixUrlWithAutoParams(logo)}` : '';
  });
  protected readonly backgroundName = computed(() => {
    const bg = this.background();
    return bg ? adventImageName(bg) : '';
  });
  /** the dropdown lists the backgrounds the user can switch to, not the current one */
  protected readonly otherBackgrounds = computed(() => this.backgrounds().filter(img => img.url !== this.background()?.url));
  protected readonly backgroundCss = computed(() => this.backgroundUrl() ? `url("${this.backgroundUrl()}")` : 'none');
  protected readonly backgroundSize = computed(() => {
    const cover = this.cover();
    return cover ? `${cover.width}px ${cover.height}px` : 'cover';
  });
  protected readonly backgroundPosition = computed(() => {
    const cover = this.cover();
    return cover ? `${cover.offsetX}px ${cover.offsetY}px` : 'center';
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    // the date moves on while the page stays open (a calendar left open overnight)
    const timer = setInterval(() => this.today.set(new Date()), 60_000);
    destroyRef.onDestroy(() => clearInterval(timer));

    // measure the section; the background request width only grows, in steps
    effect((onCleanup) => {
      const el = this.container()?.nativeElement;
      if (!el || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        this.containerSize.set({ width, height });
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const wanted = Math.min(BG_MAX_WIDTH, Math.ceil((Math.max(width, height * 0.75) * dpr) / BG_WIDTH_STEP) * BG_WIDTH_STEP);
        if (wanted > untracked(() => this.requestWidth())) this.requestWidth.set(wanted);
      });
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    });

    // the natural size of the background drives the cut-out geometry
    effect((onCleanup) => {
      const url = this.backgroundUrl();
      if (!url || typeof Image === 'undefined') return;
      const img = new Image();
      img.onload = () => this.imageSize.set({ width: img.naturalWidth, height: img.naturalHeight });
      img.src = url;
      onCleanup(() => { img.onload = null; });
    });

    // restore the doors the user opened before
    effect(() => {
      const key = this.storageKey();
      if (!key) return;
      untracked(() => this.restoreOpened(key));
    });

    // the door interactions would get in the way of editing the section: no preview in edit mode
    effect(() => {
      if (this.editMode()) untracked(() => this.setPreview(false));
    });

    // restore the background the user chose before (a background since removed falls back to the default)
    effect(() => {
      const key = this.backgroundKey();
      if (!key) return;
      const stored = this.readStorage(key) ?? undefined;
      untracked(() => this.chosenBackgroundUrl.set(stored));
    });
  }

  /** Switches the preview; leaving it closes the doors that only the preview could open. */
  public setPreview(preview: boolean): void {
    if (preview === this.preview()) return;
    this.preview.set(preview);
    if (!preview && this.storageKey()) this.restoreOpened(this.storageKey());
  }

  private restoreOpened(key: string): void {
    const stored = parseOpenedUpTo(this.readStorage(key));
    const open = openDoorsOnLoad(stored, this.year(), this.today());
    this.opened.set(open);
    this.instant.set(new Set(open));
  }

  /*-------------------------- door state --------------------------------*/
  protected isUnlocked(day: number): boolean {
    return this.preview() || isDoorUnlocked(day, this.year(), this.today());
  }

  protected isOpen(day: number): boolean {
    return this.opened().has(day);
  }

  protected doorLabel(day: number): string {
    return fill(this.i18n.advent_door(), { d: day });
  }

  protected thumbnailUrl(door: AdventDoor): string {
    const url = door.image.url;
    if (!url || /^https?:\/\//.test(url)) return url;
    return `${this.imgixBaseUrl}/${url}?${DOOR_THUMB_PARAMS}`;
  }

  /** the door paints the background shifted by its own position, so its slice lines up */
  protected doorBackgroundPosition(door: AdventDoor): string {
    const cover = this.cover();
    const size = this.containerSize();
    if (!cover) return 'center';
    const left = (door.x / 100) * size.width;
    const top = (door.y / 100) * size.height;
    return `${cover.offsetX - left}px ${cover.offsetY - top}px`;
  }

  /*-------------------------- actions --------------------------------*/
  protected async onDoorClick(door: AdventDoor): Promise<void> {
    this.today.set(new Date());
    if (!this.isUnlocked(door.day)) {
      this.shake(door.day);
      await showToast(this.toastController, fill(this.i18n.advent_locked(), { d: door.day }));
      return;
    }
    if (!this.isOpen(door.day)) {
      this.opened.update(open => new Set(open).add(door.day));
      this.instant.update(set => { const next = new Set(set); next.delete(door.day); return next; });
      if (!this.preview()) this.remember(door.day);
      return;
    }
    await this.showDoorContent(door);
  }

  private async showDoorContent(door: AdventDoor): Promise<void> {
    const image = door.image;
    switch (adventLinkKind(image.actionUrl)) {
      case 'internal':
        await this.router.navigateByUrl(image.actionUrl.trim());
        return;
      case 'external':
        window.open(image.actionUrl.trim(), '_blank', 'noopener');
        return;
      default:
        if (!image.url) return;
        await showImageSlider(this.modalController, [image], { ...IMAGE_STYLE_SHAPE }, 0);
    }
  }

  protected imageName(img: ImageConfig): string {
    return adventImageName(img);
  }

  protected openBackgrounds(event: Event): void {
    this.backgroundsEvent.set(event);
    this.backgroundsOpen.set(true);
  }

  protected chooseBackground(url: string): void {
    this.backgroundsOpen.set(false);
    this.chosenBackgroundUrl.set(url);
    this.writeStorage(this.backgroundKey(), url);
  }

  private shake(day: number): void {
    this.shaking.set(day);
    setTimeout(() => { if (this.shaking() === day) this.shaking.set(undefined); }, 450);
  }

  /*-------------------------- storage --------------------------------*/
  private remember(day: number): void {
    const key = this.storageKey();
    if (!key) return;
    const stored = parseOpenedUpTo(this.readStorage(key));
    if (day <= stored) return;
    this.writeStorage(key, String(day));
  }

  private writeStorage(key: string, value: string): void {
    if (!key) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // private mode or blocked storage: the choice is simply not remembered
    }
  }

  private readStorage(key: string): string | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    } catch {
      return null;
    }
  }
}
