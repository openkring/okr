import { Component, computed, input } from '@angular/core';

import { JassGame, JassI18n, nextTrumpMaker } from '@okr/games-jasstafel-util';

import { JassAvatar } from './jass-avatar';
import { JassChalkZ } from './jass-chalk-z';
import { JASS_CHALK_STYLES } from './jass-chalk.scss';

/**
 * Schieber and Büter: the slate lies between the two sides of the table. Each side has one half —
 * the chalk Z across the full width, and below it the side's avatars (left) and target (right).
 * The upper half is turned by 180° so the players opposite read it the right way up; both totals
 * are written as numbers just below the middle line.
 */
@Component({
  selector: 'okr-jass-slate',
  standalone: true,
  imports: [JassAvatar, JassChalkZ],
  styles: [JASS_CHALK_STYLES, `
    .jass-board { display: flex; flex-direction: column; }
    .half { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 4px; }
    .half.flipped { transform: rotate(180deg); }
    .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .avatars { display: flex; gap: 6px; }
    .target { font-size: 0.95rem; }
    .midline { flex: none; border-top: 2px dashed rgba(242, 240, 230, 0.45); margin: 6px 0;
      display: flex; justify-content: center; padding-top: 4px; font-size: 1.5rem; line-height: 1.2; }
    .midline .sep { margin: 0 0.4em; opacity: 0.6; }
  `],
  template: `
    <div class="jass-board">
      @for (side of game().sides; track side.id; let first = $first) {
        <div class="half" [class.flipped]="first">
          <okr-jass-chalk-z [points]="totals()[side.id]" />
          <div class="foot">
            <div class="avatars">
              @for (idx of side.playerIdx; track idx) {
                <okr-jass-avatar [avatar]="game().players[idx].avatar" [marked]="idx === maker()" />
              }
            </div>
            @if (side.target) {
              <div class="target jass-dim">{{ i18n().target() }} {{ side.target }}</div>
            }
          </div>
        </div>
        @if (first) {
          <div class="midline" [attr.aria-label]="scoreLine()">
            <span>{{ upperTotal() }}</span><span class="sep">:</span><span>{{ lowerTotal() }}</span>
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

  protected readonly maker = computed(() => nextTrumpMaker(this.game()));
  protected readonly upperTotal = computed(() => this.totals()[this.game().sides[0].id] ?? 0);
  protected readonly lowerTotal = computed(() => this.totals()[this.game().sides[1]?.id] ?? 0);
  protected readonly scoreLine = computed(() => `${this.upperTotal()} : ${this.lowerTotal()}`);
}
