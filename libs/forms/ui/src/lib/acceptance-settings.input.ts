import { Component, computed, input, model } from '@angular/core';
import { IonCol, IonGrid, IonItem, IonNote, IonRow } from '@ionic/angular';

import { Checkbox, CheckboxI18n, DateInput, DateInputI18n, ErrorNote, NumberInput, NumberInputI18n, TextareaInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean, fill } from '@okr/shared-util-core';

import { AcceptanceFields, FORM_MESSAGE_MAX_LENGTH, FormI18n, MAX_RESPONSES_LIMIT } from '@okr/forms-util';

/**
 * Edits the «Annahme» of a form (spec §11): open by hand, closing date, «Höchstens … Antworten» with the
 * current count («7 von 8 Antworten»), «Freie Plätze anzeigen» and the text shown when closed.
 * A sub-form, not a modal: the parent owns the model and its Vest suite and hands the errors back in,
 * keyed by the setting (`closesAt`, `maxResponses`, `closedMessage`).
 * `inherit` (a form section): an empty date or text and a limit of 0 mean «wie im Formular».
 */
@Component({
  selector: 'okr-acceptance-settings-input',
  standalone: true,
  imports: [Checkbox, DateInput, ErrorNote, NumberInput, TextareaInput, IonGrid, IonRow, IonCol, IonItem, IonNote],
  styles: [`ion-item.hint { --min-height: 0; }`],
  template: `
    <ion-grid>
      @if (inherit()) {
        <ion-row>
          <ion-col size="12">
            <ion-item lines="none" class="hint"><ion-note>{{ i18n().accept_inherit() }}</ion-note></ion-item>
          </ion-col>
        </ion-row>
      }
      <ion-row>
        <ion-col size="12" size-md="6">
          <okr-checkbox [i18n]="openI18n()" [checked]="isOpen()" (checkedChange)="onChange('isOpen', $event)"
            [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
        </ion-col>
        <ion-col size="12" size-md="6">
          <okr-checkbox [i18n]="showRemainingI18n()" [checked]="showRemaining()" (checkedChange)="onChange('showRemaining', $event)"
            [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col size="12" size-md="6">
          <okr-date-input [i18n]="closesAtI18n()" [storeDate]="closesAt()" (storeDateChange)="onChange('closesAt', $event)"
            [showHelper]="false" [readOnly]="isReadOnly()" />
          <okr-error-note [errors]="errorsAt('closesAt')" />
        </ion-col>
        <ion-col size="12" size-md="6">
          <okr-number-input [i18n]="maxI18n()" [value]="maxResponses()" (valueChange)="onMaxChange($event)"
            [min]="0" [max]="maxResponsesLimit" [integer]="true" [showHelper]="true" [readOnly]="isReadOnly()" />
          @if (countText()) {
            <ion-item lines="none" class="hint"><ion-note>{{ countText() }}</ion-note></ion-item>
          }
          <okr-error-note [errors]="errorsAt('maxResponses')" />
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col size="12">
          <okr-textarea-input [i18n]="closedMessageI18n()" [value]="closedMessage()" (valueChange)="onChange('closedMessage', $event)"
            [maxLength]="messageLength" [rows]="2" [readOnly]="isReadOnly()" />
          <okr-error-note [errors]="errorsAt('closedMessage')" />
        </ion-col>
      </ion-row>
    </ion-grid>
  `,
})
export class AcceptanceSettingsInput {
  /** kept in step with the caps the Vest suite enforces */
  protected readonly messageLength = FORM_MESSAGE_MAX_LENGTH;
  protected readonly maxResponsesLimit = MAX_RESPONSES_LIMIT;

  // inputs
  public readonly settings = model<Partial<AcceptanceFields>>({});
  /** a form section: empty values inherit the form's */
  public readonly inherit = input(false);
  /** a form section: the form-wide «Freie Plätze anzeigen», shown until the section sets its own */
  public readonly inheritedShowRemaining = input(false);
  /** accepted responses so far (`formStats`); null = unknown, nothing shown */
  public readonly count = input<number | null>(null);
  public readonly i18n = input.required<FormI18n>();
  public readonly readOnly = input(false);
  /** Vest errors keyed by setting: `closesAt`, `maxResponses`, `closedMessage` */
  public readonly errors = input<Record<string, string[]>>({});

  // derived — a legacy definition lacks every field: open, no date, unlimited (reads skip model defaults)
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly isOpen = computed(() => this.settings()?.isOpen !== false);
  protected readonly showRemaining = computed(() => {
    const own = this.settings()?.showRemaining;
    if (typeof own === 'boolean') return own;
    return this.inherit() && this.inheritedShowRemaining();
  });
  protected readonly closesAt = computed(() => this.settings()?.closesAt ?? '');
  protected readonly maxResponses = computed(() => this.settings()?.maxResponses ?? 0);
  protected readonly closedMessage = computed(() => this.settings()?.closedMessage ?? '');
  /** «7 von 8 Antworten» — only next to a limit */
  protected readonly countText = computed(() => {
    const count = this.count();
    const max = this.maxResponses();
    return count !== null && typeof max === 'number' && max > 0 ? fill(this.i18n().accept_count(), { count, max }) : '';
  });

  // i18n for the shared/ui primitives
  protected readonly openI18n = computed<CheckboxI18n>(() => ({ name: 'isOpen', label: this.i18n().accept_open(), helper: '' }));
  protected readonly showRemainingI18n = computed<CheckboxI18n>(() => ({
    name: 'showRemaining', label: this.i18n().accept_show_remaining(), helper: '',
  }));
  protected readonly closesAtI18n = computed<DateInputI18n>(() => ({ name: 'closesAt', label: this.i18n().accept_closes_at(), placeholder: '' }));
  protected readonly maxI18n = computed<NumberInputI18n>(() => ({
    name: 'maxResponses', label: this.i18n().accept_max(), placeholder: '0', helper: this.i18n().accept_max_helper(),
  }));
  protected readonly closedMessageI18n = computed<TextInputI18n>(() => ({
    name: 'closedMessage', label: this.i18n().accept_closed_text(), placeholder: this.i18n().closed_default(), helper: '',
  }));

  protected errorsAt(name: string): string[] {
    return this.errors()[name] ?? [];
  }

  /** An empty number field reads as 0 (unlimited, or «wie im Formular» on a section). */
  protected onMaxChange(value: number | null | undefined): void {
    const next = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    this.onChange('maxResponses', next);
  }

  /** Ignores an echo of the value shown (a legacy field is shown coalesced), so opening the card never marks it dirty. */
  protected onChange<K extends keyof AcceptanceFields>(name: K, value: AcceptanceFields[K]): void {
    const shown: AcceptanceFields = {
      isOpen: this.isOpen(), showRemaining: this.showRemaining(), closesAt: this.closesAt(),
      maxResponses: this.maxResponses(), closedMessage: this.closedMessage(),
    };
    if (shown[name] === value) return;
    this.settings.set({ ...(this.settings() ?? {}), [name]: value });
  }
}
