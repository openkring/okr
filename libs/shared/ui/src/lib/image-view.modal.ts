import { provideImgixLoader } from '@angular/common';
import { Component, HostListener, computed, inject, input, linkedSignal } from '@angular/core';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';

import { ImageConfig, ImageStyle } from '@okr/shared-models';
import { ENV } from '@okr/shared-config';
import { SvgIconPipe } from '@okr/shared-pipes';
import { getImgixUrl, getSizedImgixParamsByExtension } from '@okr/shared-util-core';

import { Header } from './header';

@Component({
  selector: 'okr-image-view-modal',
  standalone: true,
  imports: [
    Header, SvgIconPipe,
    IonContent, IonButton, IonIcon
  ],
  providers: [
    provideImgixLoader('https://bkaiser.imgix.net')
  ],
  styles: [`
    .image-container {
      position: relative;
      max-width: 600px;
      max-height: 80dvh;
      margin: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
    }
    .image-container img {
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain
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
    .counter {
      position: absolute;
      bottom: 0.5rem;
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
      <okr-header [i18n]="{ title: title() }" [isModal]="true" />
      <ion-content>
          <div class="image-container">
            @if (hasMultiple()) {
              <ion-button class="nav-button prev" fill="solid" color="light" (click)="prev()" aria-label="Previous image">
                <ion-icon slot="icon-only" src="{{ 'chevron-back' | svgIcon }}" />
              </ion-button>
            }
            <img [src]="imgixUrl()"
              [alt]="currentAltText()"
              style="max-width: 100%; max-height: 100%; object-fit: contain;"
            />
            @if (hasMultiple()) {
              <ion-button class="nav-button next" fill="solid" color="light" (click)="next()" aria-label="Next image">
                <ion-icon slot="icon-only" src="{{ 'chevron-forward' | svgIcon }}" />
              </ion-button>
              <div class="counter">{{ currentIndex() + 1 }} / {{ gallery().length }}</div>
            }
          </div>
      </ion-content>
  `
})
export class ImageViewModal {
  private env = inject(ENV);

  // inputs
  // Single-image entry point (kept for callers that zoom one image).
  public url = input('');
  public altText = input('');
  public title = input('');
  public style = input.required<ImageStyle>();
  // Gallery entry point: when more than one image is passed, prev/next navigation
  // (buttons + ArrowLeft/ArrowRight) pages through the list, wrapping at both ends.
  public images = input<ImageConfig[]>([]);
  public startIndex = input(0);

  // passing constants to the template
  protected imgixBaseUrl = this.env.services.imgixBaseUrl;

  // The effective list to page through: the gallery when provided, otherwise the single image.
  protected gallery = computed<{ url: string; altText: string }[]>(() => {
    const images = this.images();
    if (images.length > 0) return images.map((img) => ({ url: img.url, altText: img.altText ?? '' }));
    return [{ url: this.url(), altText: this.altText() }];
  });
  protected hasMultiple = computed(() => this.gallery().length > 1);

  // Writable, seeded once from startIndex (a static input); user navigation writes it directly.
  protected currentIndex = linkedSignal(() => this.startIndex());

  protected current = computed(() => this.gallery()[this.currentIndex()] ?? this.gallery()[0]);
  protected currentUrl = computed(() => this.current().url);
  protected currentAltText = computed(() => this.current().altText);

  // computed
  protected width = computed(() => this.style().width ?? '160');
  protected height = computed(() => this.style().height ?? '90');

  protected imgixUrl = computed(() => {
    const params = getSizedImgixParamsByExtension(this.currentUrl(), this.width(), this.height());
    const prefix = this.currentUrl().startsWith('/') ? this.imgixBaseUrl : this.imgixBaseUrl + '/';
    return prefix + getImgixUrl(this.currentUrl(), params);
  });

  protected next(): void {
    const count = this.gallery().length;
    this.currentIndex.set((this.currentIndex() + 1) % count);
  }

  protected prev(): void {
    const count = this.gallery().length;
    this.currentIndex.set((this.currentIndex() - 1 + count) % count);
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
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
