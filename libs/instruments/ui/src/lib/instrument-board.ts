import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, computed, input, output, signal } from '@angular/core';
import { IonBadge, IonButton, IonIcon } from '@ionic/angular/standalone';

import { SIZE_MD } from '@okr/shared-constants';
import { InstrumentTopic } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { BoardCell, GridDefinition, groupTopicsByCell, hasSource, InstrumentTopicSource, rankForInsertion } from '@okr/instruments-util';

/** Emitted when a card is dropped: a single `{ cell, rank }` change (spec D4 — no form state). */
export interface InstrumentTopicMove {
  topic: InstrumentTopic;
  targetCell: string;
  targetRank: string;
}

/**
 * The shared board primitive (spec §2.24). A **dumb** renderer: it draws a declarative
 * `GridDefinition` as a CSS Grid (with cell spanning), lays each cell's topics out as a
 * rank-ordered CDK drop list, and emits intents — it never touches Firestore or a store.
 *
 * The same component renders SWOT / PESTEL / BMC / Eisenhower by swapping `definition` + `topics`.
 * i18n is store-driven (D6): the consumer resolves cell labels and passes them in via `labels`
 * (keyed by cell id); absent, the raw `labelKey` shows as a fallback.
 *
 * Mobile (< SIZE_MD): the grid collapses to full-width stacked cells in definition (reading) order.
 * List-per-cell vertical drag still works on touch; a cross-cell move on a phone is better done by
 * tapping the card (→ `topicSelected`, the consumer's edit-then-save editor changes the cell).
 *
 * Seeded from the shipped Kanban `TaskBoard` — same CDK wiring, same one-write-per-drop, same
 * collapse pattern.
 */
