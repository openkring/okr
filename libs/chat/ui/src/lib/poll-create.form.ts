import { Component, OnInit, computed, effect, input, output, signal, Signal } from '@angular/core';
import { IonItem, IonInput, IonList } from '@ionic/angular/standalone';

import { AnyCharacterMask } from '@okr/shared-config';
import { Checkbox, CheckboxI18n, StringList } from '@okr/shared-ui';
import { QuickEntryResolver } from '@okr/shared-util-angular';

import { MatrixPollData } from '@okr/chat-data-access';

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
    StringList, Checkbox,
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
          (ionInput)="question.set($any($event).detail.value ?? '')"
          [maxlength]="255"
          [counter]="true"
          inputMode="text"
          type="text"
        />
      </ion-item>

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
        [(strings)]="answers"
        [title]="i18n().answer_create()"
        [add]="i18n().answer_add()"
        [readOnly]="false"
        [mask]="anyCharMask"
        [maxLength]="100"
        [lowercase]="false"
        [quickEntryResolver]="quickEntryResolver()"
      />

      <!-- Multiple answers toggle -->
      <okr-checkbox
        [i18n]="allowMultipleAnswersI18n()"
        [(checked)]="allowMultipleAnswers"
        [readOnly]="lockMultiple()"
      />
    </ion-list>
  `
})
export class PollCreateForm implements OnInit {
  // inputs
  public readonly i18n = input.required<PollCreateFormI18n>();
  public formData = input.required<MatrixPollData>();
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
  public formDataChange = output<MatrixPollData>();
  public valid = output<boolean>();

  protected allowMultipleAnswersI18n = computed(() => ({
    name: 'allowMultipleAnswers',
    label: this.i18n().allowMultipleAnswers_label(),
    helper: this.i18n().allowMultipleAnswers_helper(),
  } as CheckboxI18n));

  protected readonly anyCharMask = AnyCharacterMask;

  protected question = signal('');
  protected answers = signal<string[]>([]);
  protected allowMultipleAnswers = signal(false);

  constructor() {
    effect(() => {
      const data: MatrixPollData = {
        question: this.question(),
        answers: [...this.lockedAnswers(), ...this.answers()],
        maxSelections: this.allowMultipleAnswers() ? 20 : 1,
      };
      this.formDataChange.emit(data);
      this.valid.emit(data.question.trim().length > 0 && data.answers.length >= 2);
    });
  }

  ngOnInit(): void {
    this.question.set(this.formData().question);
    this.answers.set(this.formData().answers.slice(this.lockedAnswers().length));
    this.allowMultipleAnswers.set((this.formData().maxSelections ?? 1) > 1);
  }
}
