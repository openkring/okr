import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import {
  JASS_MULTIPLIERS, JassGame, JassHandFormModel, JassI18n, handFromForm, handValues, jassHandValidations, withCounterPoints,
} from '@okr/games-jasstafel-util';
import { Checkbox, CheckboxI18n, ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';

import { JassAvatar } from './jass-avatar';

/**
 * One hand: trump (or Coiffeur row and team), card points per side — with two sides the other side
 * is filled in as 157 − x —, the multiplier (Schieber/Büter), Weis per side (Coiffeur only — the others
 * chalk Weis by tapping the slate) and Match. Differenzler is entered in two steps
 * (`phase`): the announcements before the hand, the card points after it.
 */
@Component({
  selector: 'okr-jass-hand-form',
  standalone: true,
  imports: [IonCard, IonCardContent, IonGrid, IonRow, IonCol, NumberInput, StringSelect, Checkbox, ErrorNote, JassAvatar],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } } .heads { display: flex; gap: 4px; }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @if (formData().variant === 'coiffeur') {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="trumpI18n()" [stringList]="formData().trumpOptions"
                      [labels]="rowLabels()" [selectedString]="formData().trump"
                      (selectedStringChange)="set('trump', $event)" [readOnly]="false" />
                    <okr-error-note [errors]="trumpErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="sideI18n()" [stringList]="formData().sideIds"
                      [labels]="sideLabels()" [selectedString]="formData().sideId"
                      (selectedStringChange)="set('sideId', $event)" [readOnly]="false" />
                    <okr-error-note [errors]="sideIdErrors()" />
                  </ion-col>
                </ion-row>
              }
              @if (formData().variant === 'schieber' || formData().variant === 'bueter') {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="multiplierI18n()" [stringList]="multiplierOptions"
                      [labels]="multiplierLabels" [selectedString]="'' + formData().multiplier"
                      (selectedStringChange)="setMultiplier($event)" [readOnly]="false" />
                    <okr-error-note [errors]="multiplierErrors()" />
                  </ion-col>
                </ion-row>
              }
              @for (id of formData().sideIds; track id; let i = $index) {
                <ion-row>
                  <ion-col size="12"><div class="heads">
                    @for (p of playersOf(id); track p) { <okr-jass-avatar [avatar]="game().players[p].avatar" /> }
                  </div></ion-col>
                  @if (formData().variant === 'differenzler' && formData().phase !== 'points') {
                    <ion-col size="12" size-md="6">
                      <okr-number-input [i18n]="announcedI18n()" [value]="formData().announced[i]"
                        (valueChange)="setAt('announced', i, $event)" [integer]="true" [min]="0" [max]="157"
                        [readOnly]="false" />
                    </ion-col>
                  }
                  @if (formData().phase !== 'announce') {
                    <ion-col size="12" size-md="6">
                      <okr-number-input [i18n]="pointsI18n()" [value]="formData().points[i]"
                        (valueChange)="onPoints(i, $event)" [integer]="true" [min]="0" [max]="157"
                        [readOnly]="!!formData().match" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <okr-checkbox [i18n]="matchI18n()" [checked]="formData().match === id"
                        (checkedChange)="setMatch(id, $event)" [readOnly]="false" />
                    </ion-col>
                    @if (formData().variant === 'coiffeur') {
                      <ion-col size="12" size-md="6">
                        <okr-number-input [i18n]="weisI18n()" [value]="formData().weis[i]"
                          (valueChange)="setAt('weis', i, $event)" [integer]="true" [min]="0" [readOnly]="false" />
                      </ion-col>
                    }
                  }
                </ion-row>
              }
              <ion-row>
                <ion-col size="12">
                  <okr-error-note [errors]="pointsErrors()" />
                  <okr-error-note [errors]="weisErrors()" />
                  <okr-error-note [errors]="announcedErrors()" />
                </ion-col>
              </ion-row>
              @if (formData().phase !== 'announce') {
                @if (preview(); as p) {
                  <ion-row><ion-col size="12">{{ i18n().preview() }}: {{ p }}</ion-col></ion-row>
                }
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class JassHandForm {
  public readonly i18n = input.required<JassI18n>();
  public readonly game = input.required<JassGame>();
  public readonly trumpMakerIdx = input.required<number>();
  public readonly formData = model.required<JassHandFormModel>();
  public readonly showForm = input(true);
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly handForm = form(this.formData, path => validateVestTree(path, jassHandValidations as never));

  constructor() {
    effect(() => this.valid.emit(this.handForm().valid()));
  }

  private readonly result = computed(() => jassHandValidations(this.formData()));
  protected readonly trumpErrors = computed(() => this.result().getErrors('trump'));
  protected readonly multiplierErrors = computed(() => this.result().getErrors('multiplier'));
  protected readonly sideIdErrors = computed(() => this.result().getErrors('sideId'));
  protected readonly pointsErrors = computed(() => this.result().getErrors('points'));
  protected readonly weisErrors = computed(() => this.result().getErrors('weis'));
  protected readonly announcedErrors = computed(() => this.result().getErrors('announced'));

  protected readonly trumpI18n = computed(() => ({ name: 'trump', label: this.i18n().trump_label() }) as StringSelectI18n);
  protected readonly multiplierI18n = computed(() => ({ name: 'multiplier', label: this.i18n().multiplier_label() }) as StringSelectI18n);
  protected readonly multiplierOptions = JASS_MULTIPLIERS.map(String);
  protected readonly multiplierLabels = JASS_MULTIPLIERS.map(m => m + '×');
  protected readonly sideI18n = computed(() => ({ name: 'sideId', label: this.i18n().side_label() }) as StringSelectI18n);
  protected readonly matchI18n = computed(() => ({ name: 'match', label: this.i18n().match_label(), helper: '' }) as CheckboxI18n);
  protected readonly pointsI18n = computed(() => ({ name: 'points', label: this.i18n().points_label(),
    placeholder: '0', helper: this.i18n().points_helper() }) as NumberInputI18n);
  protected readonly weisI18n = computed(() => ({ name: 'weis', label: this.i18n().weis_label(),
    placeholder: '0', helper: this.i18n().weis_helper() }) as NumberInputI18n);
  protected readonly announcedI18n = computed(() => ({ name: 'announced', label: this.i18n().announced_label(),
    placeholder: '0', helper: '' }) as NumberInputI18n);

  /** Coiffeur: the open rows with their multiplier, e.g. «Rosen 4×» */
  protected readonly rowLabels = computed(() => {
    const rows = this.game().config.coiffeurRows;
    return this.formData().trumpOptions.map(t => {
      const r = rows.find(x => x.id === t);
      return r ? `${r.label} ${r.multiplier}×` : t;
    });
  });
  protected readonly sideLabels = computed(() =>
    this.formData().sideIds.map((_, n) => `${this.i18n().team()} ${n + 1}`));

  protected readonly preview = computed(() => {
    if (this.formData().phase === 'announce' || !this.result().isValid()) return '';
    const v = handValues(this.game(), handFromForm(this.formData(), this.trumpMakerIdx()));
    return this.formData().sideIds.map(id => v[id]).join(' : ');
  });

  protected playersOf(sideId: string): number[] {
    return this.game().sides.find(s => s.id === sideId)?.playerIdx ?? [];
  }

  /** Match is one checkbox per side; ticking one clears the others, since only one side can take every trick. */
  protected setMatch(sideId: string, checked: boolean): void {
    this.dirty.emit(true);
    this.formData.update(m => ({ ...m, match: checked ? sideId : (m.match === sideId ? '' : m.match) }));
  }

  protected set(field: 'trump' | 'sideId', value: string): void {
    this.dirty.emit(true);
    this.formData.update(m => ({ ...m, [field]: value ?? '' }));
  }

  protected setMultiplier(value: string): void {
    this.dirty.emit(true);
    this.formData.update(m => ({ ...m, multiplier: Number(value) || 1 }));
  }

  protected setAt(field: 'weis' | 'announced', index: number, value: number): void {
    this.dirty.emit(true);
    this.formData.update(m => ({ ...m, [field]: m[field].map((v, i) => (i === index ? value : v)) }));
  }

  protected onPoints(index: number, value: number): void {
    this.dirty.emit(true);
    this.formData.update(m => withCounterPoints(m, index, value));
  }
}
