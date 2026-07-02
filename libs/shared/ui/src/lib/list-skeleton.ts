import { Component, computed, input } from '@angular/core';
import { IonItem, IonLabel, IonList, IonSkeletonText } from '@ionic/angular/standalone';

/**
 * Placeholder list shown while data is loading. Renders `rows` skeleton items so the
 * list area has structure (no layout jump) instead of an empty container or a spinner.
 *
 * Usage:
 *   @if (isLoading()) { <okr-list-skeleton [rows]="6" /> } @else { ...real list... }
 */
@Component({
  selector: 'okr-list-skeleton',
  standalone: true,
  imports: [IonList, IonItem, IonLabel, IonSkeletonText],
  template: `
    <ion-list>
      @for (row of rowArray(); track $index) {
        <ion-item>
          <ion-label>
            <ion-skeleton-text [animated]="true" style="width: 80%" />
          </ion-label>
        </ion-item>
      }
    </ion-list>
  `
})
export class OkrListSkeleton {
  /** Number of skeleton rows to render. */
  public rows = input(6);
  protected rowArray = computed(() => Array.from({ length: this.rows() }));
}
