import { Component, computed, inject, input } from '@angular/core';
import { IonContent, IonNote, ModalController } from '@ionic/angular';

import { ENV } from '@okr/shared-config';
import { ImageConfig } from '@okr/shared-models';
import { Header, ImgDirective } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { fill, IMGIX_THUMBNAIL_PARAMS } from '@okr/shared-util-core';
import { ArticleEditorI18n } from '@okr/cms-section-util';

/**
 * «Aus diesem Artikel» (spec 1.175 §7.6): picks one of the pictures already used in the article. Dismisses with a copy of its
 * ImageConfig and the role 'confirm'. A picker without a form, like image-layout-select.modal.
 */
@Component({
  selector: 'okr-article-image-pick-modal',
  standalone: true,
  imports: [Header, ImgDirective, IonContent, IonNote],
  styles: [`
    /* modal-fit takes the width of this grid: up to four columns of 120px, no wider than the screen */
    .choices { display: grid; grid-template-columns: repeat(var(--columns), 120px); gap: 12px; padding: 16px; max-width: 100%; box-sizing: border-box; }
    @media (width < 768px) { .choices { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); } }
    .pick { display: block; width: 100%; padding: 0; border: 1px solid var(--ion-color-light-shade); border-radius: 6px; overflow: hidden; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; }
    .pick:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; }
    .pick img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; background: var(--ion-color-light); }
    .name { display: block; padding: 6px 8px; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .empty { padding: 16px; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n().article_editor_image_fromArticle() }" [isModal]="true" />
    <ion-content>
      @if (images().length === 0) {
        <div class="empty"><ion-note>{{ i18n().article_editor_image_pickEmpty() }}</ion-note></div>
      } @else {
        <div class="choices" [style.--columns]="columns()">
          @for (image of images(); track image.url) {
            <button type="button" class="pick" [attr.aria-label]="pickLabel(image, $index)" (click)="select(image)">
              <img okrImg [src]="thumbnailUrl(image)" alt="" />
              <span class="name">{{ nameOf(image, $index) }}</span>
            </button>
          }
        </div>
      }
    </ion-content>
  `,
})
export class ArticleImagePickModal {
  private readonly modalController = inject(ModalController);
  private readonly imgixBaseUrl = inject(ENV).services.imgixBaseUrl;

  // inputs
  public readonly images = input.required<ImageConfig[]>();
  public readonly i18n = input.required<ArticleEditorI18n>();

  protected readonly columns = computed(() => Math.min(Math.max(this.images().length, 1), 4));

  protected nameOf(image: ImageConfig, index: number): string {
    return image.altText || image.label || fill(this.i18n().article_editor_image_unnamed(), { n: index + 1 });
  }

  protected pickLabel(image: ImageConfig, index: number): string {
    return fill(this.i18n().article_editor_image_pickOne(), { name: this.nameOf(image, index) });
  }

  protected thumbnailUrl(image: ImageConfig): string {
    return image.url.startsWith('http') ? image.url : `${this.imgixBaseUrl}/${image.url}?${IMGIX_THUMBNAIL_PARAMS}`;
  }

  public async select(image: ImageConfig): Promise<boolean> {
    return await dismissOverlay(this.modalController, { ...image }, 'confirm');
  }
}

/** Opens the picker; the chosen picture, or undefined. With a single picture there is nothing to choose: it is taken without a dialog. */
export async function pickArticleImage(modalController: ModalController, images: ImageConfig[], i18n: ArticleEditorI18n): Promise<ImageConfig | undefined> {
  if (images.length === 1) return { ...images[0] };
  const modal = await modalController.create({ component: ArticleImagePickModal, cssClass: 'modal-fit', componentProps: { images, i18n } });
  await modal.present();
  const { data, role } = await modal.onWillDismiss<ImageConfig>();
  return role === 'confirm' ? data : undefined;
}
