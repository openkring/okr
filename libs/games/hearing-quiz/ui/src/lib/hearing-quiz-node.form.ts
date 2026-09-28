import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { HearingQuizAnswer, HearingQuizNodeModel, HearingQuizNodeType } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Checkbox, CheckboxI18n, ErrorNote, NotesInput, NotesInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

import {
  HQ_ANSWER_LENGTH,
  HQ_CAPTION_LENGTH,
  HQ_HINT_LENGTH,
  HQ_IMAGE_ACCEPT,
  HQ_MAX_ANSWERS,
  HQ_MIN_ANSWERS,
  HQ_QUESTION_LENGTH,
  HQ_TITLE_LENGTH,
  HearingQuizI18n,
  hearingQuizNodeValidations,
  newHearingQuizAnswer,
} from '@okr/games-hearing-quiz-util';

import { HearingQuizAudioInput } from './hearing-quiz-audio-input';

export interface HearingQuizFolderOption {
  key: string;   // '' = top level
  label: string;
}

/**
 * Edit form of one Hörtraining node — a folder or a question (spec §4.3). Pure: files are only
 * EMITTED (`audioSelected`, `hintImageSelected`); the parent uploads them and writes the
 * resulting URL back into `formData`.
 */
@Component({
  selector: 'okr-hearing-quiz-node-form',
  standalone: true,
  imports: [
    SvgIconPipe,
    TextInput, NotesInput, StringSelect, Checkbox, ErrorNote,
    HearingQuizAudioInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonButton, IonIcon, IonItem, IonLabel, IonNote,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .hq-answer { border-bottom: 1px solid var(--ion-color-light-shade); }
    .hq-hint-image { max-width: 100%; max-height: 200px; object-fit: contain; display: block; margin: 8px 16px; }
    input[type=file] { display: none; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [autofocus]="true" [maxLength]="titleLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="titleErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="typeI18n()" [selectedString]="type()" (selectedStringChange)="onTypeChange($event)"
                    [stringList]="types" [labels]="typeLabels()" [readOnly]="isReadOnly() || hasChildren()" />
                  <okr-error-note [errors]="typeErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-string-select [i18n]="parentI18n()" [selectedString]="parentKey()" (selectedStringChange)="onFieldChange('parentKey', $event)"
                    [stringList]="parentKeys()" [labels]="parentLabels()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="parentErrors()" />
                </ion-col>
              </ion-row>
              @if (type() === 'folder') {
                <ion-row>
                  <ion-col size="12">
                    <okr-checkbox [i18n]="keepOrderI18n()" [checked]="keepOrder()" (checkedChange)="onFieldChange('keepOrder', $event)"
                      [showHelper]="true" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>

        @if (type() === 'question') {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                    <okr-text-input [i18n]="questionI18n()" [value]="question()" (valueChange)="onFieldChange('question', $event)"
                      [maxLength]="questionLength" [readOnly]="isReadOnly()" [showHelper]="true" />
                    <okr-error-note [errors]="questionErrors()" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12">
                    <okr-hearing-quiz-audio-input [i18n]="i18n()" [audioUrl]="audioUrl()" [readOnly]="isReadOnly()"
                      [busy]="audioBusy()" (fileSelected)="audioSelected.emit($event)" />
                    <okr-error-note [errors]="audioErrors()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ i18n().answers_label() }}</ion-card-title>
            </ion-card-header>
            <ion-card-content class="ion-no-padding">
              <ion-item lines="none"><ion-note>{{ i18n().answers_helper() }}</ion-note></ion-item>
              <ion-grid>
                @for (answer of answers(); track $index; let i = $index) {
                  <ion-row class="hq-answer">
                    <ion-col size="12" size-md="5">
                      <okr-text-input [i18n]="answerTextI18n()" [value]="answer.text" (valueChange)="onAnswerChange(i, 'text', $event)"
                        [maxLength]="answerLength" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12" size-md="4">
                      <okr-text-input [i18n]="answerCaptionI18n()" [value]="answer.caption" (valueChange)="onAnswerChange(i, 'caption', $event)"
                        [maxLength]="captionLength" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="8" size-md="2">
                      <okr-checkbox [i18n]="correctI18n()" [checked]="correctAnswer() === i" (checkedChange)="onCorrectChange(i, $event)"
                        [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="4" size-md="1">
                      @if (!isReadOnly() && answers().length > minAnswers) {
                        <ion-button fill="clear" color="medium" [attr.aria-label]="i18n().answer_remove()" (click)="removeAnswer(i)">
                          <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                        </ion-button>
                      }
                    </ion-col>
                  </ion-row>
                }
              </ion-grid>
              <okr-error-note [errors]="answersErrors()" />
              <okr-error-note [errors]="correctErrors()" />
              @if (!isReadOnly() && answers().length < maxAnswers) {
                <ion-button fill="clear" (click)="addAnswer()">
                  <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" />
                  {{ i18n().answer_add() }}
                </ion-button>
              }
            </ion-card-content>
          </ion-card>

          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-item lines="none">
                <ion-label position="stacked">{{ i18n().hintImage_label() }}</ion-label>
              </ion-item>
              @if (hintImageUrl()) {
                <img class="hq-hint-image" [src]="hintImageUrl()" alt="" />
              }
              @if (!isReadOnly()) {
                <ion-button fill="outline" (click)="imageInput.click()">
                  <ion-icon slot="start" src="{{ 'image' | svgIcon }}" />
                  {{ i18n().hintImage_choose() }}
                </ion-button>
                @if (hintImageUrl()) {
                  <ion-button fill="clear" color="medium" (click)="onFieldChange('hintImageUrl', '')">
                    {{ i18n().hintImage_remove() }}
                  </ion-button>
                }
                <input #imageInput type="file" [accept]="imageAccept" (change)="onImageChosen($event)" />
              }
            </ion-card-content>
          </ion-card>

          <okr-notes-input [i18n]="hintI18n()" [value]="hint()" (valueChange)="onFieldChange('hint', $event)"
            [maxLength]="hintLength" [readOnly]="isReadOnly()" [errors]="hintErrors()" />
        } @else {
          <okr-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)"
            [maxLength]="descriptionLength" [readOnly]="isReadOnly()" [errors]="descriptionErrors()" />
        }
      </form>
    }
  `,
})
export class HearingQuizNodeForm {
  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly titleLength = HQ_TITLE_LENGTH;
  protected readonly questionLength = HQ_QUESTION_LENGTH;
  protected readonly answerLength = HQ_ANSWER_LENGTH;
  protected readonly captionLength = HQ_CAPTION_LENGTH;
  protected readonly hintLength = HQ_HINT_LENGTH;
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
  protected readonly minAnswers = HQ_MIN_ANSWERS;
  protected readonly maxAnswers = HQ_MAX_ANSWERS;
  protected readonly imageAccept = HQ_IMAGE_ACCEPT;
  protected readonly types: HearingQuizNodeType[] = ['folder', 'question'];

  // inputs
  public readonly i18n = input.required<HearingQuizI18n>();
  public formData = model.required<HearingQuizNodeModel>();
  /** Folders this node may live in (already excluding itself and its descendants), without the top level. */
  public readonly folderOptions = input<HearingQuizFolderOption[]>([]);
  /** A folder with children must stay a folder. */
  public readonly hasChildren = input(false);
  public readonly audioBusy = input(false);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  public readonly audioSelected = output<File>();
  public readonly hintImageSelected = output<File>();

  protected readonly nodeForm = form(this.formData, (path) =>
    validateVestTree(path, hearingQuizNodeValidations as any),
  );

  private readonly validationResult = computed(() => hearingQuizNodeValidations(this.formData(), '', ''));
  protected titleErrors = computed(() => this.validationResult().getErrors('title'));
  protected typeErrors = computed(() => this.validationResult().getErrors('type'));
  protected parentErrors = computed(() => this.validationResult().getErrors('parentKey'));
  protected questionErrors = computed(() => this.validationResult().getErrors('question'));
  protected audioErrors = computed(() => this.validationResult().getErrors('audioUrl'));
  protected answersErrors = computed(() => this.validationResult().getErrors('answers'));
  protected correctErrors = computed(() => this.validationResult().getErrors('correctAnswer'));
  protected hintErrors = computed(() => this.validationResult().getErrors('hint'));
  protected descriptionErrors = computed(() => this.validationResult().getErrors('description'));

  constructor() {
    effect(() => this.valid.emit(this.nodeForm().valid()));
  }

  // field accessors — Firestore reads skip model defaults, so coalesce
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly type = computed(() => this.formData()?.type ?? 'folder');
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly parentKey = computed(() => this.formData()?.parentKey ?? '');
  protected readonly description = computed(() => this.formData()?.description ?? '');
  protected readonly keepOrder = computed(() => this.formData()?.keepOrder === true);
  protected readonly question = computed(() => this.formData()?.question ?? '');
  protected readonly audioUrl = computed(() => this.formData()?.audioUrl ?? '');
  protected readonly answers = computed(() => this.formData()?.answers ?? []);
  protected readonly correctAnswer = computed(() => this.formData()?.correctAnswer ?? 0);
  protected readonly hint = computed(() => this.formData()?.hint ?? '');
  protected readonly hintImageUrl = computed(() => this.formData()?.hintImageUrl ?? '');

  protected readonly parentKeys = computed(() => ['', ...this.folderOptions().map(o => o.key)]);
  protected readonly parentLabels = computed(() => [this.i18n().target_root(), ...this.folderOptions().map(o => o.label)]);
  protected readonly typeLabels = computed(() => [this.i18n().type_folder(), this.i18n().type_question()]);

  // i18n for the shared/ui primitives
  protected titleI18n = computed(() => ({
    name: 'title', label: this.i18n().title_label(), placeholder: this.i18n().title_placeholder(), helper: this.i18n().title_helper(),
  } as TextInputI18n));
  protected typeI18n = computed(() => ({
    name: 'type', label: this.i18n().type_label(), helper: this.hasChildren() ? this.i18n().type_locked_helper() : undefined,
  } as StringSelectI18n));
  protected parentI18n = computed(() => ({ name: 'parentKey', label: this.i18n().parent_label() } as StringSelectI18n));
  protected keepOrderI18n = computed(() => ({
    name: 'keepOrder', label: this.i18n().keepOrder_label(), helper: this.i18n().keepOrder_helper(),
  } as CheckboxI18n));
  protected questionI18n = computed(() => ({
    name: 'question', label: this.i18n().question_label(), placeholder: this.i18n().question_placeholder(), helper: this.i18n().question_helper(),
  } as TextInputI18n));
  protected answerTextI18n = computed(() => ({
    name: 'answerText', label: this.i18n().answer_text_placeholder(), placeholder: this.i18n().answer_text_placeholder(), helper: '',
  } as TextInputI18n));
  protected answerCaptionI18n = computed(() => ({
    name: 'answerCaption', label: this.i18n().answer_caption_placeholder(), placeholder: this.i18n().answer_caption_placeholder(), helper: '',
  } as TextInputI18n));
  protected correctI18n = computed(() => ({ name: 'correctAnswer', label: this.i18n().answer_correct(), helper: '' } as CheckboxI18n));
  protected hintI18n = computed(() => ({
    name: 'hint', label: this.i18n().hint_label(), placeholder: this.i18n().hint_placeholder(),
  } as NotesInputI18n));
  protected descriptionI18n = computed(() => ({
    name: 'description', label: this.i18n().description_label(), placeholder: this.i18n().description_placeholder(),
  } as NotesInputI18n));

  /*-------------------------- changes --------------------------------*/
  protected onFieldChange(fieldName: keyof HearingQuizNodeModel, fieldValue: string | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onTypeChange(type: string): void {
    if (type !== 'folder' && type !== 'question') return;
    this.dirty.emit(true);
    this.formData.update((vm) => {
      const answers = vm.answers?.length ? vm.answers : [newHearingQuizAnswer(), newHearingQuizAnswer()];
      return { ...vm, type, answers: type === 'question' ? answers : vm.answers ?? [] };
    });
  }

  protected onAnswerChange(index: number, field: keyof HearingQuizAnswer, value: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({
      ...vm,
      answers: (vm.answers ?? []).map((a, i) => (i === index ? { ...a, [field]: value } : a)),
    }));
  }

  /** The checkboxes behave like radios: checking one moves the mark, unchecking is ignored. */
  protected onCorrectChange(index: number, checked: boolean): void {
    if (!checked || this.correctAnswer() === index) return;
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, correctAnswer: index }));
  }

  protected addAnswer(): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, answers: [...(vm.answers ?? []), newHearingQuizAnswer()] }));
  }

  protected removeAnswer(index: number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => {
      const answers = (vm.answers ?? []).filter((_, i) => i !== index);
      // keep the mark on the same answer; if it was the removed one, fall back to the first
      let correct = vm.correctAnswer ?? 0;
      if (correct === index) correct = 0;
      else if (correct > index) correct--;
      return { ...vm, answers, correctAnswer: correct };
    });
  }

  protected onImageChosen(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    target.value = '';
    if (file) this.hintImageSelected.emit(file);
  }
}
