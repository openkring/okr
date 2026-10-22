import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, input } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import 'emoji-picker-element';

/**
 * The full emoji list (the same `emoji-picker` the chat input opens) as a picker, e.g. for
 * «+ Reaktion» in the message sheet. Dismisses with the chosen emoji and role `confirm`.
 */
@Component({
  selector: 'okr-emoji-picker-modal',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [Header, IonContent],
  styles: [`
    .picker { display: flex; justify-content: center; padding: 8px; }
    emoji-picker { width: 100%; max-width: 480px; height: 420px; }
  `],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    <ion-content>
      <div class="picker">
        <emoji-picker (emoji-click)="onEmojiClick($event)"></emoji-picker>
      </div>
    </ion-content>
  `,
})
export class EmojiPickerModal {
  private readonly modalController = inject(ModalController);
  public readonly title = input('');

  protected async onEmojiClick(event: Event): Promise<void> {
    const detail = (event as CustomEvent<{ unicode?: string; emoji?: { unicode?: string } }>).detail;
    const emoji = detail?.unicode ?? detail?.emoji?.unicode ?? '';
    if (emoji) await dismissOverlay(this.modalController, emoji, 'confirm');
  }
}
