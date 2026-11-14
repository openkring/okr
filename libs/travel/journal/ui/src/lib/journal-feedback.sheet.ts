import { Component, inject, input } from '@angular/core';
import { IonContent, IonIcon, IonItem, IonLabel, IonList, IonListHeader, ModalController } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';

/** One row below the emoji row: its id comes back as the dismiss data. */
export interface JournalFeedbackAction { id: string; label: string; icon: string; danger?: boolean }

/**
 * The bottom sheet of the journal's reactions (spec 1.154 §7), built like the chat's message sheet: a title (the
 * image's name), the quick emoji row with «mehr …», then the actions. «＋» under a section shows the emoji row only.
 * Presentational — it dismisses with `{ role: 'react', data: emoji }`, `{ role: 'picker' }` or
 * `{ role: 'action', data: id }`, and the host acts.
 */
@Component({
  selector: 'okr-journal-feedback-sheet',
  standalone: true,
  imports: [IonContent, IonList, IonListHeader, IonItem, IonLabel, IonIcon, SvgIconPipe],
  styles: [`
    .reactions { display: flex; align-items: center; justify-content: space-between; gap: 4px; padding: 16px 16px 8px; }
    .reaction, .more {
      height: 44px; min-width: 44px; border-radius: 22px; border: none; padding: 0; cursor: pointer;
      display: flex; align-items: center; justify-content: center; color: var(--ion-text-color); font: inherit;
    }
    .reaction { font-size: 1.6rem; background: transparent; }
    .reaction.mine { background: rgba(var(--ion-color-primary-rgb), 0.18); }
    .more { padding: 0 12px; font-size: 0.9rem; background: var(--ion-background-color-step-100, var(--ion-color-light)); }
    .reaction:active, .more:active { opacity: 0.6; }
  `],
  template: `
    <ion-content>
      @if (header()) {
        <ion-list-header><ion-label>{{ header() }}</ion-label></ion-list-header>
      }
      @if (quickReactions().length > 0) {
        <div class="reactions">
          @for (emoji of quickReactions(); track emoji) {
            <button type="button" class="reaction" [class.mine]="mine().includes(emoji)" [attr.aria-pressed]="mine().includes(emoji)" (click)="react(emoji)">{{ emoji }}</button>
          }
          <button type="button" class="more" (click)="picker()">{{ moreLabel() }}</button>
        </div>
      }
      @if (actions().length > 0) {
        <ion-list lines="none">
          @for (a of actions(); track a.id) {
            <ion-item button detail="false" (click)="choose(a.id)">
              <ion-icon slot="start" [color]="a.danger ? 'danger' : undefined" src="{{ a.icon | svgIcon }}" />
              <ion-label [color]="a.danger ? 'danger' : undefined">{{ a.label }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class JournalFeedbackSheet {
  private readonly modalController = inject(ModalController);

  public readonly header = input('');
  /** the quick row (the chat's QUICK_REACTIONS); empty hides the row */
  public readonly quickReactions = input<readonly string[]>([]);
  /** the reader's own emoji on this section or image: highlighted, a tap takes them back */
  public readonly mine = input<string[]>([]);
  /** «mehr …»: the full emoji list */
  public readonly moreLabel = input('');
  public readonly actions = input<JournalFeedbackAction[]>([]);

  protected react(emoji: string): void {
    void this.modalController.dismiss(emoji, 'react');
  }

  protected picker(): void {
    void this.modalController.dismiss(undefined, 'picker');
  }

  protected choose(id: string): void {
    void this.modalController.dismiss(id, 'action');
  }
}
