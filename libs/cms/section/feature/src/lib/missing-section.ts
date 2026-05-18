import { Component, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonItem, IonLabel } from '@ionic/angular/standalone';
import { signalStore, withProps } from '@ngrx/signals';

import { I18nService } from '@bk2/shared-i18n';
import { SectionModel } from '@bk2/shared-models';
import { Spinner } from '@bk2/shared-ui';

const MissingSectionStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      no_such_section: '@content.section.error.noSuchSection',
    }),
  })),
);

@Component({
  selector: 'bk-missing-section',
  standalone: true,
  imports: [
    Spinner,
    IonCard, IonCardContent, IonLabel, IonItem
  ],
  providers: [MissingSectionStore],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
    .warning { --background: var(--bk-light-warning-color);}
  `],
  template: `
    @if(section(); as section) {
      <ion-card>
        <ion-card-content>
          <ion-item lines="none" class="warning">
            <ion-label>{{ errorMessage() }}</ion-label>
          </ion-item>
        </ion-card-content>
      </ion-card>
    } @else {
      <bk-spinner />
    }
  `
})
export class MissingSectionComponent {
  private readonly store = inject(MissingSectionStore);
  public section = input<SectionModel>();
  protected errorMessage = computed(() =>
    this.store.i18n.no_such_section().replace('{{ type }}', this.section()?.type ?? '')
  );
}