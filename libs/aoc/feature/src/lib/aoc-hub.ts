import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonLabel, IonMenuButton, IonSegment, IonSegmentButton, IonTitle, IonToolbar } from '@ionic/angular';

import { EmptyList } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import { AOC_AREA_IDS, AOC_AREA_ROUTES, AOC_AREAS, AocArea, AocCard, manualAssignCount, visibleAocCards } from '@okr/aoc-util';
import { OperationCard, OperationCardAction, OperationCardStatus } from '@okr/aoc-ui';

import { AocHubStore } from './aoc-hub.store';

/** The manual room assignment in Chat-Wartung (operator-only, so always the bka route). */
const CHAT_MAINTENANCE_ROUTE = '/operator/chat';

/**
 * The AOC hub (spec 1.101 phase 5): one page per area (`area` from the route data), a segment bar
 * over the areas and the area's cards from `AOC_AREAS`, filtered by tenant, feature block and role.
 * A route card navigates; an operation card runs through `AocHubStore.run`.
 *
 * As in `AccountingSegments`, each segment button navigates on its own click rather than on the
 * segment's ionChange (a cached page's segment can already hold the tapped value, so ionChange
 * would not fire), and the segment is re-created when the area changes instead of being given a new
 * value (a hidden cached segment animates its marker from zero-width buttons and leaves it behind).
 */
@Component({
  selector: 'okr-aoc-hub',
  standalone: true,
  imports: [
    OperationCard, EmptyList,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonSegment, IonSegmentButton, IonLabel, IonContent,
  ],
  providers: [AocHubStore],
  styles: [`
    .wrap { max-width: 1200px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 28px; }
    h2 { margin: 0 0 12px; font-size: 1.05rem; }
    .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.i18n.title() }}</ion-title>
      </ion-toolbar>
      @if (segments().length > 1) {
        <ion-toolbar>
          @for (active of [currentArea()]; track active) {
            <ion-segment [scrollable]="true" color="secondary" [value]="active">
              @for (a of segments(); track a) {
                <ion-segment-button [value]="a" (click)="go(a)">
                  <ion-label>{{ areaLabel(a) }}</ion-label>
                </ion-segment-button>
              }
            </ion-segment>
          }
        </ion-toolbar>
      }
    </ion-header>
    <ion-content>
      <div class="wrap">
        @if (tools().length === 0 && migrations().length === 0) {
          <okr-empty-list [message]="store.i18n.empty()" />
        }
        @if (tools().length > 0) {
          <section class="grid">
            @for (c of tools(); track c.id) {
              <okr-operation-card [label]="label(c)" [effect]="effect(c)" [kind]="c.kind"
                [lastRun]="lastRun(c)" [actions]="actionsOf(c)" [i18n]="store.i18n"
                [busy]="!!store.running()" [running]="isRunning(c)" (action)="onAction(c, $event)" />
            }
          </section>
        }
        @if (migrations().length > 0) {
          <section>
            <h2>{{ store.i18n.group_migrations() }}</h2>
            <div class="grid">
              @for (c of migrations(); track c.id) {
                <okr-operation-card [label]="label(c)" [effect]="effect(c)" [kind]="c.kind"
                  [lastRun]="lastRun(c)" [status]="statusOf(c)" [note]="noteOf(c)" [actions]="actionsOf(c)" [i18n]="store.i18n"
                  [busy]="!!store.running()" [running]="isRunning(c)" (action)="onAction(c, $event)" />
              }
            </div>
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class AocHub {
  protected readonly store = inject(AocHubStore);
  private readonly router = inject(Router);

  /** bound from the route data; the router sets it to undefined when a route omits it */
  public readonly area = input<AocArea | undefined>(undefined);
  protected readonly currentArea = computed<AocArea>(() => this.area() ?? 'data');

  private readonly ctx = this.store.cardContext;

  /**
   * The areas that have a card for this user, plus the current one. On scs/bka these are all four;
   * on kring (only /aoc/ops exists there) a segment never points at an area without a route.
   */
  protected readonly segments = computed(() => {
    const ctx = this.ctx();
    const current = this.currentArea();
    return AOC_AREA_IDS.filter(a => a === current || visibleAocCards(AOC_AREAS, a, ctx).length > 0);
  });

  private readonly cards = computed(() => visibleAocCards(AOC_AREAS, this.currentArea(), this.ctx()));
  protected readonly tools = computed(() => this.cards().filter(c => c.group !== 'migrations'));
  protected readonly migrations = computed(() => this.cards().filter(c => c.group === 'migrations'));

  protected areaLabel(area: AocArea): string {
    return this.store.i18n[`area_${area}`]();
  }

  protected label(card: AocCard): string {
    return this.store.cardI18n[card.id + '.label']?.() ?? '';
  }

  protected effect(card: AocCard): string {
    return this.store.cardI18n[card.id + '.effect']?.() ?? '';
  }

  protected lastRun(card: AocCard): Date | undefined {
    return 'operation' in card.target ? this.store.lastRuns()[card.target.operation] : undefined;
  }

  protected isRunning(card: AocCard): boolean {
    return 'operation' in card.target && this.store.running() === card.target.operation;
  }

  /** A migration shows a status only after «Prüfen»; nothing is checked on page load. */
  protected statusOf(card: AocCard): OperationCardStatus | undefined {
    return card.group === 'migrations' && 'operation' in card.target ? this.store.migrations()[card.target.operation]?.status : undefined;
  }

  /** The rooms a finished Matrix migration leaves for the manual assignment in Chat-Wartung. */
  protected noteOf(card: AocCard): string {
    if (card.group !== 'migrations' || !('operation' in card.target)) return '';
    const state = this.store.migrations()[card.target.operation];
    const count = manualAssignCount(state);
    if (count === 0) return '';
    return fill(state?.status === 'erledigt' ? this.store.i18n.migrate_manual_done() : this.store.i18n.migrate_manual_open(), { count });
  }

  /**
   * A route card has no actions (the whole card navigates); an operation card has one button; a
   * migration has «Prüfen» and, once the check found something to do, «Ausführen».
   */
  protected actionsOf(card: AocCard): OperationCardAction[] {
    if (!('operation' in card.target)) return [];
    if (card.group === 'migrations') {
      const actions: OperationCardAction[] = [{ id: 'check', label: this.store.i18n.action_check() }];
      if (this.statusOf(card) === 'offen') actions.push({ id: 'run', label: this.store.i18n.action_run() });
      return actions;
    }
    const label = card.target.operation === 'reindex' ? this.store.i18n.action_preview() : this.store.i18n.action_run();
    return [{ id: 'run', label }];
  }

  protected async onAction(card: AocCard, actionId: string): Promise<void> {
    if ('route' in card.target) {
      if (actionId === 'open') await this.router.navigateByUrl(card.target.route);
      return;
    }
    if (card.group === 'migrations') {
      if (actionId === 'note') await this.router.navigateByUrl(CHAT_MAINTENANCE_ROUTE);
      if (actionId === 'check' || actionId === 'run') await this.store.run(card.target.operation, actionId === 'run' ? 'apply' : 'check');
      return;
    }
    if (actionId === 'run') await this.store.run(card.target.operation);
  }

  protected async go(area: AocArea): Promise<void> {
    if (area === this.currentArea()) return;
    await this.router.navigateByUrl(AOC_AREA_ROUTES[area]);
  }
}
