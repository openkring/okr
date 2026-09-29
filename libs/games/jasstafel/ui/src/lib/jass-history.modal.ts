import { Component, inject, input } from '@angular/core';
import { IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonListHeader, ModalController } from '@ionic/angular/standalone';

import { JassGame, JassI18n, handValues, totals } from '@okr/games-jasstafel-util';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

import { JassAvatar } from './jass-avatar';

export type JassHistoryAction = { action: 'edit' | 'delete'; index: number } | { action: 'clear' };

/** The hands of the running game (edit / delete) and the finished games kept on this device. */
@Component({
  selector: 'okr-jass-history-modal',
  standalone: true,
  imports: [Header, IonContent, IonList, IonListHeader, IonItem, IonLabel, IonButton, IonIcon, SvgIconPipe, JassAvatar],
  template: `
    <okr-header [i18n]="{ title: i18n().history_title() }" [isModal]="true" />
    <ion-content>
      @if (game(); as g) {
        <ion-list>
          <ion-list-header>{{ i18n().history_hands() }}</ion-list-header>
          @for (h of g.hands; track $index; let i = $index) {
            <ion-item>
              <ion-label>{{ i + 1 }} · {{ h.trump }} · {{ values(g, i) }}</ion-label>
              <ion-button slot="end" fill="clear" (click)="close({ action: 'edit', index: i })" [attr.aria-label]="i18n().edit_hand()">
                <ion-icon slot="icon-only" src="{{ 'edit' | svgIcon }}" />
              </ion-button>
              <ion-button slot="end" fill="clear" color="danger" (click)="close({ action: 'delete', index: i })" [attr.aria-label]="i18n().delete_hand()">
                <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
              </ion-button>
            </ion-item>
          } @empty {
            <ion-item><ion-label>{{ i18n().history_empty() }}</ion-label></ion-item>
          }
        </ion-list>
      }
      <ion-list>
        <ion-list-header>{{ i18n().history_finished() }}</ion-list-header>
        @for (a of archive(); track a.id) {
          <ion-item>
            @for (p of a.players; track $index) { <okr-jass-avatar [avatar]="p.avatar" /> }
            <ion-label class="ion-padding-start">{{ a.variant }} · {{ sums(a) }} · {{ a.finishedAt?.slice(0, 10) }}</ion-label>
          </ion-item>
        } @empty {
          <ion-item><ion-label>{{ i18n().history_empty() }}</ion-label></ion-item>
        }
      </ion-list>
      @if (archive().length) {
        <ion-button expand="block" fill="outline" color="danger" class="ion-margin" (click)="close({ action: 'clear' })">
          {{ i18n().clear_archive() }}
        </ion-button>
      }
    </ion-content>
  `,
})
export class JassHistoryModal {
  private readonly modalController = inject(ModalController);

  public readonly game = input<JassGame | null>(null);
  public readonly archive = input<JassGame[]>([]);
  public readonly i18n = input.required<JassI18n>();

  protected values(g: JassGame, i: number): string {
    const v = handValues(g, g.hands[i]);
    return g.sides.map(s => v[s.id]).join(' : ');
  }

  protected sums(g: JassGame): string {
    const t = totals(g);
    return g.sides.map(s => t[s.id]).join(' : ');
  }

  protected async close(result: JassHistoryAction): Promise<void> {
    await dismissOverlay(this.modalController, result, 'confirm');
  }
}
