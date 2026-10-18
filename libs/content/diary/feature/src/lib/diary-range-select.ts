import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonPopover } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { DiaryRange, DiaryRangeNode } from '@okr/content-diary-util';

/**
 * The diary's period selector (spec 1.106 §1.2): a button showing the current period
 * (`2026`, `198x`, `19xx`, «Alle Jahre») that opens the archive-shaped tree
 * Jahrhundert → Jahrzehnt → Jahr. Tapping a label selects that node; the chevron only
 * expands or collapses it.
 */
@Component({
  selector: 'okr-diary-range-select',
  standalone: true,
  imports: [NgTemplateOutlet, SvgIconPipe, IonButton, IonIcon, IonPopover, IonContent, IonList, IonItem, IonLabel],
  styles: [`
    .level-1 { --padding-start: 32px; }
    .level-2 { --padding-start: 56px; }
    .selected ion-label { font-weight: 600; }
  `],
  template: `
    <ion-button fill="clear" [attr.aria-label]="label()" (click)="present($event)">
      {{ selected()?.label ?? allLabel() }}
      <ion-icon slot="end" src="{{ 'chevron-down' | svgIcon }}" />
    </ion-button>
    <ion-popover [isOpen]="open()" [event]="event()" (didDismiss)="open.set(false)">
      <ng-template>
        <ion-content>
          <ion-list lines="none">
            <ion-item button [detail]="false" [class.selected]="!selected()" (click)="select(undefined)">
              <ion-label>{{ allLabel() }}</ion-label>
            </ion-item>
            @for (century of tree(); track century.range.label) {
              <ng-container *ngTemplateOutlet="node; context: { $implicit: century, level: 0 }" />
            }
          </ion-list>
        </ion-content>
      </ng-template>
    </ion-popover>

    <ng-template #node let-n let-level="level">
      <ion-item button [detail]="false" [class]="'level-' + level" [class.selected]="isSelected(n.range)" (click)="select(n.range)">
        @if (n.children.length) {
          <ion-icon slot="start" src="{{ (isExpanded(n.range) ? 'chevron-down' : 'chevron-forward') | svgIcon }}"
            (click)="toggle(n.range, $event)" />
        }
        <ion-label>{{ n.range.label }}</ion-label>
      </ion-item>
      @if (isExpanded(n.range)) {
        @for (child of n.children; track child.range.label) {
          <ng-container *ngTemplateOutlet="node; context: { $implicit: child, level: level + 1 }" />
        }
      }
    </ng-template>
  `,
})
export class DiaryRangeSelect {
  public readonly tree = input.required<DiaryRangeNode[]>();
  public readonly selected = input<DiaryRange | undefined>();
  public readonly allLabel = input.required<string>();
  public readonly label = input('');

  public readonly selectedChange = output<DiaryRange | undefined>();

  protected readonly open = signal(false);
  protected readonly event = signal<Event | undefined>(undefined);

  /** Opens on the path to the current selection; the user's expand/collapse wins from then on. */
  private readonly expanded = linkedSignal(() => new Set(this.pathTo(this.selected())));
  private readonly selectedLabel = computed(() => this.selected()?.label);

  /** Controlled open (no `trigger`): a chevron tap must expand without dismissing the popover. */
  protected present(event: Event): void {
    this.event.set(event);
    this.open.set(true);
  }

  protected isSelected(range: DiaryRange): boolean {
    return range.label === this.selectedLabel();
  }

  protected isExpanded(range: DiaryRange): boolean {
    return this.expanded().has(range.label);
  }

  protected toggle(range: DiaryRange, event: Event): void {
    event.stopPropagation();
    this.expanded.update(set => {
      const next = new Set(set);
      if (next.has(range.label)) next.delete(range.label); else next.add(range.label);
      return next;
    });
  }

  protected select(range: DiaryRange | undefined): void {
    this.selectedChange.emit(range);
    this.open.set(false);
  }

  /** Labels of the ancestors of `range` (century, decade), i.e. the nodes to open. */
  private pathTo(range: DiaryRange | undefined): string[] {
    if (!range) return [];
    for (const century of this.tree()) {
      if (century.range.label === range.label) return [];
      for (const decade of century.children) {
        if (decade.range.label === range.label) return [century.range.label];
        if (decade.children.some(y => y.range.label === range.label)) return [century.range.label, decade.range.label];
      }
    }
    return [];
  }
}