@Component({
  selector: 'okr-instrument-board',
  standalone: true,
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, SvgIconPipe, IonIcon, IonBadge, IonButton],
  styles: [`
    .board { display: grid; gap: 10px; padding: 12px; height: 100%; align-content: start; }
    .cell { display: flex; flex-direction: column; background: var(--ion-color-light); border-radius: 8px; border-top: 3px solid var(--cell-accent); min-height: 96px; }
    .cell-header { display: flex; align-items: center; gap: 6px; padding: 8px 10px; cursor: pointer; }
    .cell-header .title { flex: 1; font-weight: 600; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cell-header ion-button { --padding-start: 4px; --padding-end: 4px; height: 26px; margin: 0; }
    .cards { flex: 1; min-height: 48px; padding: 0 8px 8px; overflow-y: auto; }
    .card { display: flex; align-items: center; gap: 6px; background: var(--ion-background-color); border: 1px solid var(--ion-color-step-150, #e0e0e0); border-left: 4px solid var(--card-accent, transparent); border-radius: 6px; padding: 8px; margin-bottom: 8px; cursor: pointer; }
    .card.cdk-drag-disabled { cursor: default; opacity: 0.75; }
    .card-body { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .card-label { font-size: 0.9rem; }
    .source { display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; color: var(--ion-color-medium); cursor: pointer; }
    .source ion-icon { font-size: 0.9rem; }
    .empty { padding: 8px; font-size: 0.8rem; color: var(--ion-color-medium); }
    .cell.collapsed .cards, .cell.collapsed .add { display: none; }
    .cdk-drag-preview { box-shadow: 0 5px 5px -3px rgba(0,0,0,.2), 0 8px 10px 1px rgba(0,0,0,.14); }
    .cdk-drag-placeholder { opacity: 0.4; }
    .cdk-drop-list-dragging .card:not(.cdk-drag-placeholder) { transition: transform 200ms cubic-bezier(0, 0, 0.2, 1); }
  `],
  template: `
    <div class="board" cdkDropListGroup
         [style.grid-template-columns]="stacked() ? '1fr' : 'repeat(' + definition().cols + ', 1fr)'"
         [style.grid-template-rows]="stacked() ? 'none' : 'repeat(' + definition().rows + ', minmax(96px, auto))'">
      @for (bc of board(); track bc.cell.id) {
        <div class="cell" [class.collapsed]="isCollapsed(bc.cell.id)"
             [style.grid-column]="stacked() ? 'auto' : bc.cell.colStart + ' / span ' + bc.cell.colSpan"
             [style.grid-row]="stacked() ? 'auto' : bc.cell.rowStart + ' / span ' + bc.cell.rowSpan"
             [style.--cell-accent]="bc.cell.color && bc.cell.color.length > 0 ? bc.cell.color : 'var(--ion-color-medium)'">
          <div class="cell-header" (click)="toggleCell(bc.cell.id)">
            @if (bc.cell.icon) { <ion-icon src="{{ bc.cell.icon | svgIcon }}" /> }
            <span class="title">{{ cellLabel(bc) }}</span>
            <ion-badge color="medium">{{ bc.topics.length }}</ion-badge>
            @if (!readOnly()) {
              <ion-button class="add" fill="clear" size="small"
                          (click)="$event.stopPropagation(); topicAdded.emit(bc.cell.id)">
                <ion-icon src="{{ 'add' | svgIcon }}" slot="icon-only" />
              </ion-button>
            }
          </div>
          @if (!isCollapsed(bc.cell.id)) {
            <div class="cards" cdkDropList [cdkDropListData]="bc" (cdkDropListDropped)="onDrop($event)">
              @if (bc.topics.length === 0) {
                <div class="empty">{{ emptyLabel() }}</div>
              }
              @for (topic of bc.topics; track topic.key) {
                <div class="card" cdkDrag [cdkDragData]="topic" [cdkDragDisabled]="readOnly()"
                     [style.--card-accent]="topic.color && topic.color.length > 0 ? topic.color : 'transparent'"
                     (click)="topicSelected.emit(topic)">
                  <div class="card-body">
                    <span class="card-label">{{ topic.label }}</span>
                    @if (isLinked(topic)) {
                      <span class="source" (click)="$event.stopPropagation(); sourceOpened.emit(topic)">
                        <ion-icon src="{{ sourceIcon(topic) | svgIcon }}" />
                        @if (sourceText(topic); as text) { <span>{{ text }}</span> }
                      </span>
                    }
                  </div>
                  @if (topic.score.impact > 0) {
                    <ion-badge color="primary">{{ topic.score.impact }}</ion-badge>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class InstrumentBoard {
  /** The grid to render (its cells, spans and label keys). */
  public readonly definition = input.required<GridDefinition>();
  /** All topics of the instrument; grouped into cells by this component. */
  public readonly topics = input.required<InstrumentTopic[]>();
  /** Resolved cell labels keyed by cell id (store-driven i18n). Missing keys fall back to labelKey. */
  public readonly labels = input<Record<string, string>>({});
  /** Text for an empty cell (already i18n-resolved by the consumer). */
  public readonly emptyLabel = input('');
  /** Disables drag and the add button. */
  public readonly readOnly = input(false);
  /**
   * Resolved link info per topic (OQ-3), keyed by `topic.key`. The consumer resolves each linked
   * entity (`sourceType`/`sourceKey`) via data-access and passes its icon / label / derived status;
   * the board renders a source chip on those cards. A card also counts as linked when its
   * `sourceKey` is set, even without an entry here (the chip then shows the fallback link icon).
   */
  public readonly sources = input<Record<string, InstrumentTopicSource>>({});

  public readonly topicMoved = output<InstrumentTopicMove>();
  public readonly topicSelected = output<InstrumentTopic>();
  public readonly topicAdded = output<string>();
  /** A card's source chip was tapped — the consumer navigates to the linked entity. */
  public readonly sourceOpened = output<InstrumentTopic>();

  /** Fallback icon when a linked topic has no resolved source icon. */
  private static readonly LINK_ICON = 'link';

  protected isLinked(topic: InstrumentTopic): boolean {
    return hasSource(topic) || this.sources()[topic.key] !== undefined;
  }

  protected sourceIcon(topic: InstrumentTopic): string {
    return this.sources()[topic.key]?.icon ?? InstrumentBoard.LINK_ICON;
  }

  /** The chip's caption: derived status if present, else the linked entity's label. */
  protected sourceText(topic: InstrumentTopic): string {
    const source = this.sources()[topic.key];
    return source?.status ?? source?.label ?? '';
  }

  protected readonly board = computed<BoardCell[]>(() => groupTopicsByCell(this.topics(), this.definition()));

  /** Below SIZE_MD the grid stacks into a single column (spec D5). */
  protected readonly stacked = signal<boolean>(typeof window !== 'undefined' && window.innerWidth < SIZE_MD);

  private readonly collapsed = signal<ReadonlySet<string>>(new Set());

  protected isCollapsed(cellId: string): boolean {
    return this.collapsed().has(cellId);
  }

  protected toggleCell(cellId: string): void {
    const next = new Set(this.collapsed());
    next.has(cellId) ? next.delete(cellId) : next.add(cellId);
    this.collapsed.set(next);
  }

  protected cellLabel(bc: BoardCell): string {
    return this.labels()[bc.cell.id] ?? bc.cell.labelKey;
  }

  /**
   * A card was dropped. `currentIndex` indexes the target cell *after* the moved card is removed —
   * exactly what `rankForInsertion` expects (target topics minus the moved one). One `{cell, rank}`
   * change is emitted; the parent writes it and the live stream feeds the board back (D4).
   */
  protected onDrop(event: CdkDragDrop<BoardCell>): void {
    const topic = event.item.data as InstrumentTopic;
    const target = event.container.data;
    const remaining = target.topics.filter(candidate => candidate.key !== topic.key);
    this.topicMoved.emit({
      topic,
      targetCell: target.cell.id,
      targetRank: rankForInsertion(remaining, event.currentIndex),
    });
  }
}
