import { Component, computed, input, model } from '@angular/core';
import { IonButton, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular';

import { CategoryListModel, ConditionOp, ConfirmationVariant, Field, VisibilityRule } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Checkbox, CheckboxI18n, ErrorNote, TextareaInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';

import { errorsUnder, FORM_MESSAGE_MAX_LENGTH, FormI18n, isInputField } from '@okr/forms-util';

import { VisibilityRuleInput } from './visibility-rule.input';

/** One variant row as the template needs it. */
interface VariantRow {
  index: number;
  when: VisibilityRule;
  message: string;
  /** the variant rule's errors, keyed relative to the rule (`conditions`, `conditions.<k>.fieldId|op|value`) */
  ruleErrors: Record<string, string[]>;
  messageErrors: string[];
}

const NEW_VARIANT = (): ConfirmationVariant => ({ when: { match: 'all', conditions: [{ fieldId: '', op: '' as ConditionOp }] }, message: '' });

/**
 * Edits «Nach dem Absenden» (spec §10): the thank-you text, «Je nach Antwort» variants («Wenn …» → «dann dieser
 * Text», the first matching one wins; the rule editor without its switch, over all input fields) and
 * «Bestätigung per E-Mail senden» (only with an e-mail field).
 * A sub-form, not a modal: the parent owns the model and its Vest suite and hands the errors back in, keyed as
 * in the suite (`confirmationMessage`, `confirmationVariants.<i>.…`, `sendFillerConfirmation`).
 * The helper text shows a literal `{firstName}` example — it is never passed through `fill()`.
 */
@Component({
  selector: 'okr-confirmation-settings-input',
  standalone: true,
  imports: [
    SvgIconPipe, Checkbox, ErrorNote, TextareaInput, VisibilityRuleInput,
    IonGrid, IonRow, IonCol, IonButton, IonIcon, IonItem, IonLabel, IonNote,
  ],
  styles: [`
    .variant { margin-left: 16px; border-left: 3px solid var(--ion-color-light-shade); }
    ion-item.hint { --min-height: 0; }
  `],
  template: `
    <ion-grid>
      <ion-row>
        <ion-col size="12">
          <okr-textarea-input [i18n]="messageI18n()" [value]="message()" (valueChange)="onMessageChange($event)"
            [maxLength]="messageLength" [rows]="3" [showHelper]="true" [readOnly]="isReadOnly()" />
          <okr-error-note [errors]="errorsAt('confirmationMessage')" />
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col size="12">
          <ion-item lines="none" class="hint"><ion-label>{{ i18n().after_variants() }}</ion-label></ion-item>
        </ion-col>
      </ion-row>
    </ion-grid>

    @for (row of rows(); track row.index) {
      <div class="variant">
        <ion-item lines="none">
          <ion-label>{{ i18n().after_variant_when() }}</ion-label>
          @if (!isReadOnly()) {
            <ion-button slot="end" fill="clear" color="danger" [attr.aria-label]="i18n().after_variant_remove()" (click)="removeVariant(row.index)">
              <ion-icon src="{{ 'trash' | svgIcon }}" slot="icon-only" />
            </ion-button>
          }
        </ion-item>
        <okr-visibility-rule-input [rule]="row.when" (ruleChange)="onVariantRuleChange(row.index, $event)"
          [candidates]="candidates()" [categories]="categories()" [i18n]="i18n()"
          [showToggle]="false" [errors]="row.ruleErrors" [readOnly]="isReadOnly()" />
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <okr-textarea-input [i18n]="variantMessageI18n()" [value]="row.message" (valueChange)="onVariantMessageChange(row.index, $event)"
                [maxLength]="messageLength" [rows]="2" [readOnly]="isReadOnly()" />
              <okr-error-note [errors]="row.messageErrors" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </div>
    }

    <ion-grid>
      <ion-row>
        <ion-col size="12">
          @if (!isReadOnly()) {
            <ion-button fill="clear" size="small" [disabled]="candidates().length === 0" (click)="addVariant()">{{ i18n().after_variant_add() }}</ion-button>
          }
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col size="12">
          <!-- without an e-mail field the switch can only be turned off -->
          <okr-checkbox [i18n]="sendMailI18n()" [checked]="sendFillerConfirmation()" (checkedChange)="onSendMailChange($event)"
            [toggle]="true" justify="space-between" labelPlacement="start"
            [readOnly]="isReadOnly() || (!hasEmailField() && !sendFillerConfirmation())" />
          @if (!hasEmailField()) {
            <ion-item lines="none" class="hint"><ion-note>{{ i18n().after_send_mail_hint() }}</ion-note></ion-item>
          }
          @if (isApplicationMapping()) {
            <ion-item lines="none" class="hint"><ion-note>{{ i18n().after_application_hint() }}</ion-note></ion-item>
          }
          <okr-error-note [errors]="errorsAt('sendFillerConfirmation')" />
        </ion-col>
      </ion-row>
    </ion-grid>
  `,
})
export class ConfirmationSettingsInput {
  /** kept in step with the cap the Vest suite enforces on the text and on every variant */
  protected readonly messageLength = FORM_MESSAGE_MAX_LENGTH;

  // models
  public readonly message = model('');
  public readonly variants = model<ConfirmationVariant[]>([]);
  public readonly sendFillerConfirmation = model(false);

  // inputs
  /** all fields of the form; the input fields among them may be referenced by a variant */
  public readonly fields = input<Field[]>([]);
  public readonly hasEmailField = input(false);
  /** an application mapping: only this mail goes out, not the back office's own (hint) */
  public readonly isApplicationMapping = input(false);
  public readonly categories = input<CategoryListModel[]>([]);
  public readonly i18n = input.required<FormI18n>();
  public readonly readOnly = input(false);
  /** Vest errors keyed as in the suite: `confirmationMessage`, `confirmationVariants.<i>.…`, `sendFillerConfirmation` */
  public readonly errors = input<Record<string, string[]>>({});

  // derived
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  /** every input field, in form order — the text is chosen once the whole form is answered */
  protected readonly candidates = computed(() =>
    [...(this.fields() ?? [])].filter(isInputField).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

  protected readonly rows = computed<VariantRow[]>(() => {
    const errors = this.errors();
    return (this.variants() ?? []).map((v, index) => ({
      index,
      when: v.when,
      message: v.message ?? '',
      ruleErrors: errorsUnder(errors, `confirmationVariants.${index}.when.`),
      messageErrors: errors[`confirmationVariants.${index}.message`] ?? [],
    }));
  });

  // i18n for the shared/ui primitives
  protected readonly messageI18n = computed<TextInputI18n>(() => ({
    name: 'confirmationMessage', label: this.i18n().after_message(), placeholder: '', helper: this.i18n().after_message_helper(),
  }));
  protected readonly variantMessageI18n = computed<TextInputI18n>(() => ({
    name: 'variantMessage', label: this.i18n().after_variant_message(), placeholder: '', helper: '',
  }));
  protected readonly sendMailI18n = computed<CheckboxI18n>(() => ({
    name: 'sendFillerConfirmation', label: this.i18n().after_send_mail(), helper: '',
  }));

  protected errorsAt(name: string): string[] {
    return this.errors()[name] ?? [];
  }

  protected onMessageChange(message: string): void {
    if ((this.message() ?? '') === message) return;
    this.message.set(message);
  }

  protected onSendMailChange(on: boolean): void {
    if ((this.sendFillerConfirmation() === true) === on) return;
    this.sendFillerConfirmation.set(on);
  }

  protected addVariant(): void {
    this.variants.set([...(this.variants() ?? []), NEW_VARIANT()]);
  }

  protected removeVariant(index: number): void {
    this.variants.set((this.variants() ?? []).filter((_, i) => i !== index));
  }

  /** The rule editor without its switch never emits `undefined`; keep the old rule if it ever did. */
  protected onVariantRuleChange(index: number, when: VisibilityRule | undefined): void {
    if (!when) return;
    this.setVariant(index, v => ({ ...v, when }));
  }

  protected onVariantMessageChange(index: number, message: string): void {
    this.setVariant(index, v => ((v.message ?? '') === message ? v : { ...v, message }));
  }

  private setVariant(index: number, change: (v: ConfirmationVariant) => ConfirmationVariant): void {
    const list = this.variants() ?? [];
    const old = list[index];
    if (!old) return;
    const next = change(old);
    if (next === old) return;
    this.variants.set(list.map((v, i) => (i === index ? next : v)));
  }
}
