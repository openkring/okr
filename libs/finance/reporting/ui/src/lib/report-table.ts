import { Component, input, model, output } from '@angular/core';
import { IonCol, IonGrid, IonIcon, IonItem, IonList, IonRow } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { formatMinorAmount } from '@okr/finance-booking-util';
import { AccountBookingRow, ReportRow } from '@okr/finance-reporting-util';

/**
 * The body of a Bilanz / Erfolgsrechnung: one row per account, group, total or result line
 * (spec 2026-05-27 accounting design, Phase 5). Groups are indented by depth and toggle on tap,
 * a leaf account row opens the journal filtered by that account (as the Kontoplan does);
 * total and result rows are emphasised. Column widths mirror the page's header toolbar
 * (account number 2/12 · name 6/12 · current 2/12 · previous 2/12; the number hides on phones).
 * An account row with `details` (project result) gets a chevron and expands in place to its bookings.
 */
@Component({
  selector: 'okr-report-table',
  standalone: true,
  imports: [IonList, IonItem, IonGrid, IonRow, IonCol, IonIcon, SvgIconPipe],
  styles: [`
    ion-item.group { font-weight: 600; }
    ion-item.total, ion-item.result { font-weight: 700; border-top: 1px solid var(--ion-color-medium); }
    ion-item.result { color: var(--ion-color-primary); }
    ion-item.previous { color: var(--ion-color-medium); }
    .amount { font-variant-numeric: tabular-nums; }
    .previous { color: var(--ion-color-medium); }
    .chevron { font-size: 1rem; vertical-align: middle; margin-inline-end: 4px; }
    .spacer { display: inline-block; width: 1rem; }
    ion-item.booking { font-size: 0.875rem; color: var(--ion-color-medium-shade); }
    .booking-date { margin-inline-end: 8px; font-variant-numeric: tabular-nums; }
  `],
  template: `
    <ion-list lines="inset">
      @for (row of rows(); track row.okey) {
        @let bookings = detailsOf(row);
        <ion-item [button]="(interactive() && (row.hasChildren || row.kind === 'account')) || bookings.length > 0" [detail]="false" (click)="onRowClick(row)"
          [class]="row.kind" [style.padding-inline-start.px]="row.depth * 16">
          <ion-grid>
            <ion-row>
              <ion-col size-md="2" class="ion-hide-sm-down">{{ row.id }}</ion-col>
              <ion-col [attr.size]="showPrevious() ? 6 : 9" [attr.size-md]="showPrevious() ? 6 : 8">
                @if (row.hasChildren) {
                  <ion-icon class="chevron" src="{{ (row.isExpanded ? 'chevron-down' : 'chevron-forward') | svgIcon }}" />
                } @else if (bookings.length > 0) {
                  <ion-icon class="chevron" src="{{ (isOpen(row.okey) ? 'chevron-down' : 'chevron-forward') | svgIcon }}" />
                } @else if (row.kind === 'account') {
                  <span class="spacer"></span>
                }
                {{ row.name }}
              </ion-col>
              <ion-col size="3" size-md="2" class="ion-text-end amount">{{ format(row.current) }}</ion-col>
              @if (showPrevious()) {
                <ion-col size="3" size-md="2" class="ion-text-end amount previous">{{ format(row.previous) }}</ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-item>
        @if (bookings.length > 0 && isOpen(row.okey)) {
          @for (booking of bookings; track booking.bookingKey) {
            <ion-item class="booking" [style.padding-inline-start.px]="(row.depth + 1) * 16">
              <ion-grid>
                <ion-row>
                  <ion-col size-md="2" class="ion-hide-sm-down"></ion-col>
                  <ion-col [attr.size]="showPrevious() ? 6 : 9" [attr.size-md]="showPrevious() ? 6 : 8">
                    <span class="spacer"></span><span class="booking-date">{{ viewDate(booking.date) }}</span>{{ booking.title }}
                  </ion-col>
                  <ion-col size="3" size-md="2" class="ion-text-end amount">{{ format(booking.amount) }}</ion-col>
                </ion-row>
              </ion-grid>
            </ion-item>
          }
        }
      }
    </ion-list>
  `,
})
export class ReportTable {
  public readonly rows = input.required<ReportRow[]>();
  /** false drops the previous-year column (single-amount statements such as the project result). */
  public readonly showPrevious = input(true);
  /** false renders plain rows: no button look, no toggling, no account selection. */
  public readonly interactive = input(true);
  /** account okey → the bookings behind that row; such a row toggles open in place instead of emitting. */
  public readonly details = input<Map<string, AccountBookingRow[]>>(new Map());
  public readonly groupToggled = output<string>();
  /** A leaf account row was tapped: the page opens the journal filtered by this account and the selected year. */
  public readonly accountSelected = output<string>();

  /** account rows opened to their bookings; two-way bound, so a parent can print what is open. */
  public readonly openKeys = model<ReadonlySet<string>>(new Set());

  protected detailsOf(row: ReportRow): AccountBookingRow[] {
    return row.kind === 'account' ? (this.details().get(row.okey) ?? []) : [];
  }

  protected isOpen(okey: string): boolean {
    return this.openKeys().has(okey);
  }

  protected onRowClick(row: ReportRow): void {
    if (this.detailsOf(row).length > 0) {
      this.openKeys.update(keys => {
        const next = new Set(keys);
        if (!next.delete(row.okey)) next.add(row.okey);
        return next;
      });
      return;
    }
    if (!this.interactive()) return;
    if (row.hasChildren) this.groupToggled.emit(row.okey);
    else if (row.kind === 'account') this.accountSelected.emit(row.okey);
  }

  protected viewDate(storeDate: string): string {
    return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false) || storeDate;
  }

  protected format(minor: number): string {
    return formatMinorAmount(minor);
  }
}
