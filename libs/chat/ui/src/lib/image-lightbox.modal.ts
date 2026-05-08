import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import {
  IonButton, IonButtons, IonContent, IonHeader,
  IonIcon, IonTitle, IonToolbar, ModalController
} from '@ionic/angular/standalone';
import { downloadToBrowser } from '@bk2/shared-util-angular';
import { SvgIconPipe } from '@bk2/shared-pipes';

export interface LightboxImage {
  mediaUrl: string;
  filename: string;
}

@Component({
  selector: 'bk-image-lightbox-modal',
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
    ion-title { color: #fff; font-size: 0.9rem; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="dark">
        @if (images().length > 1) {
          <ion-buttons slot="start">
            <ion-button [disabled]="currentIndex() === 0" (click)="prev()">
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
            <ion-button [disabled]="currentIndex() === images().length - 1" (click)="next()">
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
      <img class="lightbox-img" [src]="currentImage().mediaUrl" [alt]="currentImage().filename" />
    </ion-content>
  `
})
export class ImageLightboxModal {
  private readonly modalController = inject(ModalController);

  images = input.required<LightboxImage[]>();
  initialIndex = input.required<number>();

  protected currentIndex = linkedSignal(() => this.initialIndex());
  protected currentImage = computed(() => this.images()[this.currentIndex()]);

  protected prev(): void {
    if (this.currentIndex() > 0) this.currentIndex.set(this.currentIndex() - 1);
  }

  protected next(): void {
    if (this.currentIndex() < this.images().length - 1) this.currentIndex.set(this.currentIndex() + 1);
  }

  protected async download(): Promise<void> {
    await downloadToBrowser(this.currentImage().mediaUrl);
  }

  protected async close(): Promise<void> {
    await this.modalController.dismiss();
  }
}
