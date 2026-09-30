import { Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';

import { Color, PieceType, Position, Square, colorOf, fileOf, makePiece, rankOf } from '@okr/games-chess-util';

import { PIECE_IMAGES } from './chess-pieces';

export interface SquarePair { from: Square; to: Square }
export type PromotionPiece = Exclude<PieceType, 'k' | 'p'>;
export interface PromotionRequest { to: Square; color: Color }

const PROMOTION_PIECES: PromotionPiece[] = ['q', 'r', 'b', 'n'];
const SQUARES = Array.from({ length: 64 }, (_, sq) => sq);
/** SVG units a pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 12;

interface Drag { from: Square; x: number; y: number; sx: number; sy: number; moved: boolean }

/**
 * The chess board: ONE SVG with an 800-unit viewBox (100 per square), like the Mühle board, so
 * squares, pieces, highlights and the promotion picker can never drift apart at any size.
 *
 * Dumb: it reports `pick` (press on a square) and `dropped` (release of a dragged piece on another
 * square); the store decides what they mean. Tap-tap and drag-and-drop both end in the same calls.
 */
@Component({
  selector: 'okr-chess-board',
  standalone: true,
  template: `
    <svg #svg class="cb" viewBox="0 0 800 800" [attr.aria-label]="boardLabel()"
      (pointerdown)="onDown($event)" (pointermove)="onMove($event)"
      (pointerup)="onUp($event)" (pointercancel)="drag.set(null)">
      <defs>
        <marker id="cb-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto">
          <path d="M0 0L10 5L0 10z" class="cb-arrow-head" />
        </marker>
      </defs>

      @for (sq of squares; track sq) {
        <rect [attr.x]="x(sq)" [attr.y]="y(sq)" width="100" height="100" [attr.class]="shade(sq)" />
      }
      @if (lastMove(); as m) {
        <rect class="cb-last" [attr.x]="x(m.from)" [attr.y]="y(m.from)" width="100" height="100" />
        <rect class="cb-last" [attr.x]="x(m.to)" [attr.y]="y(m.to)" width="100" height="100" />
      }
      @if (selected() !== null) {
        <!-- not "@if (selected(); as s)": a8 is square 0 and would never show -->
        <rect class="cb-sel" [attr.x]="x(selected()!)" [attr.y]="y(selected()!)" width="100" height="100" />
      }
      @if (check() !== null) {
        <circle class="cb-check" [attr.cx]="x(check()!) + 50" [attr.cy]="y(check()!) + 50" r="46" />
      }
      @for (sq of squares; track sq) {
        @if (fileLabel(sq); as f) {
          <text [attr.class]="'cb-coord ' + shade(sq)" [attr.x]="x(sq) + 93" [attr.y]="y(sq) + 94" text-anchor="end">{{ f }}</text>
        }
        @if (rankLabel(sq); as r) {
          <text [attr.class]="'cb-coord ' + shade(sq)" [attr.x]="x(sq) + 6" [attr.y]="y(sq) + 22">{{ r }}</text>
        }
      }

      @for (sq of squares; track sq) {
        @if (position().board[sq]; as p) {
          @if (!(drag()?.moved && drag()?.from === sq)) {
            <image [attr.href]="images[p]" [attr.x]="x(sq)" [attr.y]="y(sq)" width="100" height="100" />
          }
        }
      }
      @for (t of targets(); track t) {
        @if (position().board[t]) {
          <circle class="cb-ring" [attr.cx]="x(t) + 50" [attr.cy]="y(t) + 50" r="45" />
        } @else {
          <circle class="cb-dot" [attr.cx]="x(t) + 50" [attr.cy]="y(t) + 50" r="15" />
        }
      }
      @if (hint(); as h) {
        <line class="cb-hint" [attr.x1]="x(h.from) + 50" [attr.y1]="y(h.from) + 50"
          [attr.x2]="x(h.to) + 50" [attr.y2]="y(h.to) + 50" marker-end="url(#cb-arrow)" />
      }
      @if (drag(); as d) {
        @if (d.moved && position().board[d.from]; as p) {
          <image class="cb-drag" [attr.href]="images[p]" [attr.x]="d.x - 50" [attr.y]="d.y - 50" width="100" height="100" />
        }
      }

      @for (sq of focusable(); track sq) {
        <rect class="cb-key" [attr.x]="x(sq)" [attr.y]="y(sq)" width="100" height="100"
          tabindex="0" role="button" [attr.aria-label]="squareLabels()[sq]"
          (keydown.enter)="pick.emit(sq)" (keydown.space)="$event.preventDefault(); pick.emit(sq)" />
      }

      @if (promotion(); as pr) {
        <rect class="cb-veil" x="0" y="0" width="800" height="800" (click)="cancelPromotion.emit()" />
        @for (t of promotionPieces; track t; let i = $index) {
          <g class="cb-promo" tabindex="0" role="button" [attr.aria-label]="promotionLabels()[t]"
            (click)="$event.stopPropagation(); promote.emit(t)" (keydown.enter)="promote.emit(t)"
            (keydown.space)="$event.preventDefault(); promote.emit(t)" (keydown.escape)="cancelPromotion.emit()">
            <rect [attr.x]="x(pr.to)" [attr.y]="promoY(pr.to, i)" width="100" height="100" />
            <image [attr.href]="images[piece(pr.color, t)]" [attr.x]="x(pr.to)" [attr.y]="promoY(pr.to, i)" width="100" height="100" />
          </g>
        }
      }
    </svg>
  `,
  styles: [`
    :host {
      display: block;
      --cb-l: #eeeed2; --cb-d: #769656;
      --cb-last: rgb(255 214 0 / 0.45); --cb-sel: rgb(20 85 30 / 0.5);
      --cb-check: rgb(220 0 0 / 0.7); --cb-hint: var(--ion-color-primary);
    }
    @media (prefers-color-scheme: dark) { :host { --cb-l: #b8b8a0; --cb-d: #4f6b3a; } }
    .cb { display: block; width: 100%; height: auto; border-radius: 4px;
      touch-action: none; user-select: none; -webkit-user-select: none; }
    .l { fill: var(--cb-l); } .d { fill: var(--cb-d); }
    .cb-last { fill: var(--cb-last); } .cb-sel { fill: var(--cb-sel); }
    .cb-check { fill: var(--cb-check); filter: blur(8px); }
    image, text, .cb-last, .cb-sel, .cb-check, .cb-dot, .cb-ring, .cb-hint { pointer-events: none; }
    .cb-dot { fill: rgb(0 0 0 / 0.25); }
    .cb-ring { fill: none; stroke: rgb(0 0 0 / 0.25); stroke-width: 8; }
    .cb-hint { stroke: var(--cb-hint); stroke-width: 14; stroke-linecap: round; opacity: 0.8; }
    .cb-arrow-head { fill: var(--cb-hint); }
    .cb-coord { font: 600 20px system-ui, sans-serif; }
    .cb-coord.l { fill: var(--cb-d); } .cb-coord.d { fill: var(--cb-l); }
    .cb-key { fill: transparent; outline: none; }
    .cb-key:focus-visible { stroke: var(--cb-hint); stroke-width: 6; }
    .cb-veil { fill: rgb(0 0 0 / 0.45); }
    .cb-promo { cursor: pointer; outline: none; }
    .cb-promo rect { fill: #fff; stroke: #999; stroke-width: 2; }
    .cb-promo:focus-visible rect { stroke: var(--cb-hint); stroke-width: 6; }
  `],
})
export class ChessBoard {
  public readonly position = input.required<Position>();
  public readonly flipped = input(false);
  /** The person may act on the board right now. */
  public readonly interactive = input(false);
  /** Squares whose piece has a legal move (keyboard focus targets). */
  public readonly movable = input<readonly Square[]>([]);
  public readonly selected = input<Square | null>(null);
  public readonly targets = input<readonly Square[]>([]);
  public readonly lastMove = input<SquarePair | null>(null);
  public readonly check = input<Square | null>(null);
  public readonly hint = input<SquarePair | null>(null);
  public readonly promotion = input<PromotionRequest | null>(null);
  public readonly boardLabel = input('');
  public readonly squareLabels = input<readonly string[]>([]);
  public readonly promotionLabels = input<Readonly<Record<PromotionPiece, string>>>({ q: 'Q', r: 'R', b: 'B', n: 'N' });

  public readonly pick = output<Square>();
  public readonly dropped = output<Square>();
  public readonly promote = output<PromotionPiece>();
  public readonly cancelPromotion = output<void>();

  protected readonly squares = SQUARES;
  protected readonly promotionPieces = PROMOTION_PIECES;
  protected readonly images = PIECE_IMAGES;
  protected readonly drag = signal<Drag | null>(null);

  protected readonly focusable = computed(() =>
    this.interactive() && !this.promotion() ? [...new Set([...this.movable(), ...this.targets()])] : []);

  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  protected x(sq: Square): number {
    return (this.flipped() ? 7 - fileOf(sq) : fileOf(sq)) * 100;
  }

  protected y(sq: Square): number {
    const row = sq >> 3;
    return (this.flipped() ? 7 - row : row) * 100;
  }

  protected shade(sq: Square): string {
    return (fileOf(sq) + rankOf(sq)) % 2 === 1 ? 'l' : 'd';
  }

  protected fileLabel(sq: Square): string {
    return this.y(sq) === 700 ? 'abcdefgh'[fileOf(sq)] : '';
  }

  protected rankLabel(sq: Square): string {
    return this.x(sq) === 0 ? String(rankOf(sq) + 1) : '';
  }

  /** The four picker squares run from the promotion square towards the board's middle. */
  protected promoY(to: Square, i: number): number {
    return this.y(to) === 0 ? i * 100 : 700 - i * 100;
  }

  protected piece(color: Color, type: PromotionPiece) {
    return makePiece(color, type);
  }

  protected onDown(e: PointerEvent): void {
    if (this.promotion() || !this.interactive()) return;
    const p = this.toSvg(e);
    const sq = this.squareAt(p.x, p.y);
    if (sq === null) return;
    this.pick.emit(sq);
    const piece = this.position().board[sq];
    if (piece && colorOf(piece) === this.position().turn) {
      this.svg().nativeElement.setPointerCapture(e.pointerId);
      this.drag.set({ from: sq, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false });
    }
  }

  protected onMove(e: PointerEvent): void {
    const d = this.drag();
    if (!d) return;
    const p = this.toSvg(e);
    const moved = d.moved || Math.hypot(p.x - d.sx, p.y - d.sy) > DRAG_THRESHOLD;
    this.drag.set({ ...d, x: p.x, y: p.y, moved });
  }

  protected onUp(e: PointerEvent): void {
    const d = this.drag();
    this.drag.set(null);
    if (!d?.moved) return;
    const p = this.toSvg(e);
    const sq = this.squareAt(p.x, p.y);
    if (sq !== null && sq !== d.from) this.dropped.emit(sq);
  }

  private toSvg(e: PointerEvent): { x: number; y: number } {
    const r = this.svg().nativeElement.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 800, y: ((e.clientY - r.top) / r.height) * 800 };
  }

  private squareAt(x: number, y: number): Square | null {
    if (x < 0 || y < 0 || x >= 800 || y >= 800) return null;
    const col = Math.floor(x / 100);
    const row = Math.floor(y / 100);
    return (this.flipped() ? 7 - row : row) * 8 + (this.flipped() ? 7 - col : col);
  }
}
