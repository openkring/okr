import { Component, inject, OnInit } from '@angular/core';
import {
  IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonFooter, IonIcon, IonLabel, IonNote,
  IonSegment, IonSegmentButton, IonToolbar,
} from '@ionic/angular/standalone';

import { JassAvatar, JassGrid, JassResult, JassSlate } from '@okr/games-jasstafel-ui';
import { JASS_VARIANTS, JassVariant } from '@okr/games-jasstafel-util';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';

import { JasstafelStore } from './jasstafel.store';

/**
 * The Jasstafel: a start screen (variant + seats) while no game runs, then the slate — Z strokes
 * for Schieber and Büter, a chalk grid for Coiffeur and Differenzler — with the hand entry in the
 * footer, and the result card once the game is decided.
 */
@Component({
  selector: 'okr-jasstafel-page',
  standalone: true,
  providers: [JasstafelStore],
  imports: [
    Header, JassSlate, JassGrid, JassResult, JassAvatar, SvgIconPipe,
    IonContent, IonCard, IonCardContent, IonSegment, IonSegmentButton, IonLabel, IonButton, IonButtons,
    IonIcon, IonFooter, IonToolbar, IonNote,
  ],
  styles: [`
    .seats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 16px 0; }
    .seat { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
      min-height: 80px; border: 2px dashed var(--ion-color-medium); border-radius: 12px; padding: 8px; cursor: pointer; }
    .seat.bueter { border-color: var(--ion-color-warning); border-style: solid; }
    .seat .clear { position: absolute; top: 0; right: 0; }
    .hint { font-size: 0.8rem; color: var(--ion-color-medium); }
  `],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      @if (!store.storageOk()) {
        <ion-note color="warning">{{ store.i18n.storage_note() }}</ion-note>
      }

      @if (store.game(); as game) {
        @if (store.outcome(); as outcome) {
          <okr-jass-result [game]="game" [outcome]="outcome" [stats]="store.stats()" [totals]="store.totals()"
            [i18n]="store.i18n" (newGame)="store.newGame()" (done)="store.endGame()" />
        } @else if (game.variant === 'schieber' || game.variant === 'bueter') {
          <okr-jass-slate [game]="game" [totals]="store.totals()" [i18n]="store.i18n" />
        } @else {
          <okr-jass-grid [game]="game" [i18n]="store.i18n" [pendingAnnounced]="store.pendingAnnounced()" />
        }
      } @else {
        <ion-card>
          <ion-card-content>
            <ion-segment [value]="store.variant()" (ionChange)="onVariant($event.detail.value)">
              @for (v of variants; track v) {
                <ion-segment-button [value]="v"><ion-label>{{ variantLabel(v) }}</ion-label></ion-segment-button>
              }
            </ion-segment>

            <div class="seats">
              @for (seat of store.seats(); track $index; let i = $index) {
                <div class="seat" role="button" tabindex="0" [class.bueter]="store.variant() === 'bueter' && store.bueterIdx() === i"
                  (click)="store.pickSeat(i)" (keyup.enter)="store.pickSeat(i)">
                  @if (seat) { <okr-jass-avatar [avatar]="seat" /> } @else { <span>{{ store.i18n.seat_empty() }}</span> }
                  <span class="hint">{{ seatHint(i) }}</span>
                  @if (seat && store.variant() === 'differenzler' && i === 3) {
                    <ion-button class="clear" fill="clear" size="small" (click)="clearSeat($event, i)">
                      <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
                    </ion-button>
                  }
                </div>
              }
            </div>

            @if (store.variant() === 'bueter') {
              <ion-segment [value]="store.bueterIdx()" (ionChange)="onBueter($event.detail.value)">
                @for (i of bueterSeats; track i) {
                  <ion-segment-button [value]="i"><ion-label>{{ store.i18n.bueter_label() }} {{ i + 1 }}</ion-label></ion-segment-button>
                }
              </ion-segment>
            }

            <ion-button expand="block" class="ion-margin-top" [disabled]="!store.canStart()" (click)="store.start()">
              {{ store.i18n.start() }}
            </ion-button>
            @if (store.archive().length) {
              <ion-button expand="block" fill="clear" (click)="store.openHistory()">
                <ion-icon slot="start" src="{{ 'list' | svgIcon }}" />
                {{ store.i18n.history() }}
              </ion-button>
            }
          </ion-card-content>
        </ion-card>
      }
    </ion-content>

    <!-- stays after the game is decided: a mistyped last hand must still be undoable or editable -->
    @if (store.game()) {
      <ion-footer>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button (click)="store.undo()" [attr.aria-label]="store.i18n.undo()">
              <ion-icon slot="icon-only" src="{{ 'reload' | svgIcon }}" />
            </ion-button>
            <ion-button (click)="store.openHistory()" [attr.aria-label]="store.i18n.history()">
              <ion-icon slot="icon-only" src="{{ 'list' | svgIcon }}" />
            </ion-button>
            <ion-button (click)="store.openSettings()" [attr.aria-label]="store.i18n.settings()">
              <ion-icon slot="icon-only" src="{{ 'settings' | svgIcon }}" />
            </ion-button>
            <ion-button (click)="store.endGame()" [attr.aria-label]="store.i18n.end_game()">
              <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
            </ion-button>
          </ion-buttons>
          @if (!store.outcome()) {
            <ion-buttons slot="end">
              <ion-button fill="solid" color="primary" (click)="store.enterHand()">{{ enterLabel() }}</ion-button>
            </ion-buttons>
          }
        </ion-toolbar>
      </ion-footer>
    }
  `,
})
export class JasstafelPage implements OnInit {
  protected readonly store = inject(JasstafelStore);
  protected readonly variants = JASS_VARIANTS;
  protected readonly bueterSeats = [0, 1, 2];

  public ngOnInit(): void {
    this.store.load();
  }

  protected onVariant(value: unknown): void {
    if ((JASS_VARIANTS as unknown[]).includes(value)) this.store.setVariant(value as JassVariant);
  }

  protected onBueter(value: unknown): void {
    this.store.setBueterIdx(Number(value));
  }

  protected clearSeat(event: Event, i: number): void {
    event.stopPropagation();
    this.store.clearSeat(i);
  }

  protected variantLabel(v: JassVariant): string {
    const i = this.store.i18n;
    return { schieber: i.variant_schieber, bueter: i.variant_bueter, coiffeur: i.variant_coiffeur, differenzler: i.variant_differenzler }[v]();
  }

  protected seatHint(i: number): string {
    const v = this.store.variant();
    if (v === 'schieber' || v === 'coiffeur') return `${this.store.i18n.team()} ${(i % 2) + 1}`;
    return `${this.store.i18n.seat()} ${i + 1}`;
  }

  protected enterLabel(): string {
    const g = this.store.game();
    return g?.variant === 'differenzler' && !this.store.pendingAnnounced()
      ? this.store.i18n.enter_announce() : this.store.i18n.enter_hand();
  }
}
