import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonPopover,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { Menu } from '@okr/cms-menu-feature';
import { HearingQuizNodeModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Spinner } from '@okr/shared-ui';
import { error } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';

import { HearingQuizTreeRow, hasDirectQuestions, questionCount } from '@okr/games-hearing-quiz-util';

import { HearingQuizStore } from './hearing-quiz.store';

/**
 * The Hörtraining entry page: the tenant's tree of topics, trainings and questions (spec §3).
 *
 * The tree renders as ONE flat, depth-indented list — that is what lets a single CDK drop list
 * reorder and re-parent rows in edit mode (`planDrop` interprets where a row landed). Content
 * admins switch edit mode from the context menu (`toggleEditMode`); in edit mode a tap edits,
 * the chevron still opens and closes a folder, and each row's `…` button opens the same actions
 * a drag offers (move/copy to a chosen folder) — the touch and keyboard alternative to dragging.
 */
@Component({
  selector: 'okr-hearing-quiz-tree-page',
  standalone: true,
  providers: [HearingQuizStore],
  imports: [
    SvgIconPipe, Menu, Spinner,
    CdkDropList, CdkDrag, CdkDragHandle,
    IonHeader, IonToolbar, IonButtons, IonButton, IonMenuButton, IonTitle, IonIcon, IonPopover,
    IonContent,
  ],
  styles: [`
    .hq-tree { max-width: 900px; margin: 0 auto; padding: 8px 8px 32px; }
    .hq-row {
      display: flex; align-items: center; gap: 4px; min-height: 60px; padding: 4px 8px;
      border-bottom: 1px solid var(--ion-color-light-shade); background: var(--ion-background-color, #fff);
      cursor: pointer; font-size: 1.15rem;
    }
    .hq-row:focus-visible { outline: 3px solid var(--ion-color-warning); outline-offset: -3px; }
    .hq-chevron { width: 44px; height: 44px; flex: 0 0 44px; display: grid; place-items: center; border-radius: 50%; }
    .hq-chevron.empty { visibility: hidden; }
    .hq-kind { font-size: 24px; flex: 0 0 28px; color: var(--ion-color-primary); }
    .hq-title { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
    .hq-meta { display: block; font-size: 0.9rem; color: var(--ion-color-medium-shade); }
    .hq-handle { cursor: grab; font-size: 24px; color: var(--ion-color-medium); padding: 8px; }
    .hq-banner { margin: 8px; padding: 12px 16px; border-radius: 8px; background: rgba(var(--ion-color-warning-rgb), 0.15); font-size: 1rem; }
    .cdk-drag-preview { box-shadow: 0 6px 18px rgba(0,0,0,0.25); opacity: 0.95; }
    .cdk-drag-placeholder { opacity: 0.3; }
    .cdk-drop-list-dragging .hq-row:not(.cdk-drag-placeholder) { transition: transform 200ms ease; }
    .hq-empty { padding: 32px 16px; font-size: 1.1rem; text-align: center; color: var(--ion-color-medium-shade); }
  `],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.i18n.title() }}</ion-title>
        @if (store.isContentAdmin()) {
          <ion-buttons slot="end">
            <ion-button id="c_hearing_quiz">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="c_hearing_quiz" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="menuName()" [toggleStates]="{ toggleEditMode: store.editMode() }" />
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="hq-tree">
        @if (store.editMode()) {
          <div class="hq-banner" role="status">{{ store.i18n.edit_mode_banner() }}</div>
        }

        @if (store.isLoading() && store.rows().length === 0) {
          <okr-spinner />
        } @else if (store.rows().length === 0) {
          <p class="hq-empty">{{ store.isContentAdmin() ? store.i18n.tree_empty_admin() : store.i18n.tree_empty() }}</p>
        } @else {
          <div cdkDropList [cdkDropListData]="store.rows()" [cdkDropListDisabled]="!store.editMode()" (cdkDropListDropped)="onDrop($event)">
            @for (row of store.rows(); track row.node.okey) {
              <div class="hq-row" cdkDrag [cdkDragData]="row" [cdkDragDisabled]="!store.editMode()"
                [style.padding-left.px]="8 + row.depth * 28"
                tabindex="0" role="button"
                [attr.aria-expanded]="row.node.type === 'folder' ? row.isOpen : null"
                (click)="onRowClick(row)" (keydown.enter)="onRowClick(row)">

                @if (row.node.type === 'folder') {
                  <ion-button fill="clear" class="hq-chevron" [class.empty]="!row.hasChildren"
                    [attr.aria-label]="row.node.title" (click)="onChevron($event, row)">
                    <ion-icon slot="icon-only" src="{{ (row.isOpen ? 'chevron-down' : 'chevron-forward') | svgIcon }}" />
                  </ion-button>
                  <ion-icon class="hq-kind" src="{{ (row.isOpen ? 'folder-open' : 'folder') | svgIcon }}" />
                } @else {
                  <span class="hq-chevron empty"></span>
                  <ion-icon class="hq-kind" src="{{ 'music' | svgIcon }}" />
                }

                <span class="hq-title">
                  {{ row.node.title }}
                  @if (metaOf(row); as meta) { <span class="hq-meta">{{ meta }}</span> }
                </span>

                @if (row.node.type === 'folder' && canStart(row) && !store.editMode()) {
                  <ion-button fill="solid" size="default" (click)="onStart($event, row.node)">
                    <ion-icon slot="start" src="{{ 'play' | svgIcon }}" />
                    {{ store.i18n.start() }}
                  </ion-button>
                }
                @if (store.editMode()) {
                  @if (row.node.type === 'folder') {
                    <ion-button fill="clear" [attr.aria-label]="store.i18n.add_title()" (click)="onAddInto($event, row.node)">
                      <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
                    </ion-button>
                  }
                  <ion-button fill="clear" [attr.aria-label]="store.i18n.actions_title()" (click)="onActions($event, row.node)">
                    <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
                  </ion-button>
                  <ion-icon class="hq-handle" cdkDragHandle src="{{ 'reorder-four' | svgIcon }}" />
                }
              </div>
            }
          </div>
        }

        @if (store.editMode()) {
          <ion-button fill="outline" expand="block" (click)="store.add('folder', '')">
            <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" />
            {{ store.i18n.add_root() }}
          </ion-button>
        }
      </div>
    </ion-content>
  `,
})
export class HearingQuizTreePage {
  protected readonly store = inject(HearingQuizStore);

  /** route params: `:listId` is unused (always 'all'), `:contextMenuName` names the context menu */
  public readonly listId = input('all');
  public readonly contextMenuName = input('c-hearing-quiz');
  protected readonly menuName = computed(() => this.contextMenuName() || 'c-hearing-quiz');

  protected metaOf(row: HearingQuizTreeRow): string {
    if (row.node.type !== 'folder') return '';
    const parts: string[] = [];
    const count = questionCount(this.store.nodes(), row.node.okey);
    if (count > 0) parts.push(fill(this.store.i18n.question_count(), { count }));
    const last = this.store.lastScoreLabel(row.node.okey);
    if (last) parts.push(last);
    return parts.join(' · ');
  }

  protected canStart(row: HearingQuizTreeRow): boolean {
    return hasDirectQuestions(this.store.nodes(), row.node.okey);
  }

  protected async onRowClick(row: HearingQuizTreeRow): Promise<void> {
    if (this.store.editMode()) {
      await this.store.edit(row.node);
    } else if (row.node.type === 'folder') {
      this.store.toggle(row.node.okey);
    } else {
      await this.store.openQuestion(row.node);
    }
  }

  protected onChevron(event: Event, row: HearingQuizTreeRow): void {
    event.stopPropagation();
    this.store.toggle(row.node.okey);
  }

  protected async onStart(event: Event, folder: HearingQuizNodeModel): Promise<void> {
    event.stopPropagation();
    await this.store.startSession(folder);
  }

  protected async onAddInto(event: Event, folder: HearingQuizNodeModel): Promise<void> {
    event.stopPropagation();
    await this.store.addInto(folder);
  }

  protected async onActions(event: Event, node: HearingQuizNodeModel): Promise<void> {
    event.stopPropagation();
    await this.store.showActions(node);
  }

  protected async onDrop(event: CdkDragDrop<HearingQuizTreeRow[]>): Promise<void> {
    const isCopy = !!(event.event as MouseEvent | undefined)?.shiftKey;
    await this.store.drop(event.previousIndex, event.currentIndex, isCopy);
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return;
    switch (selectedMethod) {
      case 'toggleEditMode': this.store.toggleEditMode(); break;
      case 'add': await this.store.add('folder', ''); break;
      default: error(undefined, `HearingQuizTreePage: unknown method ${selectedMethod}`);
    }
  }
}
