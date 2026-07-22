import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow, IonSelect, IonSelectOption } from '@ionic/angular/standalone';

import { InstrumentTopic } from '@okr/shared-models';
import { NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { InstrumentI18n, topicValidations } from '@okr/instruments-util';

/**
 * Pure form for editing a single topic card (label, description, typed score). Signal Forms + Vest,
 * no submit button — the parent modal drives saving via change-confirmation. `showScore` lets the
 * board hide the impact/horizon fields for positional instruments (Eisenhower, BMC).
 */
@Component({
  selector: 'okr-topic-form',
  standalone: true,
  imports: [
    TextInput, NotesInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel, IonSelect, IonSelectOption,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)"
                    [autofocus]="true" [maxLength]="60" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12">
                  <okr-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
                @if (showScore()) {
                  <ion-col size="12" size-md="6">
                    <ion-item>
                      <ion-select [label]="i18n().topicImpact_label()" [value]="impact()" interface="popover"
                        [disabled]="isReadOnly()" (ionChange)="onScoreChange('impact', $event)">
                        <ion-select-option [value]="0">{{ i18n().score_unset() }}</ion-select-option>
                        <ion-select-option [value]="1">{{ i18n().score_low() }}</ion-select-option>
                        <ion-select-option [value]="2">{{ i18n().score_medium() }}</ion-select-option>
                        <ion-select-option [value]="3">{{ i18n().score_high() }}</ion-select-option>
                      </ion-select>
                    </ion-item>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <ion-item>
                      <ion-select [label]="i18n().topicHorizon_label()" [value]="horizon()" interface="popover"
                        [disabled]="isReadOnly()" (ionChange)="onScoreChange('horizon', $event)">
                        <ion-select-option [value]="0">{{ i18n().score_unset() }}</ion-select-option>
                        <ion-select-option [value]="1">{{ i18n().horizon_short() }}</ion-select-option>
                        <ion-select-option [value]="2">{{ i18n().horizon_medium() }}</ion-select-option>
                        <ion-select-option [value]="3">{{ i18n().horizon_long() }}</ion-select-option>
                      </ion-select>
                    </ion-item>
                  </ion-col>
                }
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class TopicForm {
  public readonly i18n = input.required<InstrumentI18n>();
  public formData = model.required<InstrumentTopic>();
  public readonly readOnly = input(true);
  public readonly showForm = input(true);
  public readonly showScore = input(true);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly topicForm = form(this.formData, (path) =>
    validateVestTree(path, topicValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.topicForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly label = computed(() => this.formData()?.label ?? '');
  protected readonly description = computed(() => this.formData()?.description ?? '');
  protected readonly impact = computed(() => this.formData()?.score?.impact ?? 0);
  protected readonly horizon = computed(() => this.formData()?.score?.horizon ?? 0);

  protected labelI18n = computed(() => ({
    name: 'label',
    label: this.i18n().topicLabel_label(),
    placeholder: this.i18n().topicLabel_placeholder(),
    helper: this.i18n().topicLabel_helper(),
  } as TextInputI18n));

  protected descriptionI18n = computed(() => ({
    name: 'description',
    label: this.i18n().topicDescription_label(),
    placeholder: this.i18n().topicDescription_placeholder(),
  } as NotesInputI18n));

  protected onFieldChange(fieldName: 'label' | 'description', fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onScoreChange(axis: 'impact' | 'horizon', event: CustomEvent): void {
    const value = Number((event as CustomEvent<{ value: number }>).detail.value) || 0;
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, score: { ...vm.score, [axis]: value } }));
  }
}
