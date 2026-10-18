import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonFabButton, IonIcon } from '@ionic/angular';

import { JassChalkUnit, JassGame, JassI18n, JassStrokes, nextTrumpMaker, slateStrokes } from '@okr/games-jasstafel-util';

import { SvgIconPipe } from '@okr/shared-pipes';

import { JassAvatar } from './jass-avatar';
import { JassChalkZ } from './jass-chalk-z';
import { JASS_CHALK_STYLES } from './jass-chalk.scss';

export type JassChalkTap = { sideId: string; unit: JassChalkUnit };

/**
 * Schieber and Büter: the slate lies between the two sides of the table. Each side has one half —
 * its total next to the middle line, the chalk Z across the full width, and below it the side's
 * avatars and its target.
 * The upper half is turned by 180° so the players opposite read it upright. Tapping a line of a
 * side's Z chalks Weis for that side (`chalk`); the big «+» in a half's corner enters a hand for
 * that side (`enter`). The middle line carries the history (left), undo (centre, between the two
 * totals) and «end game» (right) — the slate needs no footer and takes the whole screen.
 */
@Component({
  selector: 'okr-jass-slate',
  standalone: true,
  imports: [JassAvatar, JassChalkZ, SvgIconPipe, IonButton, IonFabButton, IonIcon],
  styles: [JASS_CHALK_STYLES, `
    .jass-board { display: flex; flex-direction: column; }
    .half { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 4px; }
    .half.flipped { transform: rotate(180deg); }
    .total { text-align: center; }
    /* the padding keeps the «+» a thumb's width off the board's frame (rounded screen corners) */
    .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 6px 6px; }
    .avatars { display: flex; gap: 6px; }
    .side-info { flex: 1; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    /* as big as the Logbuch's «+»: hit from across the table */
    .enter { --border-radius: 50%; width: 72px; height: 72px; margin: 0; flex: none; }
    .enter ion-icon { font-size: 36px; }
    .total { font-size: 1.8rem; font-weight: 600; line-height: 1; }
    .target { font-size: 0.95rem; }
    .midline { flex: none; display: flex; align-items: center; gap: 4px; margin: 2px 0; }
    .midline .line { flex: 1; border-top: 2px dashed rgba(242, 240, 230, 0.45); }
    .midline { padding: 0 6px; }
    .midline ion-button { --color: var(--jass-chalk); margin: 0; min-width: 48px; min-height: 48px; }
    .midline ion-icon { font-size: 28px; }
    /* «Rückgängig»: the reload arrow turned backwards */
    .mirrored { transform: scaleX(-1); }
  `],
  template: `
    <div class="jass-board">
      @for (side of game().sides; track side.id; let first = $first) {
        <div class="half" [class.flipped]="first">
          <!-- first in the half = next to the middle line (the upper half is turned by 180°) -->
          <div class="total">{{ totals()[side.id] }}</div>
          <okr-jass-chalk-z [strokes]="strokes()[side.id]" [points]="totals()[side.id]"
            [tapLabel]="i18n().weis_label()" (tapped)="chalk.emit({ sideId: side.id, unit: $event })" />
          <div class="foot">
            <div class="side-info">
              <div class="avatars">
                @for (idx of side.playerIdx; track idx) {
                  <okr-jass-avatar [avatar]="game().players[idx].avatar" [marked]="idx === maker()" />
                }
              </div>
              @if (side.target) {
                <div class="target jass-dim">{{ i18n().target() }} {{ side.target }}</div>
              }
            </div>
            <ion-fab-button class="enter" (click)="enter.emit(side.id)" [attr.aria-label]="enterLabel()">
              <ion-icon src="{{ 'add' | svgIcon }}" />
            </ion-fab-button>
          </div>
        </div>
        @if (first) {
          <div class="midline">
            <ion-button fill="clear" (click)="history.emit()" [attr.aria-label]="i18n().history()">
              <ion-icon slot="icon-only" src="{{ 'chart' | svgIcon }}" />
            </ion-button>
            <div class="line"></div>
            <ion-button fill="clear" (click)="undo.emit()" [attr.aria-label]="i18n().undo()">
              <ion-icon slot="icon-only" class="mirrored" src="{{ 'reload' | svgIcon }}" />
            </ion-button>
            <div class="line"></div>
            <ion-button fill="clear" (click)="endGame.emit()" [attr.aria-label]="i18n().end_game()">
              <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
            </ion-button>
          </div>
        }
      }
    </div>
  `,
})
export class JassSlate {
  public readonly game = input.required<JassGame>();
  public readonly totals = input.required<Record<string, number>>();
  public readonly i18n = input.required<JassI18n>();
  public readonly chalk = output<JassChalkTap>();
  /** the «+» of a side: enter the next hand from that side's view */
  public readonly enter = output<string>();
  public readonly undo = output<void>();
  public readonly history = output<void>();
  public readonly endGame = output<void>();

  protected readonly enterLabel = computed(() => this.i18n().enter_hand());

  protected readonly maker = computed(() => nextTrumpMaker(this.game()));
  protected readonly strokes = computed<Record<string, JassStrokes>>(() =>
    Object.fromEntries(this.game().sides.map(s => [s.id, slateStrokes(this.game(), s.id)])));
}
