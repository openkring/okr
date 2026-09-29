import { Component, computed, input } from '@angular/core';

import { JassGame, JassI18n, cardPointsOf, handValues, nextTrumpMaker, totals } from '@okr/games-jasstafel-util';

import { JassAvatar } from './jass-avatar';
import { JASS_CHALK_STYLES } from './jass-chalk.scss';

type GridRow = { key: string; label: string; cells: { main: string; sub: string }[] };

/**
 * Coiffeur (rows × teams) and Differenzler (hands × players) as a chalk grid. Coiffeur cells show
 * the team's multiplied score for that row; Differenzler cells show the penalty with announced /
 * actual underneath.
 */
@Component({
  selector: 'okr-jass-grid',
  standalone: true,
  imports: [JassAvatar],
  styles: [JASS_CHALK_STYLES, `
    table { width: 100%; height: 100%; border-collapse: collapse; }
    th, td { border: 1px solid rgba(242, 240, 230, 0.35); padding: 4px 6px; text-align: center; }
    th.row { text-align: left; font-weight: 400; }
    .heads { display: flex; gap: 4px; justify-content: center; }
    tfoot td { font-size: 1.2rem; font-weight: 600; }
    .small { font-size: 0.75rem; }
  `],
  template: `
    <div class="jass-board">
      <table>
        <thead>
          <tr>
            <th></th>
            @for (side of game().sides; track side.id) {
              <th><div class="heads">
                @for (idx of side.playerIdx; track idx) {
                  <okr-jass-avatar [avatar]="game().players[idx].avatar" [marked]="idx === maker()" />
                }
              </div></th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.key) {
            <tr>
              <th class="row">{{ row.label }}</th>
              @for (cell of row.cells; track $index) {
                <td>
                  {{ cell.main }}
                  @if (cell.sub) { <div class="small jass-dim">{{ cell.sub }}</div> }
                </td>
              }
            </tr>
          }
        </tbody>
        <tfoot>
          <tr>
            <td>{{ i18n().sum() }}</td>
            @for (side of game().sides; track side.id) { <td>{{ sums()[side.id] }}</td> }
          </tr>
        </tfoot>
      </table>
    </div>
  `,
})
export class JassGrid {
  public readonly game = input.required<JassGame>();
  public readonly i18n = input.required<JassI18n>();
  /** Differenzler: announcements entered for the hand that is being played right now */
  public readonly pendingAnnounced = input<number[] | null>(null);

  protected readonly maker = computed(() => nextTrumpMaker(this.game()));
  protected readonly sums = computed(() => totals(this.game()));

  protected readonly rows = computed<GridRow[]>(() => {
    const g = this.game();
    if (g.variant === 'coiffeur') {
      return g.config.coiffeurRows.map(r => ({
        key: r.id,
        label: `${r.label} ${r.multiplier}×`,
        cells: g.sides.map(s => {
          const h = g.hands.find(x => x.trump === r.id && x.sideId === s.id);
          return { main: h ? String(handValues(g, h)[s.id]) : '', sub: '' };
        }),
      }));
    }
    const played: GridRow[] = g.hands.map((h, i) => ({
      key: 'h' + i,
      label: String(i + 1),
      cells: g.sides.map(s => ({
        main: String(handValues(g, h)[s.id]),
        sub: `${h.announced?.[s.id] ?? 0} / ${cardPointsOf(h, s.id)}`,
      })),
    }));
    const pending = this.pendingAnnounced();
    if (pending) {
      played.push({ key: 'pending', label: String(g.hands.length + 1),
        cells: g.sides.map((_, i) => ({ main: '…', sub: `${pending[i] ?? 0} / –` })) });
    }
    return played;
  });
}
