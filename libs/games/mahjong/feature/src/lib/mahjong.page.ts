import { Component, DestroyRef, computed, inject } from '@angular/core';
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
  IonToggle,
} from '@ionic/angular';

import { Header } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import { MAHJONG_KINDS, MahjongI18n, MahjongLayout, layoutBounds, layoutSlots } from '@okr/games-mahjong-util';

import { MahjongTile } from './mahjong-tile';
import { MahjongStore } from './mahjong.store';

type Option<T> = { value: T; label: () => string };

type TileView = {
  i: number;
  kind: string;
  alive: boolean;
  free: boolean;
  selected: boolean;
  hint: boolean;
  refused: boolean;
  left: string;
  top: string;
  z: number;
  label: string;
  caption: string;
};

/* Geometry of the drawn board, in base pixels: a tile is 56 × 74, a half step 28 × 37, and each
 * layer sits 5 px left and 6 px up from the one below so the stack shows its depth. */
const HALF_W = 28;
const HALF_H = 37;
const TILE_W = 56;
const TILE_H = 74;
const LAYER_DX = 5;
const LAYER_DY = 6;
const EDGE = 12;

function tileName(i18n: MahjongI18n, kind: string): string {
  const k = MAHJONG_KINDS[kind];
  switch (k.suit) {
    case 'dot': return fill(i18n.tile_dot(), { n: k.rank });
    case 'bam': return fill(i18n.tile_bam(), { n: k.rank });
    case 'char': return fill(i18n.tile_char(), { n: k.rank });
    case 'wind': return i18n[`tile_wind_${kind.slice(1)}` as 'tile_wind_E']();
    case 'dragon': return i18n[`tile_dragon_${kind.slice(1)}` as 'tile_dragon_R']();
    case 'flower': return fill(i18n.tile_flower(), { name: i18n[`flower_${k.rank}` as 'flower_1']() });
    default: return fill(i18n.tile_season(), { name: i18n[`season_${k.rank}` as 'season_1']() });
  }
}

function caption(i18n: MahjongI18n, kind: string): string {
  const k = MAHJONG_KINDS[kind];
  if (k.suit === 'flower') return i18n[`flower_${k.rank}` as 'flower_1']();
  if (k.suit === 'season') return i18n[`season_${k.rank}` as 'season_1']();
  return '';
}

/**
 * Mahjong solitaire — take pairs of matching free tiles until the stack is cleared. Same frame
 * as the other games: status line, a settings card, then the board.
 *
 * The board is one container (`container-type: inline-size`) whose width sets `--u`, a base pixel;
 * every tile, offset, shadow and glyph is sized in `--u`, so the stack scales as one picture from
 * a phone to a desktop. Tiles are `<button>`s placed in percent of the board; removed tiles stay
 * in the DOM and fade out.
 */
