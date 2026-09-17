import { Component, input, output } from '@angular/core';
import { IonCol, IonGrid, IonIcon, IonItem, IonList, IonRow } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { formatMinorAmount } from '@okr/finance-booking-util';
import { ReportRow } from '@okr/finance-reporting-util';

/**
 * The body of a Bilanz / Erfolgsrechnung: one row per account, group, total or result line
 * (spec 2026-05-27 accounting design, Phase 5). Groups are indented by depth and toggle on tap,
 * a leaf account row opens the journal filtered by that account (as the Kontoplan does);
 * total and result rows are emphasised. Column widths mirror the page's header toolbar
 * (account number 2/12 · name 6/12 · current 2/12 · previous 2/12; the number hides on phones).
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
  `],
  template: `
    <ion-list lines="inset">
      @for (row of rows(); track row.okey) {
        <ion-item [button]="row.hasChildren || row.kind === 'account'" [detail]="false" (click)="onRowClick(row)"
          [class]="row.kind" [style.padding-inline-start.px]="row.depth * 16">
          <ion-grid>
            <ion-row>
              <ion-col size-md="2" class="ion-hide-sm-down">{{ row.id }}</ion-col>
              <ion-col size="6" size-md="6">
                @if (row.hasChildren) {
                  <ion-icon class="chevron" src="{{ (row.isExpanded ? 'chevron-down' : 'chevron-forward') | svgIcon }}" />
                } @else if (row.kind === 'account') {
                  <span class="spacer"></span>
                }
                {{ row.name }}
              </ion-col>
              <ion-col size="3" size-md="2" class="ion-text-end amount">{{ format(row.current) }}</ion-col>
              <ion-col size="3" size-md="2" class="ion-text-end amount previous">{{ format(row.previous) }}</ion-col>
            </ion-row>
          </ion-grid>
        </ion-item>
      }
    </ion-list>
  `,
})
export class ReportTable {
  public readonly rows = input.required<ReportRow[]>();
  public readonly groupToggled = output<string>();
  /** A leaf account row was tapped: the page opens the journal filtered by this account and the selected year. */
  public readonly accountSelected = output<string>();

  protected onRowClick(row: ReportRow): void {
    if (row.hasChildren) this.groupToggled.emit(row.okey);
    else if (row.kind === 'account') this.accountSelected.emit(row.okey);
  }

  protected format(minor: number): string {
    return formatMinorAmount(minor);
  }
}
