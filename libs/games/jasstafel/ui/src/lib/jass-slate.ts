import { Component, computed, input, output } from '@angular/core';

import { JassChalkUnit, JassGame, JassI18n, JassStrokes, nextTrumpMaker, slateStrokes } from '@okr/games-jasstafel-util';

import { JassAvatar } from './jass-avatar';
import { JassChalkZ } from './jass-chalk-z';
import { JASS_CHALK_STYLES } from './jass-chalk.scss';

export type JassChalkTap = { sideId: string; unit: JassChalkUnit };

/**
 * Schieber and Büter: the slate lies between the two sides of the table. Each side has one half —
 * the chalk Z across the full width, and below it the side's avatars, its total and its target.
 * The upper half is turned by 180° so the players opposite read it upright. Tapping a line of a
 * side's Z chalks Weis for that side (`chalk`).
 */
@Component({
  selector: 'okr-jass-slate',
  standalone: true,
  imports: [JassAvatar, JassChalkZ],
  styles: [JASS_CHALK_STYLES, `
    .jass-board { display: flex; flex-direction: column; }
    .half { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 4px; }
    .half.flipped { transform: rotate(180deg); }
    .foot { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; }
    .avatars { display: flex; gap: 6px; }
    .total { font-size: 1.8rem; font-weight: 600; line-height: 1; }
    .target { font-size: 0.95rem; justify-self: end; }
    .midline { flex: none; border-top: 2px dashed rgba(242, 240, 230, 0.45); margin: 6px 0; }
  `],
  template: `
    <div class="jass-board">
      @for (side of game().sides; track side.id; let first = $first) {
        <div class="half" [class.flipped]="first">
          <okr-jass-chalk-z [strokes]="strokes()[side.id]" [points]="totals()[side.id]"
            [tapLabel]="i18n().weis_label()" (tapped)="chalk.emit({ sideId: side.id, unit: $event })" />
          <div class="foot">
            <div class="avatars">
              @for (idx of side.playerIdx; track idx) {
                <okr-jass-avatar [avatar]="game().players[idx].avatar" [marked]="idx === maker()" />
              }
            </div>
            <div class="total">{{ totals()[side.id] }}</div>
            @if (side.target) {
              <div class="target jass-dim">{{ i18n().target() }} {{ side.target }}</div>
            }
          </div>
        </div>
        @if (first) {
          <div class="midline"></div>
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

  protected readonly maker = computed(() => nextTrumpMaker(this.game()));
  protected readonly strokes = computed<Record<string, JassStrokes>>(() =>
    Object.fromEntries(this.game().sides.map(s => [s.id, slateStrokes(this.game(), s.id)])));
}
