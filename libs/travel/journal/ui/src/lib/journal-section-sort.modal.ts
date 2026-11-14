import { Component, computed, inject, input, signal } from '@angular/core';
import { IonContent, IonItem, IonReorder, IonReorderGroup, ItemReorderEventDetail, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { arrayMove } from '@okr/shared-util-core';
import { JOURNAL_I18N_KEYS, JournalI18n } from '@okr/travel-journal-util';

export interface SortableSection { key: string; label: string }

/** Re-orders the sections of a footprint; dismisses with the ordered keys and role 'confirm' (modelled on the CMS page-sort modal). */
@Component({
  selector: 'okr-journal-section-sort-modal',
  standalone: true,
  imports: [Header, IonContent, IonReorderGroup, IonReorder, IonItem],
  template: `
    <okr-header [i18n]="{ title: i18n.sort_title() }" [isModal]="true" [showOkButton]="true" (okClicked)="save()" />
    <ion-content>
      <!-- Casting $event to $any is a temporary fix for https://github.com/ionic-team/ionic-framework/issues/24245 -->
      <ion-reorder-group [disabled]="false" (ionItemReorder)="reorder($any($event))">
        @for (section of ordered(); track section.key) {
          <ion-item>
            {{ section.label }}
            <ion-reorder slot="start" />
          </ion-item>
        }
      </ion-reorder-group>
    </ion-content>
  `,
})
export class JournalSectionSortModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(JOURNAL_I18N_KEYS) as JournalI18n;

  /** The sections in their current order. */
  public readonly sections = input.required<SortableSection[]>();

  /** The order being edited; starts as `sections`. */
  protected readonly order = signal<string[] | undefined>(undefined);
  protected readonly ordered = computed<SortableSection[]>(() => {
    const sections = this.sections();
    const order = this.order();
    if (!order) return sections;
    const byKey = new Map(sections.map((s) => [s.key, s]));
    return order.map((k) => byKey.get(k)).filter((s): s is SortableSection => !!s);
  });

  protected reorder(ev: CustomEvent<ItemReorderEventDetail>): void {
    const keys = this.ordered().map((s) => s.key);
    arrayMove(keys, ev.detail.from, ev.detail.to);
    // completes the gesture in Ionic's DOM; the signal then re-renders in the same order
    ev.detail.complete();
    this.order.set(keys);
  }

  public save(): Promise<boolean> {
    return dismissOverlay(this.modalController, this.ordered().map((s) => s.key), 'confirm');
  }
}
