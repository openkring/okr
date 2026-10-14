import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonLabel, IonSegment, IonSegmentButton, IonToolbar } from '@ionic/angular';

import { AccountingSegment, segmentUrl } from '@okr/finance-accounting-util';
import { FeatureStore } from '@okr/tenant-feature';

import { AccountingStore } from './accounting.store';
import { injectAccountingRoute } from './accounting-route';

/**
 * The work-area segment bar (spec 1.100 §4.3): a second toolbar inside a finance page's
 * <ion-header>. Renders nothing outside the accounting screens (e.g. /expense/my) and for an area
 * with a single screen. The books are named in the title bar (`okr-accounting-books`) and switched
 * in the «Buchhaltung» menu.
 *
 * Each button navigates on its own click rather than on the segment's ionChange: ionChange fires
 * only when Ionic thinks the value changed, and a cached page's segment can already hold the tapped
 * value — the tap then did nothing and had to be repeated.
 *
 * The segment is re-created whenever the active screen changes instead of being given a new value:
 * Ionic keeps the previous page alive but hidden, and an ion-segment that changes value while hidden
 * animates its indicator from the old button by measuring zero-width buttons — the marker line stayed
 * on the old segment (Bankimport, Zahlungsaufträge, Spesen) while the page showed another screen.
 * A fresh segment draws its marker from the value, without measuring.
 */
@Component({
  selector: 'okr-accounting-segments',
  imports: [IonToolbar, IonSegment, IonSegmentButton, IonLabel],
  template: `
    @if (segments().length > 1) {
      <ion-toolbar>
        @for (activeId of [activeId()]; track activeId) {
          <ion-segment [scrollable]="true" color="secondary" [value]="activeId">
            @for (seg of segments(); track seg.id) {
              <ion-segment-button [value]="seg.id" (click)="go(seg)">
                <ion-label>{{ label(seg) }}</ion-label>
              </ion-segment-button>
            }
          </ion-segment>
        }
      </ion-toolbar>
    }
  `,
})
export class AccountingSegments {
  protected readonly store = inject(AccountingStore);
  private readonly router = inject(Router);
  private readonly featureStore = inject(FeatureStore);

  protected readonly current = injectAccountingRoute();
  /** the screen shown; the segment is re-created when it changes (see the class comment) */
  protected readonly activeId = computed(() => this.current()?.segment.id ?? '');

  /** books of the url, else the selection (books-less routes like /expense/all) */
  private readonly books = computed(() => this.current()?.books || this.store.selectedBooks());

  /**
   * The area's screens this tenant can use: a feature block that is off, VAT codes while the books are
   * not VAT-liable, and — without books — every books-scoped screen ('/accounting//…') are left out.
   */
  protected readonly segments = computed(() => {
    const effective = this.featureStore.effective();
    const books = this.books();
    const vatLiable = this.store.vatLiable();
    return (this.current()?.area.segments ?? [])
      .filter(s => !s.featureBlock || effective.has(s.featureBlock))
      .filter(s => !s.requiresVat || vatLiable)
      .filter(s => !s.booksScoped || !!books);
  });

  protected label(seg: AccountingSegment): string {
    return this.store.i18n[seg.i18nKey]();
  }

  protected async go(seg: AccountingSegment): Promise<void> {
    if (seg.id === this.current()?.segment.id) return;
    if (seg.booksScoped && !this.books()) return;
    await this.router.navigateByUrl(segmentUrl(seg, this.books()));
  }
}
