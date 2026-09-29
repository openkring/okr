import { Component, computed, input, output, signal } from '@angular/core';

import { JassGame, JassI18n, nextTrumpMaker } from '@okr/games-jasstafel-util';

import { JassAvatar } from './jass-avatar';
import { JassChalkZ } from './jass-chalk-z';
import { JASS_CHALK_STYLES } from './jass-chalk.scss';

/** Schieber and Büter: one half per side, avatars left, chalk Z right; tap a half for the number. */
@Component({
  selector: 'okr-jass-slate',
  standalone: true,
  imports: [JassAvatar, JassChalkZ],
  styles: [JASS_CHALK_STYLES, `
    .half { display: grid; grid-template-columns: 64px 1fr; gap: 8px; align-items: center; padding: 8px 0; cursor: pointer; }
    .half + .half { border-top: 2px dashed rgba(242, 240, 230, 0.35); }
    .avatars { display: flex; flex-direction: column; gap: 6px; align-items: center; }
    .number { font-size: 1.6rem; text-align: right; }
    .target { font-size: 0.8rem; text-align: right; }
  `],
  template: `
    <div class="jass-board">
      @for (side of game().sides; track side.id) {
        <div class="half" role="button" tabindex="0" (click)="toggle(side.id)" (keyup.enter)="toggle(side.id)">
          <div class="avatars">
            @for (idx of side.playerIdx; track idx) {
              <okr-jass-avatar [avatar]="game().players[idx].avatar" [marked]="idx === maker()" />
            }
          </div>
          <div>
            <okr-jass-chalk-z [points]="totals()[side.id] ?? 0" [target]="side.target" />
            @if (revealed() === side.id) {
              <div class="number">{{ totals()[side.id] ?? 0 }}</div>
            }
            @if (side.target) {
              <div class="target jass-dim">{{ i18n().target() }} {{ side.target }}</div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class JassSlate {
  public readonly game = input.required<JassGame>();
  public readonly totals = input.required<Record<string, number>>();
  public readonly i18n = input.required<JassI18n>();
  public readonly sideTapped = output<string>();

  protected readonly revealed = signal<string | null>(null);
  protected readonly maker = computed(() => nextTrumpMaker(this.game()));

  protected toggle(sideId: string): void {
    this.revealed.update(r => (r === sideId ? null : sideId));
    this.sideTapped.emit(sideId);
  }
}
