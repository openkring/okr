import { Component, computed, inject, input, output } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { IonBadge, IonButton, IonIcon } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { MenuItemModel } from '@bk2/shared-models';
import { I18nService } from '@bk2/shared-i18n';
import { VersionCheckService } from '@bk2/shared-util-angular';
import { expandMenuTokens } from '@bk2/cms-menu-util';
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
    .node-labels {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      line-height: 1.15;
    }
    .node-sublabel {
      font-size: 0.65rem;
      color: var(--ion-color-medium);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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

      <div class="node-row">
        <!-- Expand / collapse toggle -->
        @if (node().children.length > 0) {
          <ion-button fill="clear" size="small" class="toggle-btn" (click)="store.toggleExpanded(node().id)">
            <ion-icon slot="icon-only" src="{{ (store.isExpanded(node().id) ? 'chevron-down' : 'chevron-forward') | svgIcon }}" />
          </ion-button>
        } @else {
          <span class="toggle-btn"></span>
        }

        <!-- Node type icon -->
        <ion-icon class="node-icon" [color]="node().color" src="{{ node().icon | svgIcon }}" />

        <!-- Type badge -->
        <ion-badge [color]="node().color">{{ node().subType }}</ion-badge>

        <!-- Node label: translated menu label on top, raw name above it in a smaller font -->
        <div class="node-labels">
          @if (translatedLabel(); as label) {
            <span class="node-sublabel" [title]="node().name">{{ node().name }}</span>
            <span class="node-name" [title]="label">{{ label }}</span>
          } @else {
            <span class="node-name" [title]="node().name">{{ node().name }}</span>
          }
        </div>

        <span class="node-name">{{node().state}}</span>
        <span class="node-name">{{node().roleNeeded}}</span>

        <!-- Edit button -->
        <ion-button fill="clear" size="small" class="edit-btn" (click)="nodeEdit.emit(node())">
          <ion-icon slot="icon-only" src="{{ 'edit' | svgIcon }}" />
        </ion-button>
      </div>

      <!-- Children (recursively rendered when expanded) -->
      @if (store.isExpanded(node().id) && node().children.length > 0) {
        <div class="children">
          @for (child of node().children; track child.id) {
            <bk-menu-graph-node [node]="child" (nodeEdit)="nodeEdit.emit($event)" />
          }
        </div>
      }
  `
})
export class MenuGraphNode {
  protected store = inject(MenuGraphStore);
  private readonly i18nService = inject(I18nService);
  private readonly versionService = inject(VersionCheckService);

  public node = input.required<DependencyNode>();
  public nodeEdit = output<DependencyNode>();

  /** The i18n key of the menu item's label, expanded and scoped like the live menu does. */
  private readonly labelKey = computed(() => {
    const node = this.node();
    if (node.nodeType !== 'menu') return '';
    const rawLabel = (node.model as MenuItemModel).label ?? '';
    const expanded = expandMenuTokens(rawLabel, { version: this.versionService.getCurrentVersion() });
    if (expanded !== rawLabel) return expanded;            // a dynamic token (e.g. @VERSION@) was expanded
    if (rawLabel.startsWith('@')) return '@cms/menu/feature.' + rawLabel.substring(1);
    return rawLabel;
  });

  /** The translated menu label shown as the main node label (empty for non-menu nodes or label-less items). */
  protected readonly translatedLabel = toSignal(
    toObservable(this.labelKey).pipe(switchMap(key => this.i18nService.translate(key))),
    { initialValue: '' }
  );
}
