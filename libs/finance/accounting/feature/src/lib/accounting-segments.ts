import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { IonLabel, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonToolbar } from '@ionic/angular';
import { filter, map } from 'rxjs';

import { AccountingSegment, resolveAccountingArea, segmentUrl } from '@okr/finance-accounting-util';
import { FeatureStore } from '@okr/tenant-feature';

import { AccountingStore } from './accounting.store';

/**
 * The work-area segment bar (spec 1.100 §4.3): a second toolbar inside a finance page's
 * <ion-header>. Reads the area from the router on every NavigationEnd — Ionic keeps the previous
 * page alive, so a value captured once would be stale when that page is shown again.
 * Renders nothing outside the accounting screens (e.g. /expense/my, /memberfees in other contexts).
 */
@Component({
  selector: 'okr-accounting-segments',
  imports: [IonToolbar, IonSegment, IonSegmentButton, IonLabel, IonSelect, IonSelectOption],
  styles: [`
    ion-select { min-width: 96px; font-weight: 600; }
  `],
  template: `
    @if (showBar()) {
      <ion-toolbar>
        @if (segments().length > 1) {
          <ion-segment [scrollable]="true" color="secondary" [value]="current()?.segment?.id" (ionChange)="onSegment($event)">
            @for (seg of segments(); track seg.id) {
              <ion-segment-button [value]="seg.id">
                <ion-label>{{ label(seg) }}</ion-label>
              </ion-segment-button>
            }
          </ion-segment>
        }
        @if (showSwitcher()) {
          <ion-select slot="end" interface="popover" [value]="books()" [aria-label]="store.i18n.nav_books()" (ionChange)="onBooks($event)">
            @for (b of store.availableBooks(); track b) {
              <ion-select-option [value]="b">{{ b.toUpperCase() }}</ion-select-option>
            }
          </ion-select>
        }
      </ion-toolbar>
    }
  `,
})
export class AccountingSegments {
  protected readonly store = inject(AccountingStore);
  private readonly router = inject(Router);
  private readonly featureStore = inject(FeatureStore);

  protected readonly current = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => resolveAccountingArea(e.urlAfterRedirects)),
    ),
    { initialValue: resolveAccountingArea(this.router.url) },
  );

  protected readonly segments = computed(() => {
    const effective = this.featureStore.effective();
    return (this.current()?.area.segments ?? []).filter(s => !s.featureBlock || effective.has(s.featureBlock));
  });

  /** books of the url, else the selection (books-less routes like /expense/all) */
  protected readonly books = computed(() => this.current()?.books || this.store.selectedBooks());

  protected readonly showSwitcher = computed(() =>
    this.store.availableBooks().length > 1 && this.current()?.segment.booksScoped !== false);

  protected readonly showBar = computed(() => !!this.current() && (this.segments().length > 1 || this.showSwitcher()));

  protected label(seg: AccountingSegment): string {
    return this.store.i18n[seg.i18nKey]();
  }

  protected async onSegment($event: CustomEvent): Promise<void> {
    const seg = this.segments().find(s => s.id === $event.detail.value);
    if (!seg || seg.id === this.current()?.segment.id) return;
    await this.router.navigateByUrl(segmentUrl(seg, this.books()));
  }

  protected async onBooks($event: CustomEvent): Promise<void> {
    const books = String($event.detail.value ?? '');
    const cur = this.current();
    if (!books || !cur || books === cur.books) return;
    await this.router.navigateByUrl(segmentUrl(cur.segment, books));
  }
}
