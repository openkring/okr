import { Component, computed, effect, input, model, output, Signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonItem, IonInput, IonList } from '@ionic/angular/standalone';

import { AnyCharacterMask } from '@okr/shared-config';
import { Checkbox, CheckboxI18n, ErrorNote, StringList } from '@okr/shared-ui';
import { QuickEntryResolver, validateVestTree } from '@okr/shared-util-angular';

import { MatrixPollData } from '@okr/chat-data-access';
import { POLL_ANSWER_LENGTH, POLL_QUESTION_LENGTH, pollValidations } from '@okr/chat-util';

export interface PollCreateFormI18n {
  allowMultipleAnswers_label: Signal<string>;
  allowMultipleAnswers_helper: Signal<string>;
  question_label: Signal<string>;
  question_placeholder: Signal<string>;
  answer_create: Signal<string>;
  answer_add: Signal<string>;
  answer_locked: Signal<string>;
}

@Component({
  selector: 'okr-poll-create-form',
  standalone: true,
  imports: [
    StringList, Checkbox, ErrorNote,
    IonItem, IonInput, IonList
  ],
  template: `
    <ion-list>
      <!-- Question -->
      <ion-item>
        <ion-input
          [label]="i18n().question_label()"
          labelPlacement="floating"
          [placeholder]="i18n().question_placeholder()"
          [value]="question()"
          (ionInput)="onFieldChange('question', $any($event).detail.value ?? '')"
          [maxlength]="questionLength"
          [counter]="true"
          inputMode="text"
          type="text"
        />
      </ion-item>
      <okr-error-note [errors]="questionErrors()" />

      <!-- Answers already voted on: shown, but fixed (votes reference them by id) -->
      @if (lockedAnswers().length > 0) {
        <okr-strings
          [strings]="lockedAnswers()"
          [title]="i18n().answer_locked()"
          [readOnly]="true"
        />
      }

      <!-- Answers via okr-strings -->
      <okr-strings
        [strings]="answers()"
        (stringsChange)="onAnswersChange($event)"
        [title]="i18n().answer_create()"
        [add]="i18n().answer_add()"
        [readOnly]="false"
        [mask]="anyCharMask"
        [maxLength]="answerLength"
        [lowercase]="false"
        [quickEntryResolver]="quickEntryResolver()"
      />
      <okr-error-note [errors]="answersErrors()" />

      <!-- Multiple answers toggle -->
      <okr-checkbox
        [i18n]="allowMultipleAnswersI18n()"
        [checked]="allowMultipleAnswers()"
        (checkedChange)="onFieldChange('maxSelections', $event ? multipleSelections : 1)"
        [readOnly]="lockMultiple()"
      />
    </ion-list>
  `
})
export class PollCreateForm {
  // inputs
  public readonly i18n = input.required<PollCreateFormI18n>();
  public formData = model.required<MatrixPollData>();
  /**
   * Quick entry for survey answers ('//' date, '!!' location). Supplied by the parent
   * modal, because the pickers live in a feature lib this ui lib must not depend on.
   */
  public quickEntryResolver = input<QuickEntryResolver>();
  /**
   * Edit mode, once votes exist: these leading answers are shown read-only and always emitted
   * unchanged, so only new answers can be appended (see buildEditedPollAnswers).
   */
  public lockedAnswers = input<string[]>([]);
  /** Edit mode, once votes exist on a multiple-choice poll: it may not become single choice. */
  public lockMultiple = input(false);
  public valid = output<boolean>();

  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly questionLength = POLL_QUESTION_LENGTH;
  protected readonly answerLength = POLL_ANSWER_LENGTH;
  /** maxSelections written for "several answers" (the Matrix maximum of answers) */
  protected readonly multipleSelections = 20;

  // The suite skips the per-answer rules for locked answers — their count comes from the input.
  private readonly suiteWithContext = (model: MatrixPollData, field?: string) =>
    pollValidations(model, this.lockedAnswers().length, field);
  protected readonly pollForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));

  // per-field errors for the notes; per-answer errors are folded into the list's note
  private readonly validationResult = computed(() => pollValidations(this.formData(), this.lockedAnswers().length));
  protected readonly questionErrors = computed(() => this.validationResult().getErrors('question'));
  protected readonly answersErrors = computed(() =>
    Object.entries(this.validationResult().getErrors())
      .filter(([key]) => key === 'answers' || key.startsWith('answers['))
      .flatMap(([, messages]) => messages));

  protected allowMultipleAnswersI18n = computed(() => ({
    name: 'allowMultipleAnswers',
    label: this.i18n().allowMultipleAnswers_label(),
    helper: this.i18n().allowMultipleAnswers_helper(),
  } as CheckboxI18n));

  protected readonly anyCharMask = AnyCharacterMask;

  // field mirrors; edits go through formData so the parent always holds what is shown
  protected readonly question = computed(() => this.formData()?.question ?? '');
  /** only the editable answers — locked ones lead formData.answers and are shown separately */
  protected readonly answers = computed(() => (this.formData()?.answers ?? []).slice(this.lockedAnswers().length));
  protected readonly allowMultipleAnswers = computed(() => (this.formData()?.maxSelections ?? 1) > 1);

  constructor() {
    effect(() => this.valid.emit(this.pollForm().valid()));
  }

  protected onFieldChange(fieldName: 'question' | 'maxSelections', fieldValue: string | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  /** locked answers stay first and unchanged; only new answers can be edited or appended */
  protected onAnswersChange(answers: string[]): void {
    this.formData.update((vm) => ({ ...vm, answers: [...this.lockedAnswers(), ...answers] }));
  }
}
