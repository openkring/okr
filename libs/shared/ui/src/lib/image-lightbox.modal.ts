import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import {
  IonButton, IonButtons, IonContent, IonHeader,
  IonIcon, IonTitle, IonToolbar, ModalController
} from '@ionic/angular/standalone';
import { dismissOverlay, downloadToBrowser } from '@okr/shared-util-angular';
import { SvgIconPipe } from '@okr/shared-pipes';

export interface LightboxImage {
  /** What to show right away — may be a scaled preview when `resolveFull` is given. */
  mediaUrl: string;
  filename: string;
  /**
   * Loads the full-resolution original ('' on failure). Called when the image is shown;
   * the original replaces `mediaUrl` on arrival and is what "download" saves.
   */
  resolveFull?: () => Promise<string>;
}

@Component({
  selector: 'okr-image-lightbox-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
    SvgIconPipe
  ],
  styles: [`
    ion-content { --background: #000; }
    .lightbox-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .lightbox-img--svg {
      background: #fff;
      padding: 16px;
      box-sizing: border-box;
    }
    ion-title { color: #fff; font-size: 0.9rem; }
  `],
  // Keyboard navigation: arrow keys and the literal < / > characters.
  host: { '(document:keydown)': 'onKeydown($event)' },
  template: `
    <ion-header>
      <ion-toolbar color="dark">
        @if (images().length > 1) {
          <ion-buttons slot="start">
            <ion-button (click)="prev()">
              <ion-icon slot="icon-only" src="{{'chevron-back' | svgIcon }}" />
            </ion-button>
          </ion-buttons>
        }
        <ion-title>
          {{ currentImage().filename }}
          @if (images().length > 1) { ({{ currentIndex() + 1 }}/{{ images().length }}) }
        </ion-title>
        <ion-buttons slot="end">
          @if (images().length > 1) {
            <ion-button (click)="next()">
              <ion-icon slot="icon-only" src="{{'chevron-forward' | svgIcon }}" />
            </ion-button>
          }
          <ion-button (click)="download()">
            <ion-icon slot="icon-only" src="{{'download' | svgIcon }}" />
          </ion-button>
          <ion-button (click)="close()">
            <ion-icon slot="icon-only" src="{{'cancel' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <img class="lightbox-img" [class.lightbox-img--svg]="isSvg()" [src]="displayUrl()" [alt]="currentImage().filename" />
    </ion-content>
  `
})
export class ImageLightboxModal {
  private readonly modalController = inject(ModalController);

  images = input.required<LightboxImage[]>();
  initialIndex = input.required<number>();

  protected currentIndex = linkedSignal(() => this.initialIndex());
  protected currentImage = computed(() => this.images()[this.currentIndex()]);
  protected isSvg = computed(() => this.currentImage().filename.toLowerCase().endsWith('.svg'));
  /** index → resolved original, filled in as each image is shown. */
  private readonly fullUrls = signal<ReadonlyMap<number, string>>(new Map());
  private readonly pendingFull = new Map<number, Promise<string>>();
  protected displayUrl = computed(() => this.fullUrls().get(this.currentIndex()) || this.currentImage().mediaUrl);

  constructor() {
    effect(() => { void this.loadFull(this.currentIndex()); });
  }

  /** Resolve the original of image `index` once; later calls share the same promise. */
  private loadFull(index: number): Promise<string> {
    const image = this.images()[index];
    if (!image?.resolveFull) return Promise.resolve(image?.mediaUrl ?? '');
    let pending = this.pendingFull.get(index);
    if (!pending) {
      pending = image.resolveFull().then(url => {
        if (url) this.fullUrls.update(prev => new Map(prev).set(index, url));
        else this.pendingFull.delete(index); // failed — the next view of this image tries again
        return url || image.mediaUrl;
      });
      this.pendingFull.set(index, pending);
    }
    return pending;
  }

  /** Previous image; wraps from the first to the last. */
  protected prev(): void {
    this.step(-1);
  }

  /** Next image; wraps from the last back to the first. */
  protected next(): void {
    this.step(1);
  }

  private step(delta: number): void {
    const count = this.images().length;
    if (count < 2) return;
    this.currentIndex.set((this.currentIndex() + delta + count) % count);
  }

  /**
   * ← / → and < / > browse the images. `<` and `>` are matched as characters, so they work
   * whichever key produces them (on the Swiss layout both share one key, `>` with Shift).
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'ArrowLeft' || event.key === '<') {
      event.preventDefault();
      this.prev();
    } else if (event.key === 'ArrowRight' || event.key === '>') {
      event.preventDefault();
      this.next();
    }
  }

  protected async download(): Promise<void> {
    const url = await this.loadFull(this.currentIndex());
    if (url) await downloadToBrowser(url);
  }

  protected async close(): Promise<void> {
    await dismissOverlay(this.modalController);
  }
}
