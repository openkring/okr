import { Component, OnInit, computed, effect, input, output, signal, Signal } from '@angular/core';
import { IonItem, IonInput, IonList } from '@ionic/angular/standalone';

import { AnyCharacterMask } from '@bk2/shared-config';
import { Checkbox, CheckboxI18n, StringList } from '@bk2/shared-ui';

import { MatrixPollData } from '@bk2/chat-data-access';

export interface PollCreateFormI18n {
  allowMultipleAnswers_label: Signal<string>;
  allowMultipleAnswers_helper: Signal<string>;
}

@Component({
  selector: 'bk-poll-create-form',
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
          [label]="'@chat.survey.questionLabel'"
          labelPlacement="floating"
          [placeholder]="'@chat.survey.questionPlaceholder'"
          [value]="question()"
          (ionInput)="question.set($any($event).detail.value ?? '')"
          [maxlength]="255"
          [counter]="true"
          inputMode="text"
          type="text"
        />
      </ion-item>

      <!-- Answers via bk-strings -->
      <bk-strings
        [(strings)]="answers"
        title="@chat.survey.answers"
        addLabel="@chat.survey.addAnswer"
        [readOnly]="false"
        [mask]="anyCharMask"
        [maxLength]="100"
      />

      <!-- Multiple answers toggle -->
      <bk-checkbox
        [i18n]="allowMultipleAnswersI18n()"
        [(checked)]="allowMultipleAnswers"
        [readOnly]="false"
      />
    </ion-list>
  `
})
export class PollCreateForm implements OnInit {
  // inputs
  public readonly i18n = input.required<PollCreateFormI18n>();
  public formData = input.required<MatrixPollData>();
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
        answers: this.answers(),
        maxSelections: this.allowMultipleAnswers() ? 20 : 1,
      };
      this.formDataChange.emit(data);
      this.valid.emit(data.question.trim().length > 0 && data.answers.length >= 2);
    });
  }

  ngOnInit(): void {
    this.question.set(this.formData().question);
    this.answers.set([...this.formData().answers]);
    this.allowMultipleAnswers.set((this.formData().maxSelections ?? 1) > 1);
  }
}
