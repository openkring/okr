import { Component, computed, inject } from '@angular/core';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCol,
  IonContent,
  IonGrid,
  IonRow,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import { MEMORY_LAYOUT, MemorySize, MemoryTheme } from '@okr/games-memory-util';

import { MemoryStore } from './memory.store';

type CardView = { i: number; face: string; up: boolean; found: boolean; label: string };
type PlayerView = { name: string; score: number; active: boolean };
type Option<T> = { value: T; label: () => string };

/**
 * Pairs — turn two cards at a time and find the matching faces. Same frame as the other games:
 * status line, a settings card, then the board, here a CSS grid of `<button>` cards that flip in
 * 3D (instantly under reduced motion).
 *
 * Solo play counts moves and keeps the best result per size; with two players the turn passes
 * after every miss and the score line shows whose turn it is.
 */
@Component({
  selector: 'okr-memory-page',
  standalone: true,
  providers: [MemoryStore],
  imports: [
    Header,
    IonContent, IonCard, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonButton,
  ],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      <div class="mm-wrap">

        <p class="mm-status" role="status" aria-live="polite" [class.solved]="store.solved()">{{ store.statusText() }}</p>

        <ion-card class="mm-setup">
          <ion-card-content>
            <p class="mm-desc">{{ store.i18n.desc() }}</p>
            <ion-grid class="ion-no-padding">
              <ion-row class="ion-align-items-center">
                <ion-col size="12" size-md="4">
                  <ion-select [label]="store.i18n.size_label()" interface="popover" [value]="store.config().size"
                    (ionChange)="store.newGame({ size: $any($event.detail.value) })">
                    @for (o of sizes; track o.value) { <ion-select-option [value]="o.value">{{ o.label() }}</ion-select-option> }
                  </ion-select>
                </ion-col>
                <ion-col size="12" size-md="4">
                  <ion-select [label]="store.i18n.theme_label()" interface="popover" [value]="store.config().theme"
                    (ionChange)="store.newGame({ theme: $any($event.detail.value) })">
                    @for (o of themes; track o.value) { <ion-select-option [value]="o.value">{{ o.label() }}</ion-select-option> }
                  </ion-select>
                </ion-col>
                <ion-col size="12" size-md="4">
                  <ion-select [label]="store.i18n.players_label()" interface="popover" [value]="store.config().players"
                    (ionChange)="store.newGame({ players: $any($event.detail.value) })">
                    @for (o of players; track o.value) { <ion-select-option [value]="o.value">{{ o.label() }}</ion-select-option> }
                  </ion-select>
                </ion-col>
              </ion-row>
            </ion-grid>
            <div class="mm-buttons">
              <ion-button fill="solid" (click)="store.newGame()">{{ store.i18n.new_game() }}</ion-button>
            </div>
          </ion-card-content>
        </ion-card>

        <div class="mm-score">
          @if (scores().length > 1) {
            @for (p of scores(); track $index) {
              <span class="mm-player" [class.active]="p.active">{{ p.name }}: {{ p.score }}</span>
            }
          } @else {
            <span>{{ movesText() }}</span>
            @if (store.bestText()) { <span class="mm-best">{{ store.bestText() }}</span> }
          }
        </div>

        <section class="mm-board" [style.grid-template-columns]="'repeat(' + cols() + ', 1fr)'">
          @for (card of cards(); track card.i) {
            <button type="button" class="mm-card" [class.up]="card.up" [class.found]="card.found"
              [attr.aria-label]="card.label" [disabled]="card.found || store.solved()" (click)="store.flip(card.i)">
              <span class="mm-inner">
                <span class="mm-back" aria-hidden="true"></span>
                <span class="mm-face" aria-hidden="true">{{ card.face }}</span>
              </span>
            </button>
          }
        </section>
      </div>
    </ion-content>
  `,
  styles: [`
    :host {
      --mm-back: #3f6f9f;
      --mm-back-dot: rgba(255, 255, 255, 0.18);
      --mm-face: #ffffff;
      --mm-edge: #c9d2db;
      --mm-found: #e6f4ea;
      --mm-ok: #3aa864;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --mm-back: #2c4a66;
        --mm-back-dot: rgba(255, 255, 255, 0.1);
        --mm-face: #232a31;
        --mm-edge: #3a4550;
        --mm-found: #1d3326;
      }
    }

    .mm-wrap { max-width: 36rem; margin: 0 auto; }
    .mm-status { min-height: 2.8em; margin: 0.25rem 0 0.75rem; font-weight: 500; text-align: center; }
    .mm-status.solved { color: var(--mm-ok); }
    .mm-setup { margin: 0 0 1rem; }
    .mm-desc { margin: 0 0 0.5rem; color: var(--ion-color-medium); }
    .mm-buttons { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.75rem; }

    .mm-score { display: flex; justify-content: center; flex-wrap: wrap; gap: 0.5rem 1.25rem; margin-bottom: 0.75rem; font-variant-numeric: tabular-nums; }
    .mm-best { color: var(--ion-color-medium); }
    .mm-player { padding: 2px 10px; border-radius: 999px; border: 1px solid transparent; }
    .mm-player.active { border-color: var(--mm-back); font-weight: 600; }

    .mm-board { display: grid; gap: 6px; width: min(100%, 34rem); margin: 0 auto; touch-action: manipulation; user-select: none; }
    .mm-card { padding: 0; border: 0; background: none; aspect-ratio: 1; perspective: 600px; cursor: pointer; }
    .mm-card:disabled { cursor: default; opacity: 1; }
    .mm-card:focus-visible { outline: 2px solid var(--mm-back); outline-offset: 2px; border-radius: 8px; }
    .mm-inner {
      position: relative; display: block; width: 100%; height: 100%;
      transform-style: preserve-3d; transition: transform 0.3s ease;
    }
    .mm-card.up .mm-inner, .mm-card.found .mm-inner { transform: rotateY(180deg); }
    .mm-back, .mm-face {
      position: absolute; inset: 0; display: grid; place-items: center; border-radius: 8px;
      backface-visibility: hidden; -webkit-backface-visibility: hidden;
    }
    .mm-back {
      background-color: var(--mm-back);
      background-image: radial-gradient(var(--mm-back-dot) 15%, transparent 16%);
      background-size: 12px 12px;
    }
    .mm-face {
      transform: rotateY(180deg); background: var(--mm-face); box-shadow: inset 0 0 0 1px var(--mm-edge);
      font-size: clamp(1.4rem, 7vw, 2.4rem); line-height: 1;
    }
    .mm-card.found .mm-face { background: var(--mm-found); }
    @media (prefers-reduced-motion: reduce) {
      .mm-inner { transition: none; }
    }
  `],
})
export class MemoryPage {
  protected readonly store = inject(MemoryStore);

  protected readonly sizes: Option<MemorySize>[] = [
    { value: 'small', label: this.store.i18n.size_small },
    { value: 'medium', label: this.store.i18n.size_medium },
    { value: 'large', label: this.store.i18n.size_large },
  ];

  protected readonly themes: Option<MemoryTheme>[] = [
    { value: 'animals', label: this.store.i18n.theme_animals },
    { value: 'food', label: this.store.i18n.theme_food },
    { value: 'sport', label: this.store.i18n.theme_sport },
  ];

  protected readonly players: Option<number>[] = [
    { value: 1, label: this.store.i18n.players_one },
    { value: 2, label: this.store.i18n.players_two },
  ];

  protected readonly cols = computed((): number => MEMORY_LAYOUT[this.store.config().size].cols);

  protected readonly cards = computed((): CardView[] => {
    const board = this.store.board();
    const symbols = this.store.symbols();
    const open = new Set(board.open);
    const found = new Set(board.matched);
    const hidden = this.store.i18n.card_hidden();
    const shown = this.store.i18n.card_open();
    return board.deck.map((id, i) => {
      const up = open.has(i) || found.has(i);
      const face = symbols[id];
      return { i, face, up, found: found.has(i), label: fill(up ? shown : hidden, { n: i + 1, face }) };
    });
  });

  protected readonly movesText = computed((): string => fill(this.store.i18n.moves(), { count: this.store.board().moves }));

  protected readonly scores = computed((): PlayerView[] => {
    const board = this.store.board();
    const name = this.store.i18n.player();
    return board.scores.map((score, p) => ({ name: fill(name, { n: p + 1 }), score, active: p === board.current && !this.store.solved() }));
  });
}
