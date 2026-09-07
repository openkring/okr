import { Component, computed, inject, input } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { IMAGE_CONFIG_SHAPE, IMAGE_STYLE_SHAPE, ImageConfig, ImageType } from '@okr/shared-models';
import { EmptyList, ImageGrid, openImageGallery, Spinner } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';

import { PublicGalleryImage, PublicGalleryService } from '@okr/content-document-data-access';

/**
 * A published album, readable without signing in — `/public/album/<slug>`.
 *
 * Deliberately NOT a variant of AlbumPage. The two look alike and share the thumbnail grid and
 * the full-screen viewer, but they differ where it counts: this one reads the publicApi (the only
 * source an anonymous visitor can read at all), addresses the folder by its public `name` SLUG
 * rather than its key, and offers no browsing into subfolders — a published gallery is exactly the
 * set of files someone put in it, and following folder links out of it would be a way to walk out
 * of what was published.
 */
@Component({
  selector: 'okr-public-album-page',
  standalone: true,
  imports: [
    Spinner, EmptyList, ImageGrid,
    IonHeader, IonToolbar, IonTitle, IonContent
  ],
  template: `
    @if(showMenu()) {
      <ion-header>
        <ion-toolbar color="secondary">
          <ion-title>{{ title() }}</ion-title>
        </ion-toolbar>
      </ion-header>
    }
    <ion-content>
      @if(isLoading()) {
        <okr-spinner />
      } @else if(hasError()) {
        <!-- an unpublished or unknown gallery 404s; say so plainly rather than showing an empty grid -->
        <okr-empty-list [message]="notFoundMessage" />
      } @else if(images().length === 0) {
        <okr-empty-list [message]="emptyMessage" />
      } @else {
        <okr-image-grid [images]="images()" [imageStyle]="imageStyle" [imgixBaseUrl]="imgixBaseUrl"
          [albumStyle]="albumStyle()" (imageClicked)="onImageClicked($event)" />
      }
    </ion-content>
  `
})
export class PublicAlbumPage {
  private readonly galleryService = inject(PublicGalleryService);
  private readonly modalController = inject(ModalController);
  private readonly route = inject(ActivatedRoute);
  private readonly env = inject(ENV);

  /** The folder's public `name` slug, e.g. 'paris' — not its document key. */
  public id = input.required<string>();

  private readonly queryParamMap = toSignal(this.route.queryParamMap);
  protected readonly showMenu = computed(() => coerceBoolean(this.queryParamMap()?.get('showMenu') ?? true));
  protected readonly albumStyle = computed(() => this.queryParamMap()?.get('style') || 'grid');

  protected readonly imgixBaseUrl = this.env.services.imgixBaseUrl;
  protected readonly imageStyle = IMAGE_STYLE_SHAPE;
  // Not i18n keys: this screen renders for anonymous visitors, before any tenant translation
  // scope is guaranteed to be loaded. Wire it to the store i18n once a public scope exists.
  protected readonly notFoundMessage = 'Diese Galerie gibt es nicht oder sie ist nicht veröffentlicht.';
  protected readonly emptyMessage = 'Diese Galerie enthält noch keine Bilder.';

  private readonly galleryResource = rxResource({
    params: () => ({ slug: this.id() }),
    stream: ({ params }) => params.slug
      ? this.galleryService.getGallery(this.env.tenantId, params.slug)
      : of(undefined)
  });

  protected readonly isLoading = computed(() => this.galleryResource.isLoading());
  protected readonly hasError = computed(() => this.galleryResource.error() != null);
  protected readonly title = computed(() => this.galleryResource.value()?.folder.title || this.id());
  protected readonly images = computed<ImageConfig[]>(() =>
    (this.galleryResource.value()?.images ?? []).map(toImageConfig));

  protected async onImageClicked(image: ImageConfig): Promise<void> {
    await openImageGallery(this.modalController, this.images(), image, this.imageStyle);
  }
}

/** The endpoint returns images only, so every entry is an ImageType.Image. */
function toImageConfig(image: PublicGalleryImage): ImageConfig {
  return {
    ...IMAGE_CONFIG_SHAPE,
    type: ImageType.Image,
    label: image.title,
    url: image.path,
    altText: image.altText || image.title,
    credit: image.credit
  };
}
