import { ChangeDetectionStrategy, Component, computed, inject, input, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonContent, IonGrid, IonRow, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { ImageLayoutId, imageLayoutsFor, resolveImageLayout, SECTION_I18N_KEYS, SectionI18n } from '@okr/cms-section-util';

import { ImageLayoutPreview } from './image-layout-preview';

/** Mosaic and big-grid read well with six pictures; more adds nothing to the thumbnail. */
const MAX_PREVIEW_COUNT = 6;

/** `big-small` → `bigSmall`, the suffix of the SECTION_I18N_KEYS names. */
const keyOf = (id: ImageLayoutId): string => id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

/**
 * Picker for the layout of the images of an article: a card per layout that fits `count` images,
 * each with a schematic preview, its name and a one-line description. The layout that renders today
 * (the stored one resolved for `count`) is highlighted. Dismisses with the layout id and role 'confirm'.
 * A selection dialog without a stored form, like card-select.modal.
 */
@Component({
  selector: 'okr-image-layout-select-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Header, ImageLayoutPreview, IonContent, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCardSubtitle],
  styles: [`
    ion-card { margin: 0; }
    ion-card.current { outline: 2px solid var(--ion-color-primary); outline-offset: -2px; }
    ion-card-content { padding-top: 0; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.layout_title() }" [isModal]="true" />
    <ion-content>
      <ion-grid>
        <ion-row>
          @for (id of layouts(); track id) {
            <ion-col size="6" size-md="3">
              <ion-card button="true" [class.current]="id === resolved()" [attr.aria-current]="id === resolved() ? 'true' : null" (click)="select(id)">
                <ion-card-header>
                  <ion-card-title>{{ text(id, 'label')() }}</ion-card-title>
                  <ion-card-subtitle>{{ text(id, 'description')() }}</ion-card-subtitle>
                </ion-card-header>
                <ion-card-content>
                  <okr-image-layout-preview [layout]="id" [count]="previewCount()" [label]="text(id, 'label')()" />
                </ion-card-content>
              </ion-card>
            </ion-col>
          }
        </ion-row>
      </ion-grid>
    </ion-content>
  `,
})
export class ImageLayoutSelectModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: only the labels are needed
  protected readonly i18n = inject(I18nService).translateAll(SECTION_I18N_KEYS) as SectionI18n;

  // inputs
  /** number of images of the article */
  public readonly count = input.required<number>();
  /** the stored layout id (absent = slider) */
  public readonly current = input<string | undefined>(undefined);

  // derived
  protected readonly layouts = computed(() => imageLayoutsFor(this.count()));
  protected readonly resolved = computed(() => resolveImageLayout(this.current(), this.count()));
  protected readonly previewCount = computed(() => Math.min(this.count(), MAX_PREVIEW_COUNT));

  protected text(id: ImageLayoutId, part: 'label' | 'description'): Signal<string> {
    return (this.i18n as unknown as Record<string, Signal<string>>)[`layout_${keyOf(id)}_${part}`];
  }

  public async select(id: ImageLayoutId): Promise<boolean> {
    return await dismissOverlay(this.modalController, id, 'confirm');
  }
}
