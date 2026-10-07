import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { CoiffeurRow, JassConfig, JassI18n, JassVariant, jassConfigValidations } from '@okr/games-jasstafel-util';
import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { ErrorNote, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';

/**
 * The settings of the start screen, only those of the chosen variant: `section='main'` shows the
 * target (Schieber), the opponents' target and the bid (Büter) or the number of hands
 * (Differenzler); `section='rows'` shows the Coiffeur rows, placed below «Starten».
 * Rows are label + multiplier pairs: an emptied label removes a row, typing into the blank last
 * row adds one; the order follows the multiplier.
 * Rows are label + multiplier pairs: an emptied label removes a row, typing into the blank last
 * row adds one; the order follows the multiplier.
 */
@Component({
  selector: 'okr-jass-settings-form',
  standalone: true,
  imports: [IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol, NumberInput, TextInput, ErrorNote],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        @if (section() === 'main' && variant() !== 'coiffeur') {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  @switch (variant()) {
                    @case ('schieber') {
                      <ion-col size="12" size-md="6">
                        <okr-number-input [i18n]="schieberI18n()" [value]="formData().schieberTarget"
                          (valueChange)="set('schieberTarget', $event)" [integer]="true" [readOnly]="false" />
                        <okr-error-note [errors]="schieberTargetErrors()" />
                      </ion-col>
                    }
                    @case ('bueter') {
                      <ion-col size="6">
                        <okr-number-input [i18n]="bueterI18n()" [value]="formData().bueterPairTarget"
                          (valueChange)="set('bueterPairTarget', $event)" [integer]="true" [readOnly]="false" />
                        <okr-error-note [errors]="bueterPairTargetErrors()" />
                      </ion-col>
                      <ion-col size="6">
                        <okr-number-input [i18n]="bidI18n()" [value]="formData().bueterBid"
                          (valueChange)="set('bueterBid', $event)" [integer]="true" [readOnly]="false" />
                        <okr-error-note [errors]="bueterBidErrors()" />
                      </ion-col>
                    }
                    @case ('differenzler') {
                      <ion-col size="12" size-md="6">
                        <okr-number-input [i18n]="handsI18n()" [value]="formData().differenzlerHands"
                          (valueChange)="set('differenzlerHands', $event)" [integer]="true" [readOnly]="false" />
                        <okr-error-note [errors]="differenzlerHandsErrors()" />
                      </ion-col>
                    }
                  }
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }
        @if (section() === 'rows') {
          <ion-card>
            <ion-card-header><ion-card-title>{{ i18n().rows_title() }}</ion-card-title></ion-card-header>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                @for (row of editableRows(); track $index; let i = $index) {
                  <ion-row>
                    <ion-col size="8">
                      <okr-text-input [i18n]="rowLabelI18n()" [value]="row.label"
                        (valueChange)="setRow(i, 'label', $event)" [maxLength]="shortNameLength" [readOnly]="false" />
                    </ion-col>
                    <ion-col size="4">
                      <okr-number-input [i18n]="rowMultI18n()" [value]="row.multiplier"
                        (valueChange)="setRow(i, 'multiplier', $event)" [integer]="true" [readOnly]="false" />
                    </ion-col>
                  </ion-row>
                }
                <ion-row><ion-col size="12"><okr-error-note [errors]="coiffeurRowsErrors()" /></ion-col></ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }
      </form>
    }
  `,
})
export class JassSettingsForm {
  public readonly i18n = input.required<JassI18n>();
  public readonly formData = model.required<JassConfig>();
  public readonly variant = input.required<JassVariant>();
  public readonly section = input<'main' | 'rows'>('main');
  public readonly showForm = input(true);
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  /** kept in step with the row label cap */
  protected readonly shortNameLength = SHORT_NAME_LENGTH;

  protected readonly settingsForm = form(this.formData, path => validateVestTree(path, jassConfigValidations as never));

  constructor() {
    effect(() => this.valid.emit(this.settingsForm().valid()));
  }

  /** the stored rows plus one blank row to add a new one */
  protected readonly editableRows = computed<CoiffeurRow[]>(() =>
    [...this.formData().coiffeurRows, { id: '', label: '', multiplier: this.formData().coiffeurRows.length + 1 }]);

  private readonly result = vestErrors(this.settingsForm);
  protected readonly schieberTargetErrors = computed(() => this.result().getErrors('schieberTarget'));
  protected readonly bueterPairTargetErrors = computed(() => this.result().getErrors('bueterPairTarget'));
  protected readonly bueterBidErrors = computed(() => this.result().getErrors('bueterBid'));
  protected readonly differenzlerHandsErrors = computed(() => this.result().getErrors('differenzlerHands'));
  protected readonly coiffeurRowsErrors = computed(() => this.result().getErrors('coiffeurRows'));

  protected readonly schieberI18n = computed(() => ({ name: 'schieberTarget', label: this.i18n().schieber_target(), placeholder: '1000', helper: '' }) as NumberInputI18n);
  protected readonly bueterI18n = computed(() => ({ name: 'bueterPairTarget', label: this.i18n().bueter_target(), placeholder: '1000', helper: '' }) as NumberInputI18n);
  protected readonly bidI18n = computed(() => ({ name: 'bueterBid', label: this.i18n().bid_label(), placeholder: '650', helper: '' }) as NumberInputI18n);
  protected readonly handsI18n = computed(() => ({ name: 'differenzlerHands', label: this.i18n().differenzler_hands(), placeholder: '12', helper: '' }) as NumberInputI18n);
  protected readonly rowLabelI18n = computed(() => ({ name: 'rowLabel', label: this.i18n().row_label(), placeholder: '', helper: this.i18n().rows_helper() }) as TextInputI18n);
  protected readonly rowMultI18n = computed(() => ({ name: 'rowMultiplier', label: this.i18n().row_multiplier(), placeholder: '1', helper: '' }) as NumberInputI18n);

  protected set(field: keyof JassConfig, value: number): void {
    this.dirty.emit(true);
    this.formData.update(c => ({ ...c, [field]: value }));
  }

  /** An emptied label removes the row; typing into the blank last row adds one. */
  protected setRow(index: number, field: 'label' | 'multiplier', value: string | number): void {
    this.dirty.emit(true);
    this.formData.update(c => {
      const rows = [...this.editableRows()];
      const row = { ...rows[index], [field]: value } as CoiffeurRow;
      if (!row.id && row.label) row.id = row.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
      rows[index] = row;
      return { ...c, coiffeurRows: rows.filter(r => r.id && r.label.trim().length > 0) };
    });
  }
}
