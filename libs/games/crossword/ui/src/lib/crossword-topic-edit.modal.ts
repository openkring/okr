import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonButton, IonContent, IonItem, IonLabel, IonList, IonNote, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { CrosswordTopicModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, fill, safeStructuredClone } from '@okr/shared-util-core';

import { CrosswordBoard } from './crossword-board';
import { CrosswordTopicForm } from './crossword-topic.form';
import { CROSSWORD_I18N_KEYS, CrosswordI18n, MIN_ENTRIES, generateCrossword, normalizeEntries } from '@okr/games-crossword-util';

/**
 * Header + change-confirmation + the topic form (the `building-forms` structure), plus the
 * generate panel: Generate/re-roll build `formData().grid` from the current entries via the pure
 * `generateCrossword`, the board previews it read-only, and Publish is refused while there is no
 * grid or the grid is stale (spec constraint — a topic must never go live pointing at words it was
 * not generated from).
 *
 * None of this persists anything — Generate/re-roll/Publish only mutate `formData`, exactly like
 * every other field edit. Persistence still goes through the standard change-confirmation Save,
 * which dismisses the modal with the edited model for the caller (the list) to create/update.
 */
@Component({
  selector: 'okr-crossword-topic-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, CrosswordTopicForm, CrosswordBoard, IonContent, IonButton, IonList, IonItem, IonLabel, IonNote],
  styles: [`
    .cw-generate-panel { padding: 0 16px 16px; }
    .cw-generate-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 8px 0; }
  `],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as data) {
        <okr-crossword-topic-form
          [formData]="data"
          (formDataChange)="formData$.set($event)"
          [i18n]="i18n"
          [readOnly]="isReadOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />

        @if (!isReadOnly()) {
          <div class="cw-generate-panel">
            <div class="cw-generate-actions">
              <ion-button fill="outline" [disabled]="!canGenerate()" (click)="generate()">{{ i18n.generate() }}</ion-button>
              @if (data.grid) {
                <ion-button fill="outline" [disabled]="!canGenerate()" (click)="generate()">{{ i18n.reroll() }}</ion-button>
              }
              <ion-button fill="solid" [disabled]="!canPublish()" (click)="publish()">{{ i18n.publish() }}</ion-button>
            </div>

            @if (data.grid; as grid) {
              <ion-note>{{ placedCountLabel() }}</ion-note>
              @if (data.gridStale) {
                <ion-item lines="none"><ion-note color="warning">{{ i18n.grid_stale() }}</ion-note></ion-item>
              }
              <okr-crossword-board [grid]="grid" [entries]="data.entries" [readOnly]="true" />
              @if (grid.unplaced.length > 0) {
                <ion-list lines="none">
                  <ion-item lines="none"><ion-label><strong>{{ i18n.unplaced_label() }}</strong></ion-label></ion-item>
                  @for (index of grid.unplaced; track index) {
                    <ion-item lines="none"><ion-label>{{ data.entries[index]?.answer }}</ion-label></ion-item>
                  }
                </ion-list>
              }
            } @else {
              <ion-note>{{ i18n.no_grid() }}</ion-note>
            }
          </div>
        }
      }
    </ion-content>
  `,
})
export class CrosswordTopicEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(CROSSWORD_I18N_KEYS) as CrosswordI18n;

  // inputs
  public readonly topic = input.required<CrosswordTopicModel>();
  public readonly readOnly = input(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // state
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly showForm = signal(true);
  public readonly formData = linkedSignal<CrosswordTopicModel>(() => safeStructuredClone(this.topic()) as CrosswordTopicModel);
  /** alias used by the template's two-way binding (the @if local shadows `formData`) */
  protected readonly formData$ = this.formData;

  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view_label();
    return this.topic().okey ? this.i18n.edit_label() : this.i18n.create_label();
  });
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(),
    save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));

  /** At least `MIN_ENTRIES` usable rows must survive normalisation before a grid is worth trying. */
  protected readonly canGenerate = computed(() => normalizeEntries(this.formData().entries).usable.length >= MIN_ENTRIES);

  /** Publishing is refused while there is no grid, or the grid no longer matches the entries. */
  protected readonly canPublish = computed(() => {
    const data = this.formData();
    return !!data.grid && !data.gridStale && data.state !== 'published';
  });

  protected readonly placedCountLabel = computed(() => {
    const data = this.formData();
    if (!data.grid) return '';
    return fill(this.i18n.placed_count(), { placed: data.grid.placements.length, total: data.grid.placements.length + data.grid.unplaced.length });
  });

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.topic()) as CrosswordTopicModel);
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  /** Builds a fresh layout from the current entries — Generate the first time, re-roll after. */
  protected generate(): void {
    const grid = generateCrossword(this.formData().entries);
    this.formData.update(vm => ({ ...vm, grid, gridStale: false }));
    this.formDirty.set(true);
  }

  protected publish(): void {
    if (!this.canPublish()) return;
    this.formData.update(vm => ({ ...vm, state: 'published' }));
    this.formDirty.set(true);
  }
}
