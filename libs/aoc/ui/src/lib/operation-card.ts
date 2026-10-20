import { formatDate, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { IonButton } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { fill, ReportKind } from '@okr/shared-util-core';
import { AOC_HUB_I18N_KEYS } from '@okr/aoc-util';

export interface OperationCardAction {
  id: string;
  label: string;
  danger?: boolean;
}

export type OperationCardStatus = 'offen' | 'erledigt' | 'error';

/**
 * One tool on the AOC hub (spec 1.101 phase 5): kind badge, label, what it does, its last run and
 * an optional migration status. Presentational: it only emits `action(id)`.
 *
 * A card without `actions` is a navigation card: the whole card is a button and a tap emits
 * `action('open')`. A card with actions shows one button per action instead.
 */
@Component({
  selector: 'okr-operation-card',
  standalone: true,
  imports: [NgTemplateOutlet, IonButton],
  styles: [`
    :host { display: block; }
    .card { display: flex; flex-direction: column; gap: 6px; width: 100%; height: 100%; box-sizing: border-box; padding: 16px; border-radius: 10px;
      border: 1px solid var(--ion-color-light-shade); background: var(--ion-item-background, var(--ion-background-color));
      color: inherit; text-align: left; font: inherit; }
    button.card { cursor: pointer; }
    button.card:hover { border-color: var(--ion-color-medium); }
    .top { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: .8rem;
      background: var(--ion-color-medium); color: var(--ion-color-medium-contrast); }
    .badge.offen { background: var(--ion-color-warning); color: var(--ion-color-warning-contrast); }
    .badge.erledigt { background: var(--ion-color-success); color: var(--ion-color-success-contrast); }
    .badge.error { background: var(--ion-color-danger); color: var(--ion-color-danger-contrast); }
    .label { font-size: 1.05rem; font-weight: 600; }
    .effect { font-size: .9rem; color: var(--ion-color-step-700, var(--ion-text-color)); }
    .run { font-size: .8rem; color: var(--ion-color-medium-shade); }
    .actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: auto; padding-top: 4px; }
  `],
  template: `
    <ng-template #body>
      <span class="top">
        <span class="badge">{{ kindLabel() }}</span>
        @if (status(); as s) { <span class="badge" [class]="s">{{ statusLabel() }}</span> }
      </span>
      <span class="label">{{ label() }}</span>
      <span class="effect">{{ effect() }}</span>
      @if (runText(); as run) { <span class="run">{{ run }}</span> }
    </ng-template>

    @if (actions().length === 0) {
      <button class="card" type="button" (click)="action.emit('open')">
        <ng-container [ngTemplateOutlet]="body" />
      </button>
    } @else {
      <div class="card">
        <ng-container [ngTemplateOutlet]="body" />
        <span class="actions">
          @for (a of actions(); track a.id) {
            <ion-button size="small" fill="outline" [color]="a.danger ? 'danger' : 'primary'" (click)="action.emit(a.id)">{{ a.label }}</ion-button>
          }
        </span>
      </div>
    }
  `,
})
export class OperationCard {
  public readonly label = input.required<string>();
  public readonly effect = input.required<string>();
  public readonly kind = input.required<ReportKind>();
  public readonly lastRun = input<Date | undefined>(undefined);
  public readonly status = input<OperationCardStatus | undefined>(undefined);
  public readonly actions = input<OperationCardAction[]>([]);

  public readonly action = output<string>();

  protected readonly i18n = inject(I18nService).translateAll({
    report: AOC_HUB_I18N_KEYS.kind_report,
    check: AOC_HUB_I18N_KEYS.kind_check,
    operation: AOC_HUB_I18N_KEYS.kind_operation,
    migration: AOC_HUB_I18N_KEYS.kind_migration,
    offen: AOC_HUB_I18N_KEYS.status_offen,
    erledigt: AOC_HUB_I18N_KEYS.status_erledigt,
    error: AOC_HUB_I18N_KEYS.status_error,
    lastRun: AOC_HUB_I18N_KEYS.last_run,
    neverRun: AOC_HUB_I18N_KEYS.never_run,
  });

  protected readonly kindLabel = computed(() => this.i18n[this.kind()]());
  protected readonly statusLabel = computed(() => {
    const s = this.status();
    return s ? this.i18n[s]() : '';
  });

  /** Only an operation card has a run to report; a navigation card shows none. */
  protected readonly runText = computed(() => {
    if (this.actions().length === 0) return '';
    const run = this.lastRun();
    return run
      ? fill(this.i18n.lastRun(), { date: formatDate(run, 'dd.MM.yyyy HH:mm', 'en-US') })
      : this.i18n.neverRun();
  });
}
