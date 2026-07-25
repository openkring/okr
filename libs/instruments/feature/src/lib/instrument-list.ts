import { Component, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBadge, IonButtons, IonContent, IonFab, IonFabButton, IonIcon, IonItem,
  IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonNote, IonToolbar,
} from '@ionic/angular/standalone';

import { InstrumentModel, InstrumentType } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';

import { InstrumentStore } from './instrument.store';

const INSTRUMENT_TYPES: readonly InstrumentType[] = ['swot', 'pestel', 'bmc', 'eisenhower'];

function coerceType(value: string): InstrumentType {
  return (INSTRUMENT_TYPES as readonly string[]).includes(value) ? (value as InstrumentType) : 'swot';
}

/**
 * List of instruments of one type (the `:listId` route partition, e.g. all SWOTs). Tapping an
 * instrument opens its board page. Minimal v1 list — the richer `bk-list-filter` header can be
 * layered on later (generating-lists).
 */
@Component({
  selector: 'okr-instrument-list',
  standalone: true,
  imports: [
    Header, SvgIconPipe,
    IonContent, IonList, IonItem, IonItemSliding, IonItemOptions, IonItemOption,
    IonLabel, IonNote, IonBadge, IonButtons, IonIcon, IonFab, IonFabButton, IonToolbar,
  ],
  providers: [InstrumentStore],
  template: `
    <okr-header [i18n]="{ title: store.i18n.instruments() }" />
    <ion-toolbar>
      <ion-buttons slot="end">
        <ion-badge color="medium">{{ store.instrumentsCount() }}</ion-badge>
      </ion-buttons>
    </ion-toolbar>
    <ion-content>
      <ion-list>
        @for (instrument of store.filteredInstruments(); track instrument.okey) {
          <ion-item-sliding>
            <ion-item button (click)="open(instrument)">
              <ion-label>
                <h2>{{ instrument.name }}</h2>
                @if (instrument.description.length > 0) { <p>{{ instrument.description }}</p> }
              </ion-label>
              <ion-note slot="end">{{ instrument.topics.length }}</ion-note>
            </ion-item>
            @if (store.canChange(instrument)) {
              <ion-item-options side="end">
                <ion-item-option color="danger" (click)="remove(instrument)">
                  <ion-icon src="{{ 'trash' | svgIcon }}" slot="icon-only" />
                </ion-item-option>
              </ion-item-options>
            }
          </ion-item-sliding>
        } @empty {
          <ion-item lines="none"><ion-label color="medium">{{ store.i18n.empty() }}</ion-label></ion-item>
        }
      </ion-list>

      @if (canAdd()) {
        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button (click)="add()">
            <ion-icon src="{{ 'add' | svgIcon }}" />
          </ion-fab-button>
        </ion-fab>
      }
    </ion-content>
  `,
})
export class InstrumentList {
  protected readonly store = inject(InstrumentStore);
  private readonly router = inject(Router);

  /** Route params. `listId` carries the instrument type (the list partition). */
  public readonly listId = input('swot');
  public readonly contextMenuName = input('');

  protected readonly canAdd = computed(() => this.store.canChange());

  constructor() {
    effect(() => this.store.setType(coerceType(this.listId())));
  }

  protected open(instrument: InstrumentModel): void {
    void this.router.navigate(['/instruments/board', instrument.okey]);
  }

  protected add(): void {
    void this.store.add(!this.store.canChange());
  }

  protected remove(instrument: InstrumentModel): void {
    void this.store.delete(instrument, !this.store.canChange(instrument));
  }
}
