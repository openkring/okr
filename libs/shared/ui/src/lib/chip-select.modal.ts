import { Component, effect, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { IonChip, IonContent, IonLabel, ModalController } from '@ionic/angular/standalone';
import { filter, map, switchMap } from 'rxjs/operators';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';

import { Header } from './header';
import { I18nService, TranslatePipe } from '@bk2/shared-i18n';
import { AsyncPipe } from '@angular/common';

const ChipSelectStore = signalStore(
  withState({ chipName: '' }),
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps(store => ({
    headerTitle: toSignal(
      toObservable(store.chipName).pipe(
        filter(name => name.length > 0),
        map(name => `@select.${name}`),
        switchMap(key => store.i18nService.translate(key))
      ),
      { initialValue: '' }
    ),
  })),
  withMethods(store => ({
    setChipName(chipName: string): void { patchState(store, { chipName }); },
  })),
);

@Component({
  selector: 'bk-chip-select-modal',
  standalone: true,
  providers: [ChipSelectStore],
  imports: [
    TranslatePipe, AsyncPipe,
    Header,
    IonContent, IonChip, IonLabel
  ],
  template: `
    <bk-header [i18n]="{ title: store.headerTitle() }" [isModal]="true" />
    <ion-content class="ion-padding">
      @for (chip of chips(); track chip) {
        <ion-chip color="primary" (click)="select(chip)">
          <ion-label>{{ chip | translate | async }} </ion-label>
        </ion-chip>
      }
    </ion-content>
  `,
})
export class ChipSelectModal {
  protected readonly store = inject(ChipSelectStore);
  private readonly modalController = inject(ModalController);

  public chips = input.required<string[]>();
  public chipName = input.required<string>();

  constructor() {
    effect(() => this.store.setChipName(this.chipName()));
  }

  public async select(chip: string): Promise<boolean> {
    return await this.modalController.dismiss(chip, 'confirm');
  }
}
