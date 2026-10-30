import { Component, model } from '@angular/core';
import { IonSelect, IonSelectOption } from '@ionic/angular';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@okr/shared-i18n';

/**
 * Narrows a selected year to one quarter: 0 = the whole year ('Alle'), 1–4 = Q1–Q4.
 * Used next to okr-year-select — the year is picked first, the quarter within it.
 */
@Component({
  selector: 'okr-quarter-select',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonSelect, IonSelectOption
  ],
  styles: [`
    /* same compact look as okr-year-select: value next to its caret, centred in the column */
    ion-select {
      width: fit-content;
      min-width: 100px;
      margin-inline: auto;
      --padding-start: 0;
      --padding-end: 0;
    }
    ion-select::part(label) { flex: none; }
    ion-select::part(icon) { margin-inline-start: 4px; }
  `],
  template: `
    <ion-select
      [value]="selectedQuarter()"
      (ionChange)="selectedQuarter.set($event.detail.value)"
      label="{{ '@shared/ui.quarter' | translate | async }}"
      label-placement="floating"
      interface="popover">
      <ion-select-option [value]="0">{{ '@shared/ui.allQuarters' | translate | async }}</ion-select-option>
      @for(quarter of quarters; track quarter) {
        <ion-select-option [value]="quarter">Q{{ quarter }}</ion-select-option>
      }
    </ion-select>
  `
})
export class QuarterSelect {
  public selectedQuarter = model<number>(0);   // default is the whole year

  protected readonly quarters = [1, 2, 3, 4];
}
