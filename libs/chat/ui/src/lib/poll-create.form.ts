import { Component, OnInit, computed, effect, inject, input, output, signal } from '@angular/core';
import { IonItem, IonInput, IonList } from '@ionic/angular/standalone';

import { AnyCharacterMask } from '@bk2/shared-config';
import { Checkbox, CheckboxI18n, StringList } from '@bk2/shared-ui';
import { I18nService } from '@bk2/shared-i18n';

import { MatrixPollData } from '@bk2/chat-data-access';
import { PFX } from './scope';

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
  private readonly i18nService = inject(I18nService);
  protected readonly fieldI18n = this.i18nService.translateAll({
    allowMultipleAnswers_label:  PFX + 'allowMultipleAnswers.label',
    allowMultipleAnswers_helper: PFX + 'allowMultipleAnswers.helper',
  });
  protected allowMultipleAnswersI18n = computed(() => ({
    name: 'allowMultipleAnswers',
    label: this.fieldI18n.allowMultipleAnswers_label(),
    helper: this.fieldI18n.allowMultipleAnswers_helper(),
  } as CheckboxI18n));

  public formData = input.required<MatrixPollData>();
  public formDataChange = output<MatrixPollData>();
  public valid = output<boolean>();

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
