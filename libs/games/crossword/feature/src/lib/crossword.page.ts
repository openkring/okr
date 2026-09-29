import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonButton, IonContent, IonNote, IonSpinner } from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import { CrosswordPlacement } from '@okr/shared-models';
import { fill } from '@okr/shared-util-core';

import { CrosswordBoard, CrosswordClues } from '@okr/games-crossword-ui';

import { CrosswordStore } from './crossword.store';

/** How often the running clock re-renders. */
const TICK_MS = 1000;

/** A running duration as `m:ss`. Kept local — the page has no reason to share Zip's formatter. */
function formatElapsed(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '0:00';
  const total = Math.floor(milliseconds / 1000);
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60);
  return `${minutes}:${seconds}`;
}

/**
 * The crossword play page: `:topicKey` route param, `CrosswordBoard` + `CrosswordClues`, a
 * check/reveal/restart toolbar, and a timer that freezes on solve.
 *
 * Typing goes through a real (if visually all-but-invisible) focused `<input>` — `keydown`
 * alone never opens a mobile keyboard, and `CrosswordBoard` itself takes no keyboard input, it
 * only reports which cell was tapped. The input is refocused by an `effect` every time the
 * store's selection changes — the store never auto-selects, so this only fires once the player
 * has tapped a cell or picked a clue, but it fires on every such change from then on.
 */
@Component({
  selector: 'okr-crossword-page',
  standalone: true,
  providers: [CrosswordStore],
  imports: [Header, IonContent, IonButton, IonNote, IonSpinner, CrosswordBoard, CrosswordClues],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      @if (!store.topicLoaded()) {
        <ion-spinner name="dots" />
      } @else if (store.notFound() || !store.topic()?.grid) {
        <ion-note color="danger">{{ store.i18n.no_grid() }}</ion-note>
      } @else {
        <div class="cw-play">
          <div class="cw-status">
            @if (store.solved()) {
              <ion-note color="success">{{ solvedLabel() }}</ion-note>
            } @else {
              <ion-note>{{ store.i18n.time_label() }} {{ elapsed() }}</ion-note>
              @if (store.checking()) {
                <ion-note [color]="wrongCount() === 0 ? 'success' : 'warning'">
                  {{ store.i18n.check() }}: {{ wrongCount() }}
                </ion-note>
              }
            }
          </div>

          <okr-crossword-board
            [grid]="store.topic()!.grid!"
            [entries]="store.topic()!.entries"
            [filled]="store.filled()"
            [selected]="store.selected()"
            (cellPicked)="onCellPicked($event)"
          />

          <!-- Off-screen but genuinely focusable/typeable — not display:none/visibility:hidden,
               which would stop it from ever receiving focus or opening a mobile keyboard. -->
          <input
            #hiddenInput
            class="cw-input"
            type="text"
            inputmode="text"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            [attr.aria-label]="store.i18n.title()"
            (keydown)="onKeydown($event)"
            (input)="onInput($event)"
          />

          <okr-crossword-clues
            [grid]="store.topic()!.grid!"
            [entries]="store.topic()!.entries"
            [i18n]="store.i18n"
            [activeNumber]="store.activeNumber()"
            [activeDirection]="store.selected()?.direction"
            (cluePicked)="onCluePicked($event)"
          />

          <div class="cw-actions">
            <ion-button fill="clear" (click)="store.check()">{{ store.i18n.check() }}</ion-button>
            <ion-button fill="clear" [disabled]="!store.selected()" (click)="store.revealLetter()">
              {{ store.i18n.reveal_letter() }}
            </ion-button>
            <ion-button fill="clear" [disabled]="!store.selected()" (click)="store.revealWord()">
              {{ store.i18n.reveal_word() }}
            </ion-button>
            <ion-button fill="solid" (click)="store.restart()">{{ store.i18n.restart() }}</ion-button>
          </div>
        </div>
      }
    </ion-content>
  `,
  styles: [`
    /* The board scrolls INSIDE itself (see CrosswordBoard); the page body must never scroll
       sideways because of a wide puzzle. */
    :host { display: block; overflow-x: hidden; }

    .cw-play { display: flex; flex-direction: column; gap: 0.75rem; max-width: 40rem; margin-inline: auto; }

    .cw-status { display: flex; gap: 1rem; align-items: baseline; min-height: 1.5rem; }

    .cw-input {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      border: none;
      opacity: 0.01;
      overflow: hidden;
      white-space: nowrap;
    }

    .cw-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
  `],
})
export class CrosswordPage {
  protected readonly store = inject(CrosswordStore);

  private readonly hiddenInput = viewChild<ElementRef<HTMLInputElement>>('hiddenInput');

  /** Re-read on every tick so the running clock advances; a solved board ignores it. */
  private readonly now = signal(Date.now());

  protected readonly elapsed = computed(() =>
    formatElapsed((this.store.finishedAt() ?? this.now()) - this.store.startedAt()),
  );

  protected readonly solvedLabel = computed(() =>
    `${this.store.i18n.solved()} — ${fill(this.store.i18n.solved_time(), { time: this.elapsed() })}`,
  );

  /** How many of the currently filled cells are wrong, right after `check()`. */
  protected readonly wrongCount = computed(() => {
    if (!this.store.checking()) return 0;
    const map = this.store.solutionMap();
    if (!map) return 0;
    let wrong = 0;
    for (const [key, letter] of this.store.filled()) {
      const [row, col] = key.split(',').map(Number);
      if (map[row]?.[col] && letter !== map[row][col].letter) wrong++;
    }
    return wrong;
  });

  constructor() {
    const topicKey = inject(ActivatedRoute).snapshot.paramMap.get('topicKey') ?? '';
    this.store.load(topicKey);

    const ticker = setInterval(() => this.now.set(Date.now()), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(ticker));

    // Refocus the capture input every time the selection changes. The store never auto-selects
    // a cell — `selected` stays undefined until the player taps a cell or picks a clue — but once
    // they do, that first selection (and every one after it) must be followed by a keyboard-ready
    // input, or typing silently goes nowhere on mobile.
    effect(() => {
      if (this.store.selected()) {
        this.hiddenInput()?.nativeElement.focus();
      }
    });
  }

  protected onCellPicked(event: { row: number; col: number }): void {
    this.store.select(event.row, event.col);
  }

  protected onCluePicked(placement: CrosswordPlacement): void {
    this.store.selectClue(placement.row, placement.col, placement.direction);
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const letter = target.value.slice(-1);
    target.value = '';
    if (letter) this.store.setLetter(letter);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Backspace') {
      event.preventDefault();
      this.store.backspace();
    }
  }
}
