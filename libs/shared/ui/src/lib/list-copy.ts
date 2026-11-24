import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { IonButton, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';

import { I18nService, TranslatePipe } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { fill, LIST_COPY_I18N_KEYS, ListCopyStatus, listCopyTextKey } from '@okr/shared-util-core';

/**
 * Says whether a list (category or tag definition) is shared or the tenant's own copy, offers each
 * entry the copy lacks, and the way back to the shared list.
 */
@Component({
  selector: 'okr-list-copy',
  standalone: true,
  imports: [AsyncPipe, TranslatePipe, SvgIconPipe, IonList, IonItem, IonLabel, IonIcon, IonButton],
  template: `
    <ion-list lines="inset">
      <ion-item lines="none">
        <ion-icon slot="start" src="{{ 'category' | svgIcon }}" />
        <ion-label class="ion-text-wrap">{{ text() }}</ion-label>
      </ion-item>
      @if (!readOnly()) {
        @for (name of status().missing; track name) {
          <ion-item>
            <ion-label class="ion-text-wrap">
              <h3>{{ name }}</h3>
              @if (labels()[name]; as label) {
                <p>{{ label | translate | async }}</p>
              }
            </ion-label>
            <ion-button slot="end" fill="clear" size="small" (click)="add.emit(name)">{{ i18n.add() }}</ion-button>
          </ion-item>
        }
        @if (canRestore() && status().kind === 'copy') {
          <ion-item lines="none" button [detail]="false" (click)="restore.emit()">
            <ion-icon slot="start" src="{{ 'refresh' | svgIcon }}" color="primary" />
            <ion-label color="primary" class="ion-text-wrap">{{ i18n.restore() }}</ion-label>
          </ion-item>
        }
      }
    </ion-list>
  `,
})
export class ListCopy {
  // inputs
  public readonly status = input.required<ListCopyStatus<unknown>>();
  /** i18n key per entry name, shown below the name */
  public readonly labels = input<Record<string, string>>({});
  public readonly canRestore = input(false);
  public readonly readOnly = input(false);

  // outputs
  public readonly add = output<string>();
  public readonly restore = output<void>();

  protected readonly i18n = inject(I18nService).translateAll(LIST_COPY_I18N_KEYS);
  protected readonly text = computed(() => fill(this.i18n[listCopyTextKey(this.status())](), { n: this.status().missing.length }));
}
