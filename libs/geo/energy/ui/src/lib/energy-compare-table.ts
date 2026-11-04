import { Component, computed, input } from '@angular/core';

import { EnergyCompareRow, formatCompareTariff, formatDecimal, formatShare } from '@okr/energy-util';

/** Column headers, already translated. Put the unit into the header (e.g. «Aktueller Tarif (Rp./kWh)»). */
export type EnergyCompareLabels = {
  municipality: string;
  solarPotential: string;
  renewableHeating: string;
  electricCars: string;
  electricityPerPerson: string;
  tariff: string;
};

type DisplayRow = { name: string; cells: (string | undefined)[] };

/**
 * Comparison of municipalities, relative figures only. The first row is the main municipality.
 * A missing value shows `noDataLabel`, never 0 or a dash. On a phone the table scrolls sideways and
 * the municipality column stays in place. Formatting is done by the util (Intl de-CH), not here.
 * A tariff that stands in for a not yet published year carries that year in its cell.
 */
@Component({
  selector: 'okr-energy-compare-table',
  imports: [],
  styles: [`
    .scroll { overflow-x: auto; }
    table { border-collapse: collapse; min-width: 40rem; width: 100%; color: var(--ion-text-color); }
    th, td { padding: 0.5rem 0.75rem; text-align: right; border-bottom: 1px solid var(--ion-color-step-150); white-space: nowrap; }
    thead th { font-size: 0.8125rem; color: var(--ion-color-step-600); font-weight: 600; white-space: normal; vertical-align: bottom; }
    th.name { position: sticky; left: 0; text-align: left; background: var(--ion-background-color); min-width: 8rem; }
    tbody th.name { font-weight: 600; }
    .missing { color: var(--ion-color-step-600); font-style: italic; }
  `],
  template: `
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th class="name" scope="col">{{ labels().municipality }}</th>
            <th scope="col">{{ labels().solarPotential }}</th>
            <th scope="col">{{ labels().renewableHeating }}</th>
            <th scope="col">{{ labels().electricCars }}</th>
            <th scope="col">{{ labels().electricityPerPerson }}</th>
            <th scope="col">{{ labels().tariff }}</th>
          </tr>
        </thead>
        <tbody>
          @for (row of displayRows(); track $index) {
            <tr>
              <th class="name" scope="row">{{ row.name }}</th>
              @for (cell of row.cells; track $index) {
                @if (cell !== undefined) {
                  <td>{{ cell }}</td>
                } @else {
                  <td class="missing">{{ noDataLabel() }}</td>
                }
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `
})
export class EnergyCompareTable {
  // inputs
  public rows = input.required<EnergyCompareRow[]>();
  public labels = input.required<EnergyCompareLabels>();
  public noDataLabel = input.required<string>();

  protected readonly displayRows = computed<DisplayRow[]>(() =>
    this.rows().map((row) => ({
      name: row.name,
      cells: [
        formatShare(row.solarPotentialUsage),
        formatShare(row.renewableHeatingShare),
        formatShare(row.electricCarShare),
        formatDecimal(row.elecPerCapitaMwh),
        formatCompareTariff(row.tariff)
      ]
    }))
  );
}