@Component({
  selector: 'okr-mahjong-page',
  standalone: true,
  providers: [MahjongStore],
  host: { '(document:keydown)': 'onKey($event)', '(document:visibilitychange)': 'onVisibility()' },
  imports: [
    Header, MahjongTile,
    IonContent, IonCard, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonToggle, IonButton,
  ],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      <div class="mj-wrap">

        <p class="mj-status" role="status" aria-live="polite" [class.won]="store.won()" [class.stuck]="store.stuck()">{{ store.statusText() }}</p>

        <ion-card class="mj-setup">
          <ion-card-content>
            <p class="mj-desc">{{ store.i18n.desc() }}</p>
            <ion-grid class="ion-no-padding">
              <ion-row class="ion-align-items-center">
                <ion-col size="12" size-md="6">
                  <ion-select [label]="store.i18n.layout_label()" interface="popover" [value]="store.game().layout"
                    (ionChange)="store.setLayout($any($event.detail.value))">
                    @for (o of layouts; track o.value) { <ion-select-option [value]="o.value">{{ o.label() }}</ion-select-option> }
                  </ion-select>
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-toggle [checked]="store.dimLocked()" (ionChange)="store.setDimLocked($event.detail.checked)">
                    {{ store.i18n.dim_locked() }}
                  </ion-toggle>
                </ion-col>
              </ion-row>
            </ion-grid>
            <div class="mj-buttons">
              <ion-button fill="solid" (click)="store.newGame()">{{ store.i18n.new_game() }}</ion-button>
              <ion-button fill="outline" [disabled]="!store.history().length || store.won()" (click)="store.undo()">{{ store.i18n.undo() }}</ion-button>
              <ion-button fill="outline" [disabled]="store.won() || store.stuck()" (click)="store.showHint()">{{ store.i18n.hint() }}</ion-button>
              <ion-button [fill]="store.stuck() ? 'solid' : 'outline'" [disabled]="store.won()" (click)="store.shuffle()">{{ store.i18n.shuffle() }}</ion-button>
            </div>
          </ion-card-content>
        </ion-card>

        <p class="mj-stats">{{ store.statsText() }}</p>

        <div class="mj-table" [style.--mj-ratio]="ratio()">
          <section class="mj-board" [class.dim]="store.dimLocked()"
            [style.aspect-ratio]="ratio()" [style.--u]="unit()">
            @for (t of tiles(); track t.i) {
              <button type="button" class="mj-tile"
                [class.gone]="!t.alive" [class.locked]="!t.free" [class.sel]="t.selected"
                [class.hint]="t.hint" [class.refused]="t.refused"
                [style.left]="t.left" [style.top]="t.top" [style.z-index]="t.z"
                [attr.aria-label]="t.label" [attr.aria-pressed]="t.selected"
                [disabled]="!t.alive || store.won()" [tabindex]="t.alive && t.free ? 0 : -1"
                (click)="store.tap(t.i)">
                <okr-mahjong-tile [kindId]="t.kind" [caption]="t.caption" />
              </button>
            }
          </section>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    :host {
      --mj-tile: #f5eedd;
      --mj-tile-hi: #fffaf0;
      --mj-edge: #d6c9ab;
      --mj-side: #2f6f5e;
      --mj-shadow: rgba(20, 40, 32, 0.28);
      --mj-select: #b8322a;
      --mj-hint: #2f8f6e;
      --mj-felt: rgba(47, 111, 94, 0.07);
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --mj-side: #2a6555;
        --mj-shadow: rgba(0, 0, 0, 0.55);
        --mj-select: #ef6a5c;
        --mj-hint: #5fc79f;
        --mj-felt: rgba(95, 179, 154, 0.07);
      }
    }

    .mj-wrap { max-width: 64rem; margin: 0 auto; }
    .mj-status { min-height: 2.8em; margin: 0.25rem 0 0.75rem; font-weight: 500; text-align: center; }
    .mj-status.won { color: var(--ion-color-success); }
    .mj-status.stuck { color: var(--ion-color-warning-shade); }
    .mj-setup { margin: 0 0 1rem; }
    .mj-desc { margin: 0 0 0.5rem; color: var(--ion-color-medium); }
    .mj-buttons { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.75rem; }
    .mj-stats { margin: 0 0 0.75rem; text-align: center; color: var(--ion-color-medium); font-variant-numeric: tabular-nums; }

    /* The table caps the board so a whole board fits the screen height on a desktop. */
    .mj-table {
      container-type: inline-size;
      width: min(100%, calc((100dvh - 8rem) * var(--mj-ratio)));
      margin: 0 auto; padding: 0.5rem 0;
      border-radius: 12px; background: radial-gradient(ellipse at 50% 40%, var(--mj-felt), transparent 70%);
    }
    .mj-board { position: relative; width: 100%; touch-action: manipulation; user-select: none; -webkit-user-select: none; }

    .mj-tile {
      position: absolute; width: calc(${TILE_W} * var(--u)); height: calc(${TILE_H} * var(--u));
      padding: 0; border: 0; border-radius: calc(7 * var(--u)); cursor: pointer; color: inherit;
      background: linear-gradient(150deg, var(--mj-tile-hi) 0%, var(--mj-tile) 70%);
      box-shadow:
        inset 0 0 0 calc(1 * var(--u)) var(--mj-edge),
        calc(1 * var(--u)) calc(1 * var(--u)) 0 var(--mj-edge),
        calc(5 * var(--u)) calc(6 * var(--u)) 0 var(--mj-side),
        calc(7 * var(--u)) calc(9 * var(--u)) calc(9 * var(--u)) var(--mj-shadow);
      transition: transform 0.12s ease, filter 0.15s ease, opacity 0.2s ease;
    }
    .mj-tile:disabled { cursor: default; opacity: 1; }
    .mj-tile:focus-visible { outline: calc(3 * var(--u)) solid var(--mj-select); outline-offset: calc(1 * var(--u)); }
    .mj-board.dim .mj-tile.locked:not(.gone) { filter: brightness(0.72) saturate(0.7); }
    .mj-tile.sel {
      transform: translate(calc(-1 * var(--u)), calc(-3 * var(--u)));
      box-shadow:
        inset 0 0 0 calc(1 * var(--u)) var(--mj-edge),
        0 0 0 calc(3 * var(--u)) var(--mj-select),
        calc(5 * var(--u)) calc(6 * var(--u)) 0 var(--mj-side),
        calc(7 * var(--u)) calc(11 * var(--u)) calc(12 * var(--u)) var(--mj-shadow);
    }
    .mj-tile.hint { animation: mj-hint 0.5s ease-in-out 3; }
    .mj-tile.refused { animation: mj-shake 0.28s ease; }
    .mj-tile.gone { opacity: 0; transform: scale(0.85); pointer-events: none; }
    @keyframes mj-hint {
      50% { box-shadow: inset 0 0 0 calc(1 * var(--u)) var(--mj-edge), 0 0 0 calc(4 * var(--u)) var(--mj-hint), calc(5 * var(--u)) calc(6 * var(--u)) 0 var(--mj-side); }
    }
    @keyframes mj-shake {
      25% { transform: translateX(calc(-3 * var(--u))); }
      75% { transform: translateX(calc(3 * var(--u))); }
    }
    @media (prefers-reduced-motion: reduce) {
      .mj-tile { transition: none; }
      .mj-tile.hint, .mj-tile.refused { animation: none; }
      .mj-tile.hint { outline: calc(4 * var(--u)) solid var(--mj-hint); }
    }
  `],
})
export class MahjongPage {
  protected readonly store = inject(MahjongStore);

  protected readonly layouts: Option<MahjongLayout>[] = [
    { value: 'pagoda', label: this.store.i18n.layout_pagoda },
    { value: 'towers', label: this.store.i18n.layout_towers },
    { value: 'pyramid', label: this.store.i18n.layout_pyramid },
  ];

  /** Board size in base pixels for the current layout. */
  private readonly size = computed((): { w: number; h: number; layers: number } => {
    const b = layoutBounds(this.store.game().layout);
    return {
      w: b.width * HALF_W + (b.layers - 1) * LAYER_DX + EDGE,
      h: b.height * HALF_H + (b.layers - 1) * LAYER_DY + EDGE,
      layers: b.layers,
    };
  });

  protected readonly ratio = computed((): string => String(this.size().w / this.size().h));
  protected readonly unit = computed((): string => `calc(100cqw / ${this.size().w})`);

  protected readonly tiles = computed((): TileView[] => {
    const game = this.store.game();
    const slots = layoutSlots(game.layout);
    const { w, h, layers } = this.size();
    const free = this.store.free();
    const selected = this.store.selected();
    const hint = this.store.hint();
    const refused = this.store.refused();
    const i18n = this.store.i18n;
    const blocked = i18n.tile_blocked();
    return slots.map((s, i) => {
      const kind = game.kinds[i];
      const name = tileName(i18n, kind);
      const isFree = free.has(i);
      return {
        i,
        kind,
        alive: game.alive[i],
        free: isFree,
        selected: selected === i,
        hint: !!hint && (hint[0] === i || hint[1] === i),
        refused: refused === i,
        left: `${((s.x * HALF_W + (layers - 1 - s.z) * LAYER_DX) / w) * 100}%`,
        top: `${((s.y * HALF_H + (layers - 1 - s.z) * LAYER_DY) / h) * 100}%`,
        // higher layers on top; within a layer, lower and further-right tiles cover the depth edge of their neighbours
        z: s.z * 10000 + s.y * 100 + s.x + 1,
        label: isFree ? name : fill(blocked, { name }),
        caption: caption(i18n, kind),
      };
    });
  });

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

  protected onVisibility(): void {
    if (!this.active) return;
    if (document.hidden) this.store.pause();
    else this.store.resume();
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
