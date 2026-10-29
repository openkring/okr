import { Component, inject, input } from '@angular/core';
import { IonContent, IonItemDivider, IonList, PopoverController } from '@ionic/angular';

import { MultiAvatar } from '@okr/cms-menu-ui';
import { JournalI18n, JournalMenuAction, JournalMenuItem } from '@okr/travel-journal-util';

/**
 * The ⋮ context menu of a journal page (spec 1.126 §2), rendered with the CMS menu's own row component so it
 * looks like every other context menu. Code-defined entries (see journal-menu.util): a tap dismisses the popover
 * with the entry's action.
 */
@Component({
  selector: 'okr-journal-context-menu',
  imports: [IonContent, IonList, IonItemDivider, MultiAvatar],
  styles: [`
    ion-icon { color: var(--ion-color-dark); }
    @media (prefers-color-scheme: dark) { ion-icon { color: var(--ion-color-white); } }
    ion-item-divider.separator { min-height: 2px; --padding-start: 0; --inner-padding-end: 0;
      --background: var(--ion-color-step-150, #d7d8da); }
  `],
  template: `
    <ion-content>
      <ion-list lines="none">
        @for (item of items(); track $index) {
          @if (item.action === 'divider') {
            <ion-item-divider class="separator" />
          } @else {
            <okr-multi-avatar [icon]="item.icon" [label]="i18n()[item.label]()" (click)="select(item.action)" />
          }
        }
      </ion-list>
    </ion-content>
  `,
})
export class JournalContextMenu {
  private readonly popoverController = inject(PopoverController);

  public readonly items = input.required<JournalMenuItem[]>();
  public readonly i18n = input.required<JournalI18n>();

  protected select(action: JournalMenuAction): void {
    void this.popoverController.dismiss(action);
  }
}
