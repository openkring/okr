import { Component, inject, input, output } from '@angular/core';
import { IonBadge, IonButton, IonIcon } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { DependencyNode, MenuGraphStore } from './menu-graph.store';

/**
 * Recursive tree node for the CMS dependency graph.
 * Renders a single node with expand/collapse and an edit button,
 * then recursively renders its children when expanded.
 */
@Component({
  selector: 'bk-menu-graph-node',
  standalone: true,
  imports: [
    SvgIconPipe, 
    IonButton, IonIcon, IonBadge
  ],
  styles: [`
    :host { display: block; }
    .node-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 0;
    }
    .toggle-btn {
      min-width: 28px;
      font-size: 0.7rem;
      --padding-start: 0;
      --padding-end: 0;
    }
    .node-icon {
      font-size: 18px;
      flex-shrink: 0;
    }
    ion-badge {
      font-size: 0.65rem;
      padding: 2px 5px;
      flex-shrink: 0;
    }
    .node-name {
      font-size: 0.9rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
    }
    .edit-btn {
      --padding-start: 4px;
      --padding-end: 4px;
      flex-shrink: 0;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .node-row:hover .edit-btn { opacity: 1; }
    .children {
      padding-left: 20px;
      border-left: 1px solid var(--ion-color-light-shade);
      margin-left: 13px;
    }
    .divider-line {
      border-top: 1px solid var(--ion-color-medium-tint);
      margin: 4px 0 4px 28px;
      height: 0;
    }
  `],
  template: `
    @if (node().subType === 'divider') {
      <div class="divider-line"></div>
    } @else {
      <div class="node-row">
        <!-- Expand / collapse toggle -->
        @if (node().children.length > 0) {
          <ion-button fill="clear" size="small" class="toggle-btn" (click)="graphStore.toggleExpanded(node().id)">
            <ion-icon slot="icon-only" src="{{ (graphStore.isExpanded(node().id) ? 'chevron-down' : 'chevron-forward') | svgIcon }}" />
          </ion-button>
        } @else {
          <span class="toggle-btn"></span>
        }

        <!-- Node type icon -->
        <ion-icon class="node-icon" [color]="node().color" src="{{ node().icon | svgIcon }}" />

        <!-- Type badge -->
        <ion-badge [color]="node().color">{{ node().subType }}</ion-badge>

        <!-- Node name -->
        <span class="node-name" [title]="node().name">{{ node().name }}</span>

        <span class="node-name">{{node().state}}</span>
        <span class="node-name">{{node().roleNeeded}}</span>

        <!-- Edit button -->
        <ion-button fill="clear" size="small" class="edit-btn" (click)="nodeEdit.emit(node())">
          <ion-icon slot="icon-only" src="{{ 'create_edit' | svgIcon }}" />
        </ion-button>
      </div>

      <!-- Children (recursively rendered when expanded) -->
      @if (graphStore.isExpanded(node().id) && node().children.length > 0) {
        <div class="children">
          @for (child of node().children; track child.id) {
            <bk-menu-graph-node [node]="child" (nodeEdit)="nodeEdit.emit($event)" />
          }
        </div>
      }
    }
  `
})
export class MenuGraphNode {
  protected graphStore = inject(MenuGraphStore);

  public node = input.required<DependencyNode>();
  public nodeEdit = output<DependencyNode>();
}
