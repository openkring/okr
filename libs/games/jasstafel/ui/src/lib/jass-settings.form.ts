import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { CoiffeurRow, JassConfig, JassI18n, jassConfigValidations } from '@okr/games-jasstafel-util';
import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { Checkbox, CheckboxI18n, ErrorNote, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';

/**
 * Targets, the three multiplier switches, the Differenzler hand count and the Coiffeur rows.
 * Rows are label + multiplier pairs: an emptied label removes a row, typing into the blank last
 * row adds one; the order follows the multiplier.
 */
@Component({
  selector: 'okr-jass-settings-form',
  standalone: true,
  imports: [IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol, NumberInput, Checkbox, TextInput, ErrorNote],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="schieberI18n()" [value]="formData().schieberTarget"
                    (valueChange)="set('schieberTarget', $event)" [integer]="true" [readOnly]="false" />
                  <okr-error-note [errors]="schieberTargetErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="bueterI18n()" [value]="formData().bueterPairTarget"
                    (valueChange)="set('bueterPairTarget', $event)" [integer]="true" [readOnly]="false" />
                  <okr-error-note [errors]="bueterPairTargetErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="4">
                  <okr-checkbox [i18n]="suitsI18n()" [checked]="formData().suitsDouble"
                    (checkedChange)="set('suitsDouble', $event)" [readOnly]="false" [toggle]="true" />
                </ion-col>
                <ion-col size="12" size-md="4">
                  <okr-checkbox [i18n]="topDownI18n()" [checked]="formData().topDownTriple"
                    (checkedChange)="set('topDownTriple', $event)" [readOnly]="false" [toggle]="true" />
                </ion-col>
                <ion-col size="12" size-md="4">
                  <okr-checkbox [i18n]="slalomI18n()" [checked]="formData().slalomQuad"
                    (checkedChange)="set('slalomQuad', $event)" [readOnly]="false" [toggle]="true" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="handsI18n()" [value]="formData().differenzlerHands"
                    (valueChange)="set('differenzlerHands', $event)" [integer]="true" [readOnly]="false" />
                  <okr-error-note [errors]="differenzlerHandsErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
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
      </form>
    }
  `,
})
export class JassSettingsForm {
  public readonly i18n = input.required<JassI18n>();
  public readonly formData = model.required<JassConfig>();
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

  private readonly result = computed(() => jassConfigValidations(this.formData()));
  protected readonly schieberTargetErrors = computed(() => this.result().getErrors('schieberTarget'));
  protected readonly bueterPairTargetErrors = computed(() => this.result().getErrors('bueterPairTarget'));
  protected readonly differenzlerHandsErrors = computed(() => this.result().getErrors('differenzlerHands'));
  protected readonly coiffeurRowsErrors = computed(() => this.result().getErrors('coiffeurRows'));

  protected readonly schieberI18n = computed(() => ({ name: 'schieberTarget', label: this.i18n().schieber_target(), placeholder: '1000', helper: '' }) as NumberInputI18n);
  protected readonly bueterI18n = computed(() => ({ name: 'bueterPairTarget', label: this.i18n().bueter_target(), placeholder: '1000', helper: '' }) as NumberInputI18n);
  protected readonly handsI18n = computed(() => ({ name: 'differenzlerHands', label: this.i18n().differenzler_hands(), placeholder: '12', helper: '' }) as NumberInputI18n);
  protected readonly suitsI18n = computed(() => ({ name: 'suitsDouble', label: this.i18n().suits_double(), helper: '' }) as CheckboxI18n);
  protected readonly topDownI18n = computed(() => ({ name: 'topDownTriple', label: this.i18n().top_down_triple(), helper: '' }) as CheckboxI18n);
  protected readonly slalomI18n = computed(() => ({ name: 'slalomQuad', label: this.i18n().slalom_quad(), helper: '' }) as CheckboxI18n);
  protected readonly rowLabelI18n = computed(() => ({ name: 'rowLabel', label: this.i18n().row_label(), placeholder: '', helper: this.i18n().rows_helper() }) as TextInputI18n);
  protected readonly rowMultI18n = computed(() => ({ name: 'rowMultiplier', label: this.i18n().row_multiplier(), placeholder: '1', helper: '' }) as NumberInputI18n);

  protected set(field: keyof JassConfig, value: number | boolean): void {
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
