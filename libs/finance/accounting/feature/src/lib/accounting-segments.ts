import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { IonLabel, IonSegment, IonSegmentButton, IonToolbar } from '@ionic/angular';
import { filter, map } from 'rxjs';

import { AccountingSegment, resolveAccountingArea, segmentUrl } from '@okr/finance-accounting-util';
import { FeatureStore } from '@okr/tenant-feature';

import { AccountingStore } from './accounting.store';

/**
 * The work-area segment bar (spec 1.100 §4.3): a second toolbar inside a finance page's
 * <ion-header>. Reads the area from the router on every NavigationEnd — Ionic keeps the previous
 * page alive, so a value captured once would be stale when that page is shown again.
 * Renders nothing outside the accounting screens (e.g. /expense/my, /memberfees in other contexts).
 * The books are switched in the «Buchhaltung» menu (SelectedBooks); with several sets of books the
 * bar only names them, read-only, so the books stay visible with the sidebar closed (phone, iPad portrait).
 */
@Component({
  selector: 'okr-accounting-segments',
  imports: [IonToolbar, IonSegment, IonSegmentButton, IonLabel],
  styles: [`
    .books { margin-inline: 12px; padding: 2px 10px; border-radius: 12px; font-size: .85rem; font-weight: 600;
      background: var(--ion-color-light); color: var(--ion-color-light-contrast); }
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
        @if (showBooks()) {
          <span slot="end" class="books">{{ books().toUpperCase() }}</span>
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

  /** books of the url, else the selection (books-less routes like /expense/all) */
  protected readonly books = computed(() => this.current()?.books || this.store.selectedBooks());

  /** without books a books-scoped segment has no url ('/accounting//…'), so it is not offered */
  protected readonly segments = computed(() => {
    const effective = this.featureStore.effective();
    const books = this.books();
    return (this.current()?.area.segments ?? [])
      .filter(s => !s.featureBlock || effective.has(s.featureBlock))
      .filter(s => !s.booksScoped || !!books);
  });

  protected readonly showBooks = computed(() =>
    this.store.availableBooks().length > 1 && this.current()?.segment.booksScoped !== false);

  protected readonly showBar = computed(() => !!this.current() && (this.segments().length > 1 || this.showBooks()));

  protected label(seg: AccountingSegment): string {
    return this.store.i18n[seg.i18nKey]();
  }

  protected async onSegment($event: CustomEvent): Promise<void> {
    const seg = this.segments().find(s => s.id === $event.detail.value);
    if (!seg || seg.id === this.current()?.segment.id) return;
    if (seg.booksScoped && !this.books()) return;
    await this.router.navigateByUrl(segmentUrl(seg, this.books()));
  }
}
