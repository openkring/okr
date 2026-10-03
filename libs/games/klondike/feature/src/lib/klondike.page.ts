import { Component, DestroyRef, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import { Card, Source, Suit } from '@okr/games-klondike-util';

import { KlondikeStore } from './klondike.store';

const SUIT_GLYPH: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_INDEX: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };

/** Vertical step between stacked cards in a column, in card widths. */
const STEP_DOWN = 0.16;
const STEP_UP = 0.3;

export type CardView = {
  key: string;
  source: Source;
  faceUp: boolean;
  red: boolean;
  rank: string;
  suit: string;
  label: string;
  /** Distance from the top of the column, in card widths. */
  off: number;
  selected: boolean;
};

type ColumnView = { index: number; cards: CardView[]; span: number };
type FoundationView = { index: number; top: CardView | null; label: string };

/** Whether `source` lies within the cards picked up at `picked`. */
function covers(picked: Source | null, source: Source): boolean {
  if (!picked || picked.kind !== source.kind) return false;
  if (picked.kind === 'waste') return true;
  if (picked.index !== (source as { index: number }).index) return false;
  return picked.kind !== 'tableau' || (source as { card: number }).card >= picked.card;
}

/**
 * Patience (Klondike) — build four piles from ace to king, one per suit. Same frame as Sudoku
 * (`libs/games/sudoku`): status line, a settings card, then the board.
 *
 * Tap a card and it goes where it fits best (a foundation first); if it fits nowhere it is
 * selected, and the next tap on a pile puts it there. Cards are CSS `<button>`s, sized from the
 * board width so all seven columns fit a phone.
 */
