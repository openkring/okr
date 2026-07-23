import { Component, computed, effect, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonIcon, IonToolbar } from '@ionic/angular/standalone';

import { InstrumentTopic } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';

import { topicSourceRef } from '@okr/instruments-util';
import { InstrumentBoard } from '@okr/instruments-ui';

import { InstrumentStore } from './instrument.store';

/**
 * The board detail page: renders the shared `okr-instrument-board` primitive for one instrument and
 * wires its intents to the store. The grid, topics and cell labels all come from the store (which
 * resolves i18n cell labels via the store pattern). Read-only unless the user may change the
 * instrument.
 */
@Component({
  selector: 'okr-instrument-page',
  standalone: true,
  imports: [Header, InstrumentBoard, SvgIconPipe, IonContent, IonToolbar, IonButtons, IonButton, IonIcon],
  providers: [InstrumentStore],
  template: `
    <okr-header [i18n]="{ title: title() }" />
    @if (!readOnly()) {
      <ion-toolbar>
        <ion-buttons slot="end">
          <ion-button (click)="editInstrument()">
            <ion-icon src="{{ 'create' | svgIcon }}" slot="start" />
            {{ store.i18n.update() }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    }
    <ion-content>
      @if (store.instrument()) {
        <okr-instrument-board
          [definition]="store.gridDefinition()"
          [topics]="store.topics()"
          [labels]="store.cellLabels()"
          [emptyLabel]="store.i18n.board_empty_cell()"
          [readOnly]="readOnly()"
          (topicMoved)="store.moveTopic($event, readOnly())"
          (topicSelected)="store.editTopic($event, readOnly())"
          (topicAdded)="store.addTopic($event, readOnly())"
          (sourceOpened)="onSourceOpened($event)"
        />
      }
    </ion-content>
  `,
})
export class InstrumentPage {
  protected readonly store = inject(InstrumentStore);

  /** Route param `:instrumentKey`. */
  public readonly instrumentKey = input.required<string>();

  protected readonly readOnly = computed(() => !this.store.canChange(this.store.instrument()));
  protected readonly title = computed(() => this.store.instrument()?.name ?? '');

  constructor() {
    effect(() => this.store.setInstrumentKey(this.instrumentKey()));
  }

  protected editInstrument(): void {
    const instrument = this.store.instrument();
    if (instrument) void this.store.edit(instrument, this.readOnly());
  }

  /**
   * A card's source chip was tapped (OQ-3). The polymorphic ref is `topicSourceRef(topic)`
   * (`{ type, key }`). Navigation to the linked Task/Objective/Risk is per-entity and lands with the
   * consumer that owns that entity's routes — for now we surface the ref for wiring.
   */
  protected onSourceOpened(topic: InstrumentTopic): void {
    const ref = topicSourceRef(topic);
    console.log('InstrumentPage.onSourceOpened: navigate to linked entity', ref);
  }
}
