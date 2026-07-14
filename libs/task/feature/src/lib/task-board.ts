import { AsyncPipe } from '@angular/common';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, computed, inject, output, signal } from '@angular/core';
import { IonAvatar, IonBadge, IonChip, IonIcon, IonImg, IonLabel } from '@ionic/angular/standalone';

import { SIZE_MD } from '@okr/shared-constants';
import { TaskModel } from '@okr/shared-models';
import { PrettyDatePipe, SvgIconPipe } from '@okr/shared-pipes';
import { TranslatePipe } from '@okr/shared-i18n';
import { getItemLabel } from '@okr/shared-util-core';

import { AvatarPipe } from '@okr/avatar-ui';
import { isTerminalTaskState, TaskBoardColumn } from '@okr/task-util';
import { TaskMove, TaskStore } from './task.store';

/**
 * The Kanban board: a *view* over the tasks the TaskStore already filters — not an entity
 * (spec D6). Columns come from the `task_state` category list, so their order, icon and colour
 * are admin-editable data. Dropping a card writes exactly one document (state + rank +
 * completionDate).
 *
 * It injects the TaskStore **provided by its parent** (TaskList) — deliberately no `providers`
 * array — so the board and the list share one store, and therefore one set of filters.
 *
 * Mobile: the seven states do not fit on a phone, so the terminal / parking columns
 * (done, cancelled, later) are collapsed behind a toggle below SIZE_MD; the rest scroll
 * horizontally.
 */
@Component({
  selector: 'okr-task-board',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe, PrettyDatePipe, AvatarPipe,
    CdkDropListGroup, CdkDropList, CdkDrag,
    IonIcon, IonLabel, IonBadge, IonChip, IonAvatar, IonImg,
  ],
  styles: [`
    .board { display: flex; gap: 12px; padding: 12px; overflow-x: auto; align-items: flex-start; height: 100%; }
    .column { flex: 0 0 280px; display: flex; flex-direction: column; background: var(--ion-color-light); border-radius: 8px; border-top: 3px solid var(--column-accent); }
    .column.collapsed { flex: 0 0 56px; }
    .column-header { display: flex; align-items: center; gap: 6px; padding: 8px 10px; cursor: pointer; }
    .column-header .title { flex: 1; font-weight: 600; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .column.collapsed .title { display: none; }
    .cards { flex: 1; min-height: 60px; padding: 0 8px 8px; overflow-y: auto; }
    .card { background: var(--ion-background-color); border: 1px solid var(--ion-color-step-150, #e0e0e0); border-radius: 6px; padding: 8px; margin-bottom: 8px; cursor: pointer; }
    .card.cdk-drag-disabled { cursor: default; opacity: 0.75; }
    .card-name { font-size: 0.9rem; }
    .card-meta { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
    .card-meta ion-avatar { width: 22px; height: 22px; background-color: var(--ion-color-light); }
    .card-meta .due { margin-left: auto; font-size: 0.75rem; color: var(--ion-color-medium); }
    .empty { padding: 8px; font-size: 0.8rem; color: var(--ion-color-medium); }
    .cdk-drag-preview { box-shadow: 0 5px 5px -3px rgba(0,0,0,.2), 0 8px 10px 1px rgba(0,0,0,.14); }
    .cdk-drag-placeholder { opacity: 0.4; }
    .cdk-drop-list-dragging .card:not(.cdk-drag-placeholder) { transition: transform 200ms cubic-bezier(0, 0, 0.2, 1); }
  `],
  template: `
    @if(columns().length === 0) {
      <div class="empty">{{ store.i18n.board_no_states() }}</div>
    } @else {
      <div class="board" cdkDropListGroup>
        @for(column of columns(); track column.name) {
          <div class="column" [class.collapsed]="isCollapsed(column.name)"
               [style.--column-accent]="column.color.length > 0 ? column.color : 'var(--ion-color-medium)'">
            <div class="column-header" (click)="toggleColumn(column.name)">
              <ion-icon src="{{ column.icon | svgIcon }}" />
              <span class="title">{{ columnLabel(column.name) | translate | async }}</span>
              <ion-badge color="medium">{{ column.tasks.length }}</ion-badge>
            </div>
            @if(!isCollapsed(column.name)) {
              <div class="cards" cdkDropList [cdkDropListData]="column" (cdkDropListDropped)="onDrop($event)">
                @if(column.tasks.length === 0) {
                  <div class="empty">{{ store.i18n.board_empty_column() }}</div>
                }
                @for(task of column.tasks; track task.okey) {
                  <div class="card" cdkDrag [cdkDragData]="task" [cdkDragDisabled]="!store.canChangeTask(task)"
                       (click)="taskSelected.emit(task)">
                    <ion-label class="card-name">{{ task.name }}</ion-label>
                    <div class="card-meta">
                      @if(task.assignee !== undefined) {
                        <ion-avatar>
                          <ion-img src="{{ task.assignee.modelType + '.' + task.assignee.key | avatar }}" alt="Avatar" />
                        </ion-avatar>
                      }
                      @for(tag of tagsOf(task); track tag) {
                        <ion-chip color="primary"><ion-label>{{ tag }}</ion-label></ion-chip>
                      }
                      @if(task.dueDate.length > 0) {
                        <span class="due">{{ task.dueDate | prettyDate }}</span>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>
    }
  `,
})
export class TaskBoard {
  protected readonly store = inject(TaskStore);   // provided by the parent (TaskList) — do NOT re-provide

  public readonly taskSelected = output<TaskModel>();
  public readonly taskMoved = output<TaskMove>();

  protected readonly columns = computed(() => this.store.boardColumns());

  /**
   * Terminal / parking columns start collapsed on a phone: seven columns do not fit (spec §7).
   * Any column header can be clicked to collapse or expand it.
   */
  private readonly collapsed = signal<ReadonlySet<string>>(
    new Set(typeof window !== 'undefined' && window.innerWidth < SIZE_MD
      ? this.store.boardColumns().filter(c => isTerminalTaskState(c.name)).map(c => c.name)
      : [])
  );

  protected isCollapsed(name: string): boolean {
    return this.collapsed().has(name);
  }

  protected toggleColumn(name: string): void {
    const next = new Set(this.collapsed());
    next.has(name) ? next.delete(name) : next.add(name);
    this.collapsed.set(next);
  }

  protected columnLabel(name: string): string {
    const states = this.store.states();
    return states ? getItemLabel(states, name) : name;
  }

  protected tagsOf(task: TaskModel): string[] {
    return task.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  }

  /**
   * A card was dropped. `currentIndex` is the index in the target column *after* the moved card
   * has been taken out of it — which is exactly what `columnTasks` (the target column minus the
   * moved card) is indexed by, for both a reorder and a cross-column move.
   *
   * We do not mutate the column arrays here. The store writes to Firestore, and the rxfire
   * real-time stream feeds the change straight back into `boardColumns()`.
   */
  protected onDrop(event: CdkDragDrop<TaskBoardColumn>): void {
    const task = event.item.data as TaskModel;
    const column = event.container.data;
    this.taskMoved.emit({
      task,
      targetState: column.name,
      targetIndex: event.currentIndex,
      columnTasks: column.tasks.filter(candidate => candidate.okey !== task.okey),
    });
  }
}
