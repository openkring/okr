import { Component, computed, inject, input, output, signal } from '@angular/core';
import { IonIcon, IonImg, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { AvatarPipe } from '@bk2/avatar-ui';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { OrgchartStore, OrgchartTreeNode } from './orgchart-section.store';

/**
 * Recursive accordion node for the orgchart section.
 * Injects OrgchartStore directly so every node in the tree reacts to the same
 * live allGroups() signal without prop-drilling.
 * Tapping the icon or name always emits groupAction so the parent can open the ActionSheet.
 */
@Component({
  selector: 'bk-orgchart-node',
  standalone: true,
  imports: [
    OrgchartNodeComponent,
    AvatarPipe, SvgIconPipe,
    IonList, IonItem, IonIcon, IonImg, IonLabel,
  ],
  styles: [`
    .node-item { --padding-start: 0; }
    ion-icon { font-size: 24px; width: 24px; height: 24px; cursor: pointer; }
    ion-img  { width: 24px; height: 24px; cursor: pointer; }
    .expand-icon { font-size: 16px; width: 16px; height: 16px; }
    .children-horizontal { display: flex; flex-wrap: wrap; gap: 4px; }
  `],
  template: `
    <ion-item class="node-item" [style.paddingLeft]="indent()" lines="none">
      <!-- collapse/expand chevron — only rendered when children exist -->
      @if (children().length > 0) {
        <ion-icon
          slot="start"
          [src]="(expanded() ? 'chevron-down' : 'chevron-forward') | svgIcon"
          class="expand-icon"
          (click)="toggleExpand($event)"
        />
      } @else {
        <!-- spacer keeps alignment consistent for leaf nodes -->
        <span slot="start" class="expand-icon" style="display:inline-block"></span>
      }

      <!-- avatar — org uses 'org.bkey | avatar' with fallback 'org'; group uses 'group.bkey | avatar' with fallback group.icon -->
      @if (node().modelType === 'org') {
        <ion-img
          slot="start"
          [src]="('org.' + node().bkey) | avatar:'org'"
          (click)="onGroupClick($event)"
        />
      } @else {
        <ion-img
          slot="start"
          [src]="('group.' + node().bkey) | avatar:node().icon"
          (click)="onGroupClick($event)"
        />
      }

      @if (showName()) {
        <ion-label (click)="onGroupClick($event)">{{ node().name }}</ion-label>
      }
    </ion-item>

    @if (expanded() && children().length > 0) {
      <ion-list lines="none" [class.children-horizontal]="display() === 'horizontal'">
        @for (child of children(); track child.bkey) {
          <bk-orgchart-node
            [node]="child"
            [depth]="display() === 'horizontal' ? 0 : depth() + 1"
            [showName]="showName()"
            [display]="display()"
            [editMode]="editMode()"
            (groupAction)="groupAction.emit($event)"
          />
        }
      </ion-list>
    }
  `,
})
export class OrgchartNodeComponent {
  private readonly orgchartStore = inject(OrgchartStore);

  public node = input.required<OrgchartTreeNode>();
  public depth = input(0);
  public showName = input(true);
  public display = input<'vertical' | 'horizontal'>('vertical');
  public editMode = input(false);

  /** Emits the tapped node so the parent OrgchartSectionComponent can open the ActionSheet. */
  public groupAction = output<OrgchartTreeNode>();

  protected expanded = signal(true);

  /** Direct children of this node, live-computed from the shared store signal. */
  protected children = computed(() =>
    this.orgchartStore.allGroups()
      .filter(g => g.parentKey === this.node().bkey)
      .map(g => ({ name: g.name, bkey: g.bkey, modelType: 'group' as const, icon: g.icon, children: [] }))
  );
  protected indent = computed(() => `${this.depth() * 20}px`);

  protected toggleExpand(event: Event): void {
    event.stopPropagation();
    this.expanded.update(v => !v);
  }

  protected onGroupClick(event: Event): void {
    event.stopPropagation();
    this.groupAction.emit(this.node());
  }
}
