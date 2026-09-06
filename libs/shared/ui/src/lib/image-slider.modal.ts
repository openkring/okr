import { Component, HostListener, computed, inject, input, linkedSignal } from '@angular/core';
import { IonButton, IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';

import { ImageConfig, ImageStyle } from '@okr/shared-models';
import { ENV } from '@okr/shared-config';
import { SvgIconPipe } from '@okr/shared-pipes';
import { buildOverlayText, getImgixUrl } from '@okr/shared-util-core';
import { dismissOverlay } from '@okr/shared-util-angular';

/**
 * Full-screen, edge-to-edge image slider overlay (ImageActionType.OpenSlider).
 *
 * Unlike the framed {@link ImageViewModal} zoom, this is an immersive dark overlay with minimal
 * chrome: a floating close button, prev/next chevrons and a counter. The image is shown with its
 * original proportions (`object-fit: contain`) — the whole image is always visible, letterboxed
 * against black. Navigation: prev/next buttons, ArrowLeft/ArrowRight keys; Escape closes.
 */
@Component({
  selector: 'okr-image-slider-modal',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonContent, IonButton, IonIcon
  ],
  styles: [`
    ion-content {
      --background: #000;
    }
    .slider-container {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
    }
    .slider-container img {
      max-width: 100%;
      max-height: 100dvh;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    .close-button {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      z-index: 20;
      --border-radius: 50%;
      --padding-start: 0;
      --padding-end: 0;
      width: 44px;
      height: 44px;
    }
    .nav-button {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      z-index: 10;
      --border-radius: 50%;
      --padding-start: 0;
      --padding-end: 0;
      width: 44px;
      height: 44px;
    }
    .nav-button.prev { left: 0.5rem; }
    .nav-button.next { right: 0.5rem; }
    .caption {
      position: absolute;
      left: 0; right: 0; bottom: 0;
      z-index: 10;
      padding: 10px 16px 2.75rem;
      font-size: 0.8rem;
      line-height: 1.25;
      color: #fff;
      white-space: pre-line;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
      background: linear-gradient(to top, rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0));
      pointer-events: none;
    }
    .counter {
      position: absolute;
      bottom: 0.75rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
      padding: 2px 10px;
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.55);
      color: #fff;
      font-size: 0.8rem;
    }
  `],
  template: `
      <ion-content [fullscreen]="true">
        <div class="slider-container">
          <ion-button class="close-button" fill="solid" color="light" (click)="close()" aria-label="Close">
            <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
          </ion-button>
          @if (hasMultiple()) {
            <ion-button class="nav-button prev" fill="solid" color="light" (click)="prev()" aria-label="Previous image">
              <ion-icon slot="icon-only" src="{{ 'chevron-back' | svgIcon }}" />
            </ion-button>
          }
          <img [src]="imgixUrl()" [alt]="currentAltText()" />
          @if (caption(); as caption) {
            <div class="caption">{{ caption }}</div>
          }
          @if (hasMultiple()) {
            <ion-button class="nav-button next" fill="solid" color="light" (click)="next()" aria-label="Next image">
              <ion-icon slot="icon-only" src="{{ 'chevron-forward' | svgIcon }}" />
            </ion-button>
            <div class="counter">{{ currentIndex() + 1 }} / {{ images().length }}</div>
          }
        </div>
      </ion-content>
  `
})
export class ImageSliderModal {
  private env = inject(ENV);
  private modalController = inject(ModalController);

  // inputs
  public images = input.required<ImageConfig[]>();
  public startIndex = input(0);
  // drives the caption: showTitle/showSource decide whether label/credit are rendered
  public style = input.required<ImageStyle>();

  // passing constants to the template
  protected imgixBaseUrl = this.env.services.imgixBaseUrl;

  protected hasMultiple = computed(() => this.images().length > 1);

  // Writable, seeded once from startIndex (a static input); user navigation writes it directly.
  protected currentIndex = linkedSignal(() => this.startIndex());

  protected current = computed(() => this.images()[this.currentIndex()] ?? this.images()[0]);
  protected currentAltText = computed(() => this.current()?.altText ?? '');
  // title/credit caption of the current image, rendered as DOM over the letterboxed image
  protected caption = computed(() => {
    const image = this.current();
    return image ? buildOverlayText(image, this.style()) : '';
  });

  // Full-screen view: request the whole image (fit=max, no aspect-ratio crop) up to a large
  // width; `object-fit: contain` then letterboxes it. Prepend the imgix base URL only for
  // storage paths ('tenant/...') — external/asset/imgix URLs are already absolute.
  protected imgixUrl = computed(() => {
    const url = getImgixUrl(this.current()?.url ?? '', 'auto=format,compress,enhance&fit=max&w=2400');
    return url.startsWith('tenant') ? this.imgixBaseUrl + '/' + url : url;
  });

  protected next(): void {
    const count = this.images().length;
    this.currentIndex.set((this.currentIndex() + 1) % count);
  }

  protected prev(): void {
    const count = this.images().length;
    this.currentIndex.set((this.currentIndex() - 1 + count) % count);
  }

  protected close(): void {
    dismissOverlay(this.modalController);
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close();
      event.preventDefault();
      return;
    }
    if (!this.hasMultiple()) return;
    if (event.key === 'ArrowRight') {
      this.next();
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      this.prev();
      event.preventDefault();
    }
  }
}
