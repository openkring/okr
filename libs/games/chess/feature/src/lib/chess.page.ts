import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import {
  AlertController, IonButton, IonCard, IonCardContent, IonCol, IonContent, IonGrid, IonRow,
  IonSelect, IonSelectOption, IonToggle,
} from '@ionic/angular/standalone';

import { ChessBoard, PIECE_IMAGES, PromotionPiece } from '@okr/games-chess-ui';
import {
  ChessSettings, ClockMinutes, Color, PieceType, colorOf, formatClock, makePiece, opponent,
  remainingMs, squareName, typeOf,
} from '@okr/games-chess-util';
import { Header } from '@okr/shared-ui';
import { confirm } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';

import { ChessStore } from './chess.store';

/**
 * `/chess` — settings, status, the board between the two players' strips (captured pieces,
 * material, clock), the actions, and the move list (beside the board on wide screens).
 */
@Component({
  selector: 'okr-chess-page',
  standalone: true,
  providers: [ChessStore],
  imports: [
    Header, ChessBoard,
    IonContent, IonCard, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonToggle, IonButton,
  ],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      <div class="ch-layout">
        <ion-card class="ch-card">
          <ion-card-content>
            <ion-grid class="ion-no-padding">
              <ion-row>
                <ion-col size="6">
                  <ion-select [label]="store.i18n.opponent_label()" labelPlacement="stacked" interface="popover"
                    [value]="store.settings().mode" (ionChange)="onSetting($event, { mode: $event.detail.value })">
                    <ion-select-option value="easy">{{ store.i18n.opponent_easy() }}</ion-select-option>
                    <ion-select-option value="medium">{{ store.i18n.opponent_medium() }}</ion-select-option>
                    <ion-select-option value="hard">{{ store.i18n.opponent_hard() }}</ion-select-option>
                    <ion-select-option value="human">{{ store.i18n.opponent_human() }}</ion-select-option>
                  </ion-select>
                </ion-col>
                <ion-col size="6">
                  @if (store.settings().mode === 'human') {
                    <ion-select [label]="store.i18n.clock_label()" labelPlacement="stacked" interface="popover"
                      [value]="store.settings().clock" (ionChange)="onSetting($event, { clock: $event.detail.value })">
                      <ion-select-option [value]="0">{{ store.i18n.clock_none() }}</ion-select-option>
                      @for (m of clockChoices; track m) {
                        <ion-select-option [value]="m">{{ minutesLabel(m) }}</ion-select-option>
                      }
                    </ion-select>
                  } @else {
                    <ion-select [label]="store.i18n.color_label()" labelPlacement="stacked" interface="popover"
                      [value]="store.settings().human" (ionChange)="onSetting($event, { human: $event.detail.value })">
                      <ion-select-option value="w">{{ store.i18n.color_white() }}</ion-select-option>
                      <ion-select-option value="b">{{ store.i18n.color_black() }}</ion-select-option>
                    </ion-select>
                  }
                </ion-col>
              </ion-row>
              @if (store.settings().mode === 'human') {
                <ion-row>
                  <ion-col size="12">
                    <ion-toggle [checked]="store.settings().autoFlip" (ionChange)="onAutoFlip($event.detail.checked)">
                      {{ store.i18n.autoflip_label() }}
                    </ion-toggle>
                  </ion-col>
                </ion-row>
              }
            </ion-grid>

            <div class="ch-status" role="status" aria-live="polite">
              @if (store.thinking() || store.hinting()) { <span class="ch-spinner" aria-hidden="true"></span> }
              <span>{{ statusText() }}</span>
            </div>
            @if (store.workerFailed()) { <p class="ch-note">{{ store.i18n.note_fallback() }}</p> }
            @if (!store.storageOk()) { <p class="ch-note">{{ store.i18n.note_storage() }}</p> }

            @let t = top();
            <div class="ch-side" [class.turn]="t.turn">
              <span class="ch-name">{{ t.name }}</span>
              <span class="ch-captured">
                @for (img of t.captured; track $index) { <img [src]="img" alt="" /> }
                @if (t.lead > 0) { <span class="ch-lead">+{{ t.lead }}</span> }
              </span>
              @if (t.clock !== null) { <span class="ch-clock" [class.low]="t.low">{{ t.clock }}</span> }
            </div>

            <okr-chess-board
              [position]="store.current()"
              [flipped]="store.flipped()"
              [interactive]="store.humanTurn()"
              [movable]="store.movable()"
              [selected]="store.selected()"
              [targets]="store.targets()"
              [lastMove]="store.lastMove()"
              [check]="store.checkSquare()"
              [hint]="store.hintMove()"
              [promotion]="promotionRequest()"
              [boardLabel]="store.i18n.board_label()"
              [squareLabels]="squareLabels()"
              [promotionLabels]="promotionLabels()"
              (pick)="store.pick($event)"
              (dropped)="store.drop($event)"
              (promote)="store.promote($event)"
              (cancelPromotion)="store.cancelPromotion()" />

            @let b = bottom();
            <div class="ch-side" [class.turn]="b.turn">
              <span class="ch-name">{{ b.name }}</span>
              <span class="ch-captured">
                @for (img of b.captured; track $index) { <img [src]="img" alt="" /> }
                @if (b.lead > 0) { <span class="ch-lead">+{{ b.lead }}</span> }
              </span>
              @if (b.clock !== null) { <span class="ch-clock" [class.low]="b.low">{{ b.clock }}</span> }
            </div>

            @if (store.result()) {
              <div class="ch-banner" role="alert">
                <span>{{ resultText() }}</span>
                <ion-button (click)="store.newGame()">{{ store.i18n.restart() }}</ion-button>
              </div>
            }

            <div class="ch-actions">
              <ion-button fill="clear" [disabled]="!store.canUndo()" (click)="store.undo()">{{ store.i18n.undo() }}</ion-button>
              <ion-button fill="clear" [disabled]="!store.humanTurn() || store.hinting()" (click)="store.hint()">{{ store.i18n.hint() }}</ion-button>
              @if (!store.result()) {
                @if (store.settings().mode === 'human') {
                  <ion-button fill="clear" (click)="onDraw()">{{ store.i18n.draw() }}</ion-button>
                }
                <ion-button fill="clear" color="danger" (click)="onResign()">{{ store.i18n.resign() }}</ion-button>
              }
              <ion-button fill="solid" (click)="onRestart()">{{ store.i18n.restart() }}</ion-button>
            </div>
          </ion-card-content>
        </ion-card>

        <ion-card class="ch-moves">
          <ion-card-content>
            <h2>{{ store.i18n.moves_title() }}</h2>
            <ol #moveList>
              @for (pair of movePairs(); track $index) {
                <li><span>{{ pair[0] }}</span><span>{{ pair[1] }}</span></li>
              }
            </ol>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  `,
  styles: [`
    .ch-layout { display: grid; gap: 1rem; max-width: 36rem; margin-inline: auto; }
    @media (min-width: 992px) {
      .ch-layout { grid-template-columns: minmax(0, 36rem) 16rem; max-width: 53rem; align-items: start; }
    }
    .ch-card, .ch-moves { margin: 0; }
    .ch-status { display: flex; align-items: center; gap: 0.6rem; min-height: 2.5em; margin: 0.5rem 0; font-weight: 500; }
    .ch-spinner { flex: none; width: 16px; height: 16px; border-radius: 50%;
      border: 2px solid var(--ion-color-light-shade); border-top-color: var(--ion-color-primary);
      animation: ch-spin 0.8s linear infinite; }
    @keyframes ch-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .ch-spinner { animation: none; } }
    .ch-note { color: var(--ion-color-medium); font-size: 0.85rem; margin: 0 0 0.5rem; }
    .ch-side { display: flex; align-items: center; gap: 0.5rem; min-height: 2rem; padding: 0.25rem 0; }
    .ch-side.turn .ch-name { color: var(--ion-color-primary); }
    .ch-name { font-weight: 700; }
    .ch-captured { flex: 1; display: flex; flex-wrap: wrap; align-items: center; min-width: 0; }
    .ch-captured img { width: 18px; height: 18px; margin-right: -4px; }
    .ch-lead { margin-left: 0.5rem; color: var(--ion-color-medium); font-size: 0.85rem; }
    .ch-clock { font-variant-numeric: tabular-nums; font-weight: 700; padding: 0.1rem 0.5rem;
      border-radius: 4px; background: var(--ion-color-light); }
    .ch-clock.low { color: var(--ion-color-danger); }
    .ch-banner { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
      margin-top: 0.75rem; padding: 0.5rem 0.75rem; border-radius: 6px;
      background: var(--ion-color-light); font-weight: 600; }
    .ch-actions { display: flex; flex-wrap: wrap; gap: 0.25rem; justify-content: flex-end; margin-top: 0.75rem; }
    .ch-moves h2 { font-size: 1rem; margin: 0 0 0.5rem; }
    .ch-moves ol { margin: 0; padding-left: 2em; max-height: 60vh; overflow-y: auto; font-variant-numeric: tabular-nums; }
    .ch-moves li span { display: inline-block; min-width: 4.5em; }
  `],
})
export class ChessPage {
  protected readonly store = inject(ChessStore);
  private readonly alertController = inject(AlertController);
  private readonly moveList = viewChild<ElementRef<HTMLOListElement>>('moveList');

  protected readonly clockChoices: ClockMinutes[] = [5, 10, 15];

  public constructor() {
    // keep the newest move in view
    effect(() => {
      this.store.san();
      const el = this.moveList()?.nativeElement;
      if (el) queueMicrotask(() => (el.scrollTop = el.scrollHeight));
    });
  }

  protected readonly movePairs = computed(() => {
    const san = this.store.san();
    const pairs: [string, string][] = [];
    for (let i = 0; i < san.length; i += 2) pairs.push([san[i], san[i + 1] ?? '']);
    return pairs;
  });

  protected readonly promotionRequest = computed(() => {
    const p = this.store.promotion();
    return p ? { to: p.to, color: this.store.current().turn } : null;
  });

  protected readonly promotionLabels = computed<Record<PromotionPiece, string>>(() => ({
    q: this.store.i18n.piece_q(), r: this.store.i18n.piece_r(),
    b: this.store.i18n.piece_b(), n: this.store.i18n.piece_n(),
  }));

  protected readonly squareLabels = computed(() => {
    const board = this.store.current().board;
    return board.map((p, sq) => p
      ? fill(this.store.i18n.square_piece(), {
        square: squareName(sq), piece: this.pieceName(typeOf(p)), color: this.colorName(colorOf(p)),
      })
      : squareName(sq));
  });

  protected readonly bottom = computed(() => this.side(this.store.flipped() ? 'b' : 'w'));
  protected readonly top = computed(() => this.side(this.store.flipped() ? 'w' : 'b'));

  protected readonly statusText = computed(() => {
    const i = this.store.i18n;
    if (this.store.result()) return this.resultText();
    if (this.store.thinking()) return i.thinking();
    if (this.store.promotion()) return i.promote();
    const turn = this.store.current().turn;
    const check = this.store.checkSquare() !== null;
    if (this.store.settings().mode === 'human') {
      return fill(check ? i.check_named() : i.turn_named(), { name: this.colorName(turn) });
    }
    return check ? i.check_you() : i.turn_you();
  });

  protected readonly resultText = computed(() => {
    const r = this.store.result();
    if (!r) return '';
    const i = this.store.i18n;
    const s = this.store.settings();
    const head = r.winner === null ? i.result_draw()
      : s.mode === 'human' ? fill(i.win_named(), { name: this.colorName(r.winner) })
      : r.winner === s.human ? i.win_you() : i.win_computer();
    const by = r.by ?? 'w';
    const reason = {
      'checkmate': i.checkmate(),
      'stalemate': i.stalemate(),
      'repetition': i.repetition(),
      'fifty-move': i.fifty_move(),
      'insufficient': i.insufficient(),
      'timeout': r.winner === null
        ? fill(i.timeout_draw(), { name: this.colorName(by), other: this.colorName(opponent(by)) })
        : fill(i.timeout(), { name: this.colorName(by) }),
      'resign': fill(i.resigned(), { name: this.colorName(by) }),
      'agreement': i.agreement(),
    }[r.kind];
    return `${head} ${reason}`;
  });

  protected minutesLabel(minutes: number): string {
    return fill(this.store.i18n.clock_minutes(), { minutes });
  }

  /** Changing a setting starts a new game; while a game runs, only after confirmation. */
  protected async onSetting(event: Event, change: Partial<ChessSettings>): Promise<void> {
    const next: ChessSettings = { ...this.store.settings(), ...change };
    if (next.mode === this.store.settings().mode && next.human === this.store.settings().human
      && next.clock === this.store.settings().clock) return;
    if (this.running() && !(await this.ask(this.store.i18n.confirm_settings()))) {
      // put the select back: its bound value did not change, so Angular would not reset it
      const key = Object.keys(change)[0] as keyof ChessSettings;
      (event.target as unknown as { value: unknown }).value = this.store.settings()[key];
      return;
    }
    this.store.newGame(next);
  }

  /** Board turning is display only and never restarts the game. */
  protected onAutoFlip(autoFlip: boolean): void {
    this.store.setAutoFlip(autoFlip);
  }

  protected async onRestart(): Promise<void> {
    if (!this.running() || (await this.ask(this.store.i18n.confirm_restart()))) this.store.newGame();
  }

  protected async onResign(): Promise<void> {
    if (await this.ask(this.store.i18n.confirm_resign())) this.store.resign();
  }

  protected async onDraw(): Promise<void> {
    if (await this.ask(this.store.i18n.confirm_draw())) this.store.agreeDraw();
  }

  private running(): boolean {
    return this.store.uci().length > 0 && !this.store.result();
  }

  private ask(message: string): Promise<boolean> {
    return confirm(this.alertController, message, this.store.i18n.confirm_ok(), this.store.i18n.confirm_cancel(), true);
  }

  private side(color: Color) {
    const s = this.store.settings();
    const clock = this.store.clock();
    const ms = clock ? remainingMs(clock, color, this.store.now()) : null;
    const taken = this.store.captures()[color];
    const lead = (color === 'w' ? 1 : -1) * this.store.balance();
    const name = s.mode === 'human' ? this.colorName(color)
      : color === s.human ? this.store.i18n.you() : this.store.i18n.computer();
    return {
      color,
      name,
      turn: !this.store.result() && this.store.current().turn === color,
      captured: taken.map((t: PieceType) => PIECE_IMAGES[makePiece(opponent(color), t)]),
      lead,
      clock: ms === null ? null : formatClock(ms),
      low: ms !== null && ms < 10_000,
    };
  }

  private colorName(c: Color): string {
    return c === 'w' ? this.store.i18n.white() : this.store.i18n.black();
  }

  private pieceName(t: PieceType): string {
    const i = this.store.i18n;
    return { k: i.piece_k(), q: i.piece_q(), r: i.piece_r(), b: i.piece_b(), n: i.piece_n(), p: i.piece_p() }[t];
  }
}
