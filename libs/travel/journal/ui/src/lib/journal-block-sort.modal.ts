import { Component, computed, inject, input, signal } from '@angular/core';
import { IonContent, IonItem, IonReorder, IonReorderGroup, ItemReorderEventDetail, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { arrayMove } from '@okr/shared-util-core';
import { JOURNAL_I18N_KEYS, JournalI18n } from '@okr/travel-journal-util';

export interface SortableBlock { key: string; label: string }

/** Re-orders the blocks of a footprint; dismisses with the ordered keys and role 'confirm' (modelled on the CMS page-sort modal). */
@Component({
  selector: 'okr-journal-block-sort-modal',
  standalone: true,
  imports: [Header, IonContent, IonReorderGroup, IonReorder, IonItem],
  template: `
    <okr-header [i18n]="{ title: i18n.sort_title() }" [isModal]="true" [showOkButton]="true" (okClicked)="save()" />
    <ion-content>
      <!-- Casting $event to $any is a temporary fix for https://github.com/ionic-team/ionic-framework/issues/24245 -->
      <ion-reorder-group [disabled]="false" (ionItemReorder)="reorder($any($event))">
        @for (block of ordered(); track block.key) {
          <ion-item>
            {{ block.label }}
            <ion-reorder slot="start" />
          </ion-item>
        }
      </ion-reorder-group>
    </ion-content>
  `,
})
export class JournalBlockSortModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(JOURNAL_I18N_KEYS) as JournalI18n;

  /** The blocks in their current order. */
  public readonly blocks = input.required<SortableBlock[]>();

  /** The order being edited; starts as `blocks`. */
  protected readonly order = signal<string[] | undefined>(undefined);
  protected readonly ordered = computed<SortableBlock[]>(() => {
    const blocks = this.blocks();
    const order = this.order();
    if (!order) return blocks;
    const byKey = new Map(blocks.map((b) => [b.key, b]));
    return order.map((k) => byKey.get(k)).filter((b): b is SortableBlock => !!b);
  });

  protected reorder(ev: CustomEvent<ItemReorderEventDetail>): void {
    const keys = this.ordered().map((b) => b.key);
    arrayMove(keys, ev.detail.from, ev.detail.to);
    // completes the gesture in Ionic's DOM; the signal then re-renders in the same order
    ev.detail.complete();
    this.order.set(keys);
  }

  public save(): Promise<boolean> {
    return dismissOverlay(this.modalController, this.ordered().map((b) => b.key), 'confirm');
  }
}