@Component({
  selector: 'okr-klondike-page',
  standalone: true,
  providers: [KlondikeStore],
  imports: [NgTemplateOutlet, Header, IonContent, IonCard, IonCardContent, IonSelect, IonSelectOption, IonButton],
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      <div class="kl-wrap">

        <p class="kl-status" role="status" aria-live="polite" [class.won]="store.won()">{{ store.statusText() }}</p>
        <p class="kl-stats">{{ store.statsText() }}</p>

        <ion-card class="kl-setup">
          <ion-card-content>
            <p class="kl-desc">{{ store.i18n.desc() }}</p>
            <ion-select
              [label]="store.i18n.draw_label()"
              interface="popover"
              [value]="store.drawNext()"
              (ionChange)="setDraw($event.detail.value)">
              <ion-select-option [value]="1">{{ store.i18n.draw_one() }}</ion-select-option>
              <ion-select-option [value]="3">{{ store.i18n.draw_three() }}</ion-select-option>
            </ion-select>
            <div class="kl-buttons">
              <ion-button fill="outline" [disabled]="!store.history().length || store.won() || store.autoFinishing()" (click)="store.undo()">
                {{ store.i18n.undo() }}
              </ion-button>
              <ion-button fill="solid" (click)="store.newGame()">{{ store.i18n.new_game() }}</ion-button>
            </div>
          </ion-card-content>
        </ion-card>

        <section class="kl-board">
          <div class="kl-top">
            <button type="button" class="kl-slot kl-stock" [attr.aria-label]="stockLabel()" (click)="store.tapStock()">
              @if (store.game().stock.length) {
                <span class="kl-card down" aria-hidden="true"></span>
              } @else {
                <span class="kl-recycle" aria-hidden="true">↻</span>
              }
            </button>

            <div class="kl-slot" data-pile="waste" [attr.aria-label]="store.i18n.waste()">
              @if (waste(); as c) {
                <ng-container *ngTemplateOutlet="cardTpl; context: { $implicit: c }" />
              }
            </div>

            <span aria-hidden="true"></span>

            @for (f of foundations(); track f.index) {
              <div class="kl-slot" [attr.data-pile]="'foundation-' + f.index">
                @if (f.top; as c) {
                  <ng-container *ngTemplateOutlet="cardTpl; context: { $implicit: c }" />
                } @else {
                  <button type="button" class="kl-empty" [attr.aria-label]="f.label"
                    (click)="store.tapPile({ kind: 'foundation', index: f.index })">A</button>
                }
              </div>
            }
          </div>

          <div class="kl-columns">
            @for (col of columns(); track col.index) {
              <div class="kl-col" [attr.data-pile]="'tableau-' + col.index" [style.--kl-span]="col.span">
                @for (c of col.cards; track c.key) {
                  <ng-container *ngTemplateOutlet="cardTpl; context: { $implicit: c }" />
                } @empty {
                  <button type="button" class="kl-slot kl-empty" [attr.aria-label]="columnEmptyLabel(col.index)"
                    (click)="store.tapPile({ kind: 'tableau', index: col.index })">K</button>
                }
              </div>
            }
          </div>

          @if (store.canAutoFinish()) {
            <ion-button expand="block" class="kl-finish" (click)="autoFinish()">{{ store.i18n.auto_finish() }}</ion-button>
          }
        </section>
      </div>
    </ion-content>

    <ng-template #cardTpl let-c>
      <button type="button" class="kl-card" [class.down]="!c.faceUp" [class.red]="c.red" [class.sel]="c.selected"
        [style.--kl-off]="c.off" [attr.aria-label]="c.label" [attr.aria-pressed]="c.selected"
        (click)="onCard(c.source)">
        @if (c.faceUp) {
          <span class="kl-corner" aria-hidden="true">{{ c.rank }}<br>{{ c.suit }}</span>
          <span class="kl-pip" aria-hidden="true">{{ c.suit }}</span>
        }
      </button>
    </ng-template>
  `,
  styles: [`
    :host {
      --kl-felt: #2f7a4b;
      --kl-line: rgba(255, 255, 255, 0.45);
      --kl-face: #ffffff;
      --kl-ink: #1f262d;
      --kl-red: #c62828;
      --kl-back-a: #2b6cb0;
      --kl-back-b: #1e4e80;
      --kl-sel: #f6c343;
      --kl-ok: #3aa864;
      --kl-gap: 4px;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --kl-felt: #1d4d30;
        --kl-face: #eef1f4;
        --kl-red: #d32f2f;
        --kl-back-a: #3a6ea5;
        --kl-back-b: #24496f;
      }
    }

    .kl-wrap { max-width: 40rem; margin: 0 auto; }
    .kl-status { min-height: 2.8em; margin: 0.25rem 0 0; font-weight: 500; text-align: center; }
    .kl-status.won { color: var(--kl-ok); }
    .kl-stats { margin: 0 0 0.75rem; text-align: center; color: var(--ion-color-medium); font-variant-numeric: tabular-nums; }
    .kl-setup { margin: 0 0 1rem; }
    .kl-desc { margin: 0 0 0.5rem; color: var(--ion-color-medium); }
    .kl-buttons { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.75rem; }

    /*
     * The card width comes from the board width (container query units), so seven columns
     * always fit. Tracks are minmax(0, 1fr), never bare 1fr — see the Sudoku board.
     */
    .kl-board {
      container-type: inline-size; padding: 0.5rem; border-radius: 8px; background: var(--kl-felt);
      user-select: none; -webkit-user-select: none;
    }
    .kl-top, .kl-columns {
      --kl-cw: calc((100cqi - 6 * var(--kl-gap)) / 7);
      display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--kl-gap);
    }
    .kl-columns { margin-top: 0.75rem; }

    .kl-slot {
      position: relative; aspect-ratio: 5 / 7; min-width: 0; padding: 0;
      border: 1px dashed var(--kl-line); border-radius: 6%; background: transparent;
    }
    .kl-stock { cursor: pointer; }
    .kl-recycle, .kl-empty {
      display: grid; place-items: center; width: 100%; height: 100%; padding: 0; border: 0;
      background: transparent; color: var(--kl-line); font-size: calc(var(--kl-cw) * 0.4); cursor: pointer;
    }
    .kl-col .kl-empty { border: 1px dashed var(--kl-line); border-radius: 6%; aspect-ratio: 5 / 7; height: auto; }

    .kl-col { position: relative; min-width: 0; min-height: calc(var(--kl-cw) * (1.4 + var(--kl-span, 0))); }

    .kl-card {
      position: absolute; left: 0; top: calc(var(--kl-cw) * var(--kl-off, 0)); width: 100%;
      aspect-ratio: 5 / 7; padding: 0; overflow: hidden; cursor: pointer;
      border: 1px solid rgba(0, 0, 0, 0.25); border-radius: 6%;
      background: var(--kl-face); color: var(--kl-ink); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }
    .kl-slot > .kl-card { top: 0; }
    .kl-card.red { color: var(--kl-red); }
    .kl-card.down {
      cursor: default;
      background: repeating-linear-gradient(45deg, var(--kl-back-a) 0 4px, var(--kl-back-b) 4px 8px);
      border: 2px solid var(--kl-face);
    }
    .kl-card.sel { box-shadow: 0 0 0 3px var(--kl-sel); z-index: 1; }
    .kl-card:focus-visible { outline: 3px solid var(--kl-sel); outline-offset: 0; }
    .kl-corner {
      position: absolute; top: 3%; left: 6%; font-size: calc(var(--kl-cw) * 0.24);
      line-height: 1; font-weight: 600; text-align: center;
    }
    .kl-pip { position: absolute; right: 8%; bottom: 6%; font-size: calc(var(--kl-cw) * 0.45); line-height: 1; }

    .kl-finish { margin-top: 0.75rem; }

    @media (prefers-reduced-motion: no-preference) {
      .kl-card { transition: top 0.12s ease-out; }
    }
  `],
})
export class KlondikePage {
  protected readonly store = inject(KlondikeStore);

  /** The comma lists from the i18n bundle, split once per language change. */
  private readonly names = computed(() => ({
    short: this.store.i18n.ranks_short().split(','),
    long: this.store.i18n.ranks_long().split(','),
    suits: this.store.i18n.suits().split(','),
  }));

  protected readonly columns = computed((): ColumnView[] => {
    const selected = this.store.selected();
    return this.store.game().tableau.map((col, index) => {
      let off = 0;
      const cards = col.map((card, i) => {
        const source: Source = { kind: 'tableau', index, card: i };
        const view = this.view(card, source, off, covers(selected, source));
        off += card.faceUp ? STEP_UP : STEP_DOWN;
        return view;
      });
      return { index, cards, span: cards.length ? cards[cards.length - 1].off : 0 };
    });
  });

  protected readonly waste = computed((): CardView | null => {
    const waste = this.store.game().waste;
    const top = waste[waste.length - 1];
    const source: Source = { kind: 'waste' };
    return top ? this.view(top, source, 0, covers(this.store.selected(), source)) : null;
  });

  protected readonly foundations = computed((): FoundationView[] => {
    const selected = this.store.selected();
    return this.store.game().foundations.map((pile, index) => {
      const top = pile[pile.length - 1];
      const source: Source = { kind: 'foundation', index };
      return {
        index,
        top: top ? this.view(top, source, 0, covers(selected, source)) : null,
        label: fill(this.store.i18n.foundation(), { n: index + 1 }),
      };
    });
  });

  protected readonly stockLabel = computed((): string => {
    const count = this.store.game().stock.length;
    return count ? fill(this.store.i18n.stock(), { count }) : this.store.i18n.stock_empty();
  });

  protected view(card: Card, source: Source, off: number, selected: boolean): CardView {
    const names = this.names();
    const label = card.faceUp
      ? fill(this.store.i18n.card_label(), { suit: names.suits[SUIT_INDEX[card.suit]], rank: names.long[card.rank - 1] })
      : this.store.i18n.card_hidden();
    return {
      key: `${card.rank}${card.suit}`,
      source,
      faceUp: card.faceUp,
      red: card.suit === 'H' || card.suit === 'D',
      rank: names.short[card.rank - 1],
      suit: SUIT_GLYPH[card.suit],
      label,
      off,
      selected,
    };
  }

  protected columnEmptyLabel(index: number): string {
    return fill(this.store.i18n.column_empty(), { n: index + 1 });
  }

  protected setDraw(value: unknown): void {
    this.store.setDrawNext(value === 3 ? 3 : 1);
  }

  protected onCard(source: Source): void {
    this.store.tapCard(source);
  }

  protected autoFinish(): void {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.store.autoFinish(reduce ? 0 : 120);
  }

  /**
   * Ionic keeps a page in the DOM after navigating away from it, so the document listener stays
   * attached; it only acts while this page is the visible one. The clock pauses with it.
   */
  private active = false;
  private timer: ReturnType<typeof setInterval> | undefined;

  public constructor() {
    inject(DestroyRef).onDestroy(() => this.stopClock());
  }

  public ionViewDidEnter(): void {
    this.active = true;
    this.store.resume();
    this.timer ??= setInterval(() => this.store.tick(), 1000);
  }

  public ionViewWillLeave(): void {
    this.active = false;
    this.stopClock();
  }

  private stopClock(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.store.pause();
  }

  protected onKey(event: KeyboardEvent): void {
    if (!this.active) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, ion-select, ion-popover')) return;
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      this.store.undo();
      event.preventDefault();
    }
  }
}
