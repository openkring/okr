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
 * grid, the grid is stale, or the entries themselves are not publish-worthy yet (too few usable
 * ones, or some rejected by `normalizeEntries`) — spec constraint: a topic must never go live
 * pointing at words it was not generated from, or with fewer than `MIN_ENTRIES` usable words.
 *
 * That last pair of checks is deliberately NOT part of `crosswordTopicSuite` (and therefore never
 * blocks the change-confirmation Save banner): `MIN_ENTRIES`' own docstring calls it "fewest
 * usable entries a topic can PUBLISH with", so a draft with three entries, or one `addEntry()`
 * away from a duplicate, must stay saveable — only publishing it is refused (Task 8 review round
 * 1, IMPORTANT 3). `canGenerate`/`canPublish` read `normalizeEntries` directly instead.
 *
 * None of this persists anything by itself — Generate/re-roll/Publish only mutate `formData`,
 * exactly like every other field edit. Persistence still goes through the standard
 * change-confirmation Save, which dismisses the modal with the edited model for the caller (the
 * list) to create/update. `save()` additionally closes the one path that would otherwise still
 * reach Firestore inconsistent: Draft → Generate → Publish → edit an entry (`gridStale = true`) →
 * Save, all in the same modal session, would persist `state: 'published'` with `gridStale: true`
 * — a topic that claims to be live but was never actually served with its current grid. A topic
 * that was ALREADY published when this modal opened, and is edited and saved again later, is left
 * alone: it stays published and keeps serving its last-good grid, exactly per spec (Task 8 review
 * round 1, IMPORTANT 2) — only a publish-then-edit-then-save inside ONE session gets demoted back
 * to draft, tracked by `publishedThisSession`.
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
              @if (data.grid) {
                <ion-button fill="outline" [disabled]="!canGenerate()" (click)="generate()">{{ i18n.reroll() }}</ion-button>
              } @else {
                <ion-button fill="outline" [disabled]="!canGenerate()" (click)="generate()">{{ i18n.generate() }}</ion-button>
              }
              <ion-button fill="solid" [disabled]="!canPublish()" (click)="publish()">{{ i18n.publish() }}</ion-button>
            </div>
            @if (!canPublish() && publishBlockReason(); as reason) {
              <ion-item lines="none"><ion-note color="warning">{{ reason }}</ion-note></ion-item>
            }

            @if (data.grid; as grid) {
              <ion-note>{{ placedCountLabel() }}</ion-note>
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
  /**
   * True once `publish()` has been clicked in THIS modal session. Distinguishes "went live just
   * now, in this session" from "was already published before this modal opened" — `save()` only
   * demotes the former back to draft when a later edit (in the same session) made the grid stale.
   */
  protected readonly publishedThisSession = signal(false);

  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view_label();
    return this.topic().okey ? this.i18n.edit_label() : this.i18n.create_label();
  });
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(),
    save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));

  private readonly normalized = computed(() => normalizeEntries(this.formData().entries));
  protected readonly usableCount = computed(() => this.normalized().usable.length);
  protected readonly rejectedCount = computed(() => this.normalized().rejected.length);

  /** At least `MIN_ENTRIES` usable rows must survive normalisation before a grid is worth trying. */
  protected readonly canGenerate = computed(() => this.usableCount() >= MIN_ENTRIES);

  /**
   * Publishing is refused while there is no grid, the grid no longer matches the entries, there
   * are fewer than `MIN_ENTRIES` usable words, or some entries are outright rejected
   * (`normalizeEntries`) — none of which block SAVING a draft, only publishing it (see the class
   * doc comment).
   */
  protected readonly canPublish = computed(() => {
    const data = this.formData();
    return !!data.grid && !data.gridStale
      && this.usableCount() >= MIN_ENTRIES && this.rejectedCount() === 0
      && data.state !== 'published';
  });

  /**
   * Why the Publish button is disabled — reusing the shared validation messages, never a new key.
   * Returns '' for the one harmless reason `canPublish()` can be false: the topic is already
   * published, its grid is fresh, and there is nothing to warn about. An already-published topic
   * whose grid HAS since gone stale still gets the warning (`grid_stale`), same as an unpublished
   * one — that is deliberate: the admin needs to see it needs regenerating either way.
   */
  protected readonly publishBlockReason = computed(() => {
    const data = this.formData();
    if (!data.grid) return this.i18n.no_grid();
    if (data.gridStale) return this.i18n.grid_stale();
    if (this.usableCount() < MIN_ENTRIES) return this.i18n.error_too_few_entries();
    if (this.rejectedCount() > 0) return this.i18n.error_entries_rejected();
    return '';
  });

  protected readonly placedCountLabel = computed(() => {
    const data = this.formData();
    if (!data.grid) return '';
    return fill(this.i18n.placed_count(), { placed: data.grid.placements.length, total: data.grid.placements.length + data.grid.unplaced.length });
  });

  /**
   * Closes the one path that would otherwise persist an inconsistent record: this session
   * published the topic, then a later edit in the SAME session made the grid stale again, and the
   * user hit Save without regenerating. Demoting to draft (rather than blocking the save outright)
   * still lets the user keep their word/title/description edits — they just have to regenerate and
   * publish again, exactly as if they had never clicked Publish this time. A topic that was
   * already published before this modal opened is never touched here (`publishedThisSession` stays
   * false for it), so it keeps serving its last-good grid per spec.
   */
  public async save(): Promise<void> {
    const data = this.formData();
    const toSave = this.publishedThisSession() && data.state === 'published' && data.gridStale
      ? { ...data, state: 'draft' as const }
      : data;
    await dismissOverlay(this.modalController, toSave, 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.publishedThisSession.set(false);
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
    this.publishedThisSession.set(true);
    this.formDirty.set(true);
  }
}
