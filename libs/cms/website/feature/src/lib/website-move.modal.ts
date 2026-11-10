import { Component, inject, input } from '@angular/core';
import { IonContent, IonIcon, IonItem, IonLabel, IonList, IonNote, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { MoveTarget, WEBSITE_I18N_KEYS, WebsiteI18n } from '@okr/cms-website-util';

/**
 * Picker for «Verschieben nach…»: the top level and every live menu, except the moved node and its
 * own subtree (`moveTargets` leaves those out). Dismisses with `{ parentId }` and role 'confirm'.
 */
@Component({
  selector: 'okr-website-move-modal',
  standalone: true,
  imports: [Header, SvgIconPipe, IonContent, IonList, IonItem, IonLabel, IonIcon, IonNote],
  template: `
    <okr-header [i18n]="{ title: i18n.move_title() }" [isModal]="true" />
    <ion-content>
      <ion-list lines="inset">
        @for (target of targets(); track target.id) {
          <ion-item button [detail]="false" [disabled]="target.id === currentParentId()"
            [style.--padding-start]="(16 + target.depth * 24) + 'px'" (click)="select(target)">
            <ion-icon slot="start" src="{{ (target.id === null ? 'globe' : 'menu') | svgIcon }}" />
            <ion-label>{{ target.id === null ? i18n.move_top_level() : target.label }}</ion-label>
            @if (target.id === currentParentId()) {
              <ion-note slot="end">{{ i18n.move_current() }}</ion-note>
            }
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class WebsiteMoveModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(WEBSITE_I18N_KEYS) as WebsiteI18n;

  // inputs
  public readonly targets = input.required<MoveTarget[]>();
  public readonly currentParentId = input<string | null>(null);

  protected async select(target: MoveTarget): Promise<void> {
    await dismissOverlay(this.modalController, { parentId: target.id }, 'confirm');
  }
}
