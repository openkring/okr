import { Component, computed, inject, input, output, signal } from '@angular/core';
import { IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { GroupModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { OrgchartStore } from './orgchart-section.store';

/**
 * Recursive accordion node for the orgchart section.
 * Injects OrgchartStore directly so every node in the tree reacts to the same
 * live allGroups() signal without prop-drilling.
 * In edit-mode a tap on the icon or overflow button emits groupAction so the
 * parent can show the ActionSheet.
 */
@Component({
  selector: 'bk-orgchart-node',
  standalone: true,
  imports: [
    OrgchartNodeComponent,
    SvgIconPipe,
    IonList, IonItem, IonIcon, IonLabel,
  ],
  styles: [`
    .node-item { --padding-start: 0; }
    ion-icon { font-size: 24px; width: 24px; height: 24px; cursor: pointer; }
    .expand-icon { font-size: 16px; width: 16px; height: 16px; }
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

      <!-- group icon — always opens action sheet -->
      <ion-icon
        slot="start"
        src="{{ group().icon | svgIcon }}"
        (click)="onGroupClick($event)"
      />

      @if (showName()) {
        <ion-label (click)="onGroupClick($event)">{{ group().name }}</ion-label>
      }

      @if (editMode()) {
        <ion-icon
          slot="end"
          src="{{ 'more_vertical' | svgIcon }}"
          (click)="onGroupClick($event)"
        />
      }
    </ion-item>

    @if (expanded() && children().length > 0) {
      <ion-list lines="none">
        @for (child of children(); track child.bkey) {
          <bk-orgchart-node
            [group]="child"
            [depth]="depth() + 1"
            [showName]="showName()"
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

  public group = input.required<GroupModel>();
  public depth = input(0);
  public showName = input(true);
  public editMode = input(false);

  /** Emits the tapped group so the parent OrgchartSectionComponent can open the ActionSheet. */
  public groupAction = output<GroupModel>();

  protected expanded = signal(true);

  /** Direct children of this node, live-computed from the shared store signal. */
  protected children = computed(() =>
    this.orgchartStore.allGroups().filter(g => g.parentKey === this.group().bkey)
  );
  protected indent = computed(() => `${this.depth() * 20}px`);

  protected toggleExpand(event: Event): void {
    event.stopPropagation();
    this.expanded.update(v => !v);
  }

  protected onGroupClick(event: Event): void {
    event.stopPropagation();
    this.groupAction.emit(this.group());
  }
}
