import { Component, computed, effect, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonNote, IonRow, IonTextarea } from '@ionic/angular/standalone';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { CrosswordEntry, CrosswordTopicModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, NotesInput, NotesInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

import { CrosswordI18n, MAX_ANSWER_LENGTH, MAX_CLUE_LENGTH, MAX_TITLE_LENGTH, crosswordTopicSuite } from '@okr/games-crossword-util';

/** Languages a topic's text may be authored in — the same five the app itself is translated into. */
const CROSSWORD_LANGUAGES = ['de', 'en', 'es', 'fr', 'it'];

/**
 * Edit form of one crossword topic (spec `2026-09-29-crossword-spec.md`, Task 8). Title,
 * description, language, and the entries repeater with a paste box that appends `answer;clue`
 * rows in bulk. Pure/dumb: it only mutates `formData`, never touches the generated `grid` beyond
 * flipping `gridStale` — generating and publishing are the modal's job (the panel needs
 * `generateCrossword` + the board preview, which do not belong on a form component).
 *
 * Editing any entry (add/remove/change, including a pasted batch) marks `gridStale = true`: the
 * grid was built from the *previous* set of entries and no longer matches this one.
 */
@Component({
  selector: 'okr-crossword-topic-form',
  standalone: true,
  imports: [
    SvgIconPipe,
    FormsModule,
    TextInput, NotesInput, StringSelect, ErrorNote,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton, IonIcon, IonItem, IonNote, IonTextarea,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .cw-entry-row { border-bottom: 1px solid var(--ion-color-light-shade); }
    .cw-paste-area { width: 100%; min-height: 100px; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="8">
                  <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [autofocus]="true" [maxLength]="titleLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="titleErrors()" />
                </ion-col>
                <ion-col size="12" size-md="4">
                  <okr-string-select [i18n]="languageI18n()" [selectedString]="language()" (selectedStringChange)="onFieldChange('language', $event)"
                    [stringList]="languages" [labels]="languageLabels" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
            <okr-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)"
              [maxLength]="descriptionLength" [readOnly]="isReadOnly()" [errors]="descriptionErrors()" />
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().entries_label() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @for (entry of entries(); track $index; let i = $index) {
                <ion-row class="cw-entry-row">
                  <ion-col size="12" size-md="4">
                    <okr-text-input [i18n]="answerI18n()" [value]="entry.answer" (valueChange)="onEntryChange(i, 'answer', $event)"
                      [maxLength]="answerLength" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="10" size-md="7">
                    <okr-text-input [i18n]="clueI18n()" [value]="entry.clue" (valueChange)="onEntryChange(i, 'clue', $event)"
                      [maxLength]="clueLength" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="2" size-md="1">
                    @if (!isReadOnly()) {
                      <ion-button fill="clear" color="medium" [attr.aria-label]="i18n().entry_remove()" (click)="removeEntry(i)">
                        <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                      </ion-button>
                    }
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
            <okr-error-note [errors]="clueErrors()" />
            <okr-error-note [errors]="entriesErrors()" />
            @if (!isReadOnly()) {
              <ion-button fill="clear" (click)="addEntry()">
                <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" />
                {{ i18n().entry_add() }}
              </ion-button>
            }
          </ion-card-content>
        </ion-card>

        @if (!isReadOnly()) {
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ i18n().paste_label() }}</ion-card-title>
            </ion-card-header>
            <ion-card-content class="ion-no-padding">
              <ion-item lines="none"><ion-note>{{ i18n().paste_hint() }}</ion-note></ion-item>
              <ion-item lines="none">
                <ion-textarea class="cw-paste-area" [autoGrow]="true" [(ngModel)]="pasteText" name="cwPaste" />
              </ion-item>
              <ion-button fill="outline" [disabled]="pasteText.trim() === ''" (click)="applyPaste()">
                {{ i18n().paste_apply() }}
              </ion-button>
            </ion-card-content>
          </ion-card>
        }
      </form>
    }
  `,
})
export class CrosswordTopicForm {
  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly titleLength = MAX_TITLE_LENGTH;
  protected readonly clueLength = MAX_CLUE_LENGTH;
  protected readonly answerLength = MAX_ANSWER_LENGTH;
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
  protected readonly languages = CROSSWORD_LANGUAGES;
  protected readonly languageLabels = CROSSWORD_LANGUAGES.map(code => code.toUpperCase());

  // inputs
  public readonly i18n = input.required<CrosswordI18n>();
  public formData = model.required<CrosswordTopicModel>();
  public readonly readOnly = input(true);
  public readonly showForm = input(true); // toggled by parent to reset Vest state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // the plain-text paste buffer — never part of the model, cleared once its rows are appended
  protected pasteText = '';

  protected readonly topicForm = form(this.formData, (path) =>
    validateVestTree(path, crosswordTopicSuite as any));

  private readonly validationResult = computed(() => crosswordTopicSuite(this.formData()));
  protected titleErrors = computed(() => this.validationResult().getErrors('title'));
  protected descriptionErrors = computed(() => this.validationResult().getErrors('description'));
  protected clueErrors = computed(() => this.validationResult().getErrors('clue'));
  protected entriesErrors = computed(() => this.validationResult().getErrors('entries'));

  constructor() {
    effect(() => this.valid.emit(this.topicForm().valid()));
  }

  // field accessors — Firestore reads skip model defaults, so coalesce
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly description = computed(() => this.formData()?.description ?? '');
  protected readonly language = computed(() => this.formData()?.language ?? 'de');
  protected readonly entries = computed(() => this.formData()?.entries ?? []);

  // i18n for the shared/ui primitives
  protected titleI18n = computed(() => ({
    name: 'title', label: this.i18n().form_title(), placeholder: this.i18n().form_title(), helper: '',
  } as TextInputI18n));
  protected descriptionI18n = computed(() => ({
    name: 'description', label: this.i18n().form_description(), placeholder: this.i18n().form_description(),
  } as NotesInputI18n));
  protected languageI18n = computed(() => ({ name: 'language', label: this.i18n().form_language() } as StringSelectI18n));
  protected answerI18n = computed(() => ({
    name: 'answer', label: this.i18n().form_answer(), placeholder: this.i18n().form_answer(), helper: '',
  } as TextInputI18n));
  protected clueI18n = computed(() => ({
    name: 'clue', label: this.i18n().form_clue(), placeholder: this.i18n().form_clue(), helper: '',
  } as TextInputI18n));

  /*-------------------------- changes --------------------------------*/
  protected onFieldChange(fieldName: 'title' | 'description' | 'language', fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

  /** Any entry mutation invalidates the grid the topic was last generated from. */
  protected onEntryChange(index: number, field: keyof CrosswordEntry, value: string): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({
      ...vm,
      entries: vm.entries.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
      gridStale: true,
    }));
  }

  protected addEntry(): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, entries: [...vm.entries, { answer: '', clue: '' }], gridStale: true }));
  }

  protected removeEntry(index: number): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, entries: vm.entries.filter((_, i) => i !== index), gridStale: true }));
  }

  /** Parses `answer;clue` per line and appends the parsed rows; blank/malformed lines are skipped. */
  protected applyPaste(): void {
    const rows: CrosswordEntry[] = this.pasteText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const [answer, ...rest] = line.split(';');
        return { answer: (answer ?? '').trim(), clue: rest.join(';').trim() };
      })
      .filter(entry => entry.answer.length > 0);
    if (rows.length === 0) return;

    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, entries: [...vm.entries, ...rows], gridStale: true }));
    this.pasteText = '';
  }
}
