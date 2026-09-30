import { Component, computed, input, output } from '@angular/core';
import { IonButton } from '@ionic/angular/standalone';

import { JassGame, JassI18n, JassSideStats, formatDuration, jassTiming } from '@okr/games-jasstafel-util';

import { JassAvatar } from './jass-avatar';
import { JASS_CHALK_STYLES } from './jass-chalk.scss';

/** The end of a game: winner's avatars (or «Unentschieden») and the statistics per side. */
@Component({
  selector: 'okr-jass-result',
  standalone: true,
  imports: [JassAvatar, IonButton],
  styles: [JASS_CHALK_STYLES, `
    .jass-board { display: flex; flex-direction: column; justify-content: space-evenly; }
    .winners { display: flex; gap: 8px; justify-content: center; margin: 8px 0 16px; }
    h2 { text-align: center; margin: 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th, td { padding: 4px; text-align: right; } th:first-child, td:first-child { text-align: left; }
    .buttons { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .timing { display: flex; flex-wrap: wrap; gap: 4px 16px; justify-content: center; margin-bottom: 12px; }
  `],
  template: `
    <div class="jass-board">
      <h2>{{ outcome() === 'draw' ? i18n().draw() : i18n().winner() }}</h2>
      @if (winnerSide(); as w) {
        <div class="winners">
          @for (idx of w.playerIdx; track idx) { <okr-jass-avatar [avatar]="game().players[idx].avatar" /> }
        </div>
      }
      @if (timing().date) {
        <div class="timing jass-dim">
          <span>{{ i18n().stat_date() }} {{ timing().date }}</span>
          <span>{{ i18n().stat_start() }} {{ timing().start }}</span>
          @if (duration()) { <span>{{ i18n().stat_duration() }} {{ duration() }}</span> }
        </div>
      }
      <table>
        <thead>
          <tr><th></th>
            @for (side of game().sides; track side.id) {
              <th>@for (idx of side.playerIdx; track idx) { <okr-jass-avatar [avatar]="game().players[idx].avatar" /> }</th>
            }
          </tr>
        </thead>
        <tbody>
          <tr><td>{{ i18n().sum() }}</td>@for (s of game().sides; track s.id) { <td>{{ totals()[s.id] }}</td> }</tr>
          <tr><td>{{ i18n().stat_points() }}</td>@for (s of game().sides; track s.id) { <td>{{ stats()[s.id].pointsPlayed }}</td> }</tr>
          <tr><td>{{ i18n().stat_weis() }}</td>@for (s of game().sides; track s.id) { <td>{{ stats()[s.id].weis }}</td> }</tr>
          <tr><td>{{ i18n().stat_matches() }}</td>@for (s of game().sides; track s.id) { <td>{{ stats()[s.id].matches }}</td> }</tr>
          <tr><td>{{ i18n().stat_average() }}</td>@for (s of game().sides; track s.id) { <td>{{ stats()[s.id].average }}</td> }</tr>
        </tbody>
      </table>
      <div class="buttons">
        <ion-button (click)="newGame.emit()">{{ i18n().new_game() }}</ion-button>
        @if (diaryState() !== 'hidden') {
          <ion-button fill="outline" [disabled]="diaryState() === 'done' || diaryBusy()" (click)="toDiary.emit()">
            {{ diaryState() === 'done' ? i18n().in_diary() : i18n().to_diary() }}
          </ion-button>
        }
        <ion-button fill="outline" (click)="done.emit()">{{ i18n().done() }}</ion-button>
      </div>
    </div>
  `,
})
export class JassResult {
  public readonly game = input.required<JassGame>();
  public readonly outcome = input.required<string>();
  public readonly stats = input.required<Record<string, JassSideStats>>();
  public readonly totals = input.required<Record<string, number>>();
  public readonly i18n = input.required<JassI18n>();
  /** 'hidden' without a configured diary tenant (spec 1.67 §11) */
  public readonly diaryState = input<'hidden' | 'ready' | 'done'>('hidden');
  public readonly diaryBusy = input(false);
  public readonly newGame = output<void>();
  public readonly done = output<void>();
  public readonly toDiary = output<void>();

  protected readonly timing = computed(() => jassTiming(this.game()));
  protected readonly duration = computed(() => formatDuration(this.timing().minutes));
  protected readonly winnerSide = computed(() => this.game().sides.find(s => s.id === this.outcome()));
}
