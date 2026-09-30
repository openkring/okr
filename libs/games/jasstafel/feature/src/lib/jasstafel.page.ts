import { Component, inject, OnInit } from '@angular/core';
import {
  IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonFooter, IonIcon, IonLabel, IonNote,
  IonSegment, IonSegmentButton, IonToolbar,
} from '@ionic/angular/standalone';

import { JassAvatar, JassGrid, JassResult, JassSettingsForm, JassSlate } from '@okr/games-jasstafel-ui';
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
    Header, JassSlate, JassGrid, JassResult, JassAvatar, JassSettingsForm, SvgIconPipe,
    IonContent, IonCard, IonCardContent, IonSegment, IonSegmentButton, IonLabel, IonButton, IonButtons,
    IonIcon, IonFooter, IonToolbar, IonNote,
  ],
  styles: [`
    /* everything below the header fills the height; the slate, grid or card takes what is left */
    .fill { display: flex; flex-direction: column; height: 100%; gap: 8px; }
    .fill > okr-jass-slate, .fill > okr-jass-grid, .fill > okr-jass-result { flex: 1; min-height: 0; }
    .setup { flex: 1; min-height: 0; margin: 0; display: flex; flex-direction: column; }
    .setup ion-card-content { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
    /* «Rückgängig»: the reload arrow turned backwards */
    .mirrored { transform: scaleX(-1); }

    /* the table seen from above: seat 1 at the bottom, then counter-clockwise (the Jass direction) */
    .table { flex: 1; min-height: 260px; display: grid; gap: 8px;
      grid-template-columns: 1fr minmax(96px, 1.3fr) 1fr; grid-template-rows: 1fr minmax(80px, 1.3fr) 1fr;
      grid-template-areas: '. top .' 'left felt right' '. bottom .'; }
    .felt { grid-area: felt; border-radius: 24px; background: #2f5d3a; box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.45);
      display: grid; place-items: center; color: #f2f0e6; font-weight: 600; text-align: center; padding: 4px; }
    .pos-bottom { grid-area: bottom; } .pos-right { grid-area: right; } .pos-top { grid-area: top; } .pos-left { grid-area: left; }
    .seat { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
      border: 3px dashed var(--ion-color-medium); border-radius: 12px; padding: 8px; cursor: pointer; min-height: 72px; }
    .seat.team1 { border-color: var(--ion-color-primary); }
    .seat.team2 { border-color: var(--ion-color-tertiary); }
    .seat.filled { border-style: solid; }
    .seat.bueter { border-color: var(--ion-color-warning); border-style: solid; }
    .seat .clear { position: absolute; top: 0; right: 0; }
    .hint { font-size: 0.8rem; color: var(--ion-color-medium); }
    .team1 .hint { color: var(--ion-color-primary); } .team2 .hint { color: var(--ion-color-tertiary); }
  `],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      <div class="fill">
      @if (!store.storageOk()) {
        <ion-note color="warning">{{ store.i18n.storage_note() }}</ion-note>
      }

      @if (store.game(); as game) {
        @if (store.outcome(); as outcome) {
          <okr-jass-result [game]="game" [outcome]="outcome" [stats]="store.stats()" [totals]="store.totals()"
            [i18n]="store.i18n" [diaryState]="store.diaryState()" [diaryBusy]="store.diaryBusy()"
            (newGame)="store.newGame()" (done)="store.endGame()" (toDiary)="store.toDiary()" />
        } @else if (game.variant === 'schieber' || game.variant === 'bueter') {
          <okr-jass-slate [game]="game" [totals]="store.totals()" [i18n]="store.i18n"
            (chalk)="store.addChalk($event.sideId, $event.unit)" />
        } @else {
          <okr-jass-grid [game]="game" [i18n]="store.i18n" [pendingAnnounced]="store.pendingAnnounced()" />
        }
      } @else {
        <ion-card class="setup">
          <ion-card-content>
            <ion-segment [value]="store.variant()" (ionChange)="onVariant($event.detail.value)">
              @for (v of variants; track v) {
                <ion-segment-button [value]="v"><ion-label>{{ variantLabel(v) }}</ion-label></ion-segment-button>
              }
            </ion-segment>

            <div class="table">
              <div class="felt">{{ variantLabel(store.variant()) }}</div>
              @for (seat of store.seats(); track $index; let i = $index) {
                <div class="seat" role="button" tabindex="0" [class]="'pos-' + seatPosition(i)"
                  [class.team1]="teamOf(i) === 1" [class.team2]="teamOf(i) === 2" [class.filled]="!!seat"
                  [class.bueter]="store.variant() === 'bueter' && store.bueterIdx() === i"
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

            <!-- the settings of the chosen variant, saved as typed -->
            <okr-jass-settings-form [formData]="store.config()" (formDataChange)="store.setConfig($event)"
              [variant]="store.variant()" section="main" [i18n]="store.i18n" />

            <ion-button expand="block" class="ion-margin-top" [disabled]="!store.canStart()" (click)="store.start()">
              {{ store.i18n.start() }}
            </ion-button>

            @if (store.variant() === 'coiffeur') {
              <okr-jass-settings-form [formData]="store.config()" (formDataChange)="store.setConfig($event)"
                variant="coiffeur" section="rows" [i18n]="store.i18n" />
            }
          </ion-card-content>
        </ion-card>
      }
      </div>
    </ion-content>

    <!-- stays after the game is decided: a mistyped last hand must still be undoable or editable -->
    @if (store.game()) {
      <ion-footer>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button (click)="store.undo()" [attr.aria-label]="store.i18n.undo()">
              <ion-icon slot="icon-only" class="mirrored" src="{{ 'reload' | svgIcon }}" />
            </ion-button>
            <ion-button (click)="store.openHistory()" [attr.aria-label]="store.i18n.history()">
              <ion-icon slot="icon-only" src="{{ 'chart' | svgIcon }}" />
            </ion-button>
            <ion-button (click)="store.endGame()" [attr.aria-label]="store.i18n.end_game()">
              <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
            </ion-button>
          </ion-buttons>
          @if (!store.outcome()) {
            <ion-buttons slot="end">
              <ion-button fill="solid" color="primary" (click)="store.enterHand()" [attr.aria-label]="enterLabel()">
                <ion-icon slot="icon-only" src="{{ 'add' | svgIcon }}" />
              </ion-button>
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

  /** Seat order is the play order; placed counter-clockwise from the bottom, partners opposite. */
  protected seatPosition(i: number): string {
    const positions = this.store.seats().length === 3 ? ['bottom', 'right', 'left'] : ['bottom', 'right', 'top', 'left'];
    return positions[i] ?? 'bottom';
  }

  /** Schieber and Coiffeur: seats 1+3 are team 1, seats 2+4 team 2; 0 = no teams. */
  protected teamOf(i: number): number {
    const v = this.store.variant();
    return v === 'schieber' || v === 'coiffeur' ? (i % 2) + 1 : 0;
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
