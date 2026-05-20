import { Component, inject, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonIcon, ModalController } from '@ionic/angular/standalone';

import { ActivityModel } from '@bk2/shared-models';
import { Header } from '@bk2/shared-ui';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

import { ActivityStore } from './activity.store';

@Component({
  selector: 'bk-activity-view-modal',
  standalone: true,
  imports: [
    SvgIconPipe,
    Header,
    IonContent, IonItem, IonLabel, IonIcon,
  ],
  providers: [ActivityStore],
  styles: [`
    .view-label { font-size: 0.9rem; color: var(--ion-color-medium); margin-bottom: 2px; }
    .view-value { font-size: 1rem; margin-bottom: 8px; }
    ion-item { --padding-start: 0; --inner-padding-end: 0; }
  `],
  template: `
    <bk-header [title]="store.i18n.view_title()" [isModal]="true" />
    <ion-content class="ion-padding">

      <ion-item lines="none">
        <ion-icon slot="start" src="{{'calendar' | svgIcon}}" />
        <ion-label>
          <p class="view-label">{{ store.i18n.timestamp() }}</p>
          <p class="view-value">{{ timestampView() }}</p>
        </ion-label>
      </ion-item>

      <ion-item lines="none">
        <ion-icon slot="start" src="{{'category' | svgIcon}}" />
        <ion-label>
          <p class="view-label">{{ store.i18n.scope() }}</p>
          <p class="view-value">{{ activity().scope }}</p>
        </ion-label>
      </ion-item>

      <ion-item lines="none">
        <ion-icon slot="start" src="{{'edit' | svgIcon}}" />
        <ion-label>
          <p class="view-label">{{ store.i18n.action() }}</p>
          <p class="view-value">{{ activity().action }}</p>
        </ion-label>
      </ion-item>

      @if(activity().author) {
        <ion-item lines="none">
          <ion-icon slot="start" src="{{'person' | svgIcon}}" />
          <ion-label>
            <p class="view-label">{{ store.i18n.author() }}</p>
            <p class="view-value">{{ activity().author?.name1 }} {{ activity().author?.name2 }}</p>
          </ion-label>
        </ion-item>
      }

      @if(activity().payload) {
        <ion-item lines="none">
          <ion-icon slot="start" src="{{'text' | svgIcon}}" />
          <ion-label class="ion-text-wrap">
            <p class="view-label">{{ store.i18n.payload() }}</p>
            <p class="view-value">{{ activity().payload }}</p>
          </ion-label>
        </ion-item>
      }

    </ion-content>
  `
})
export class ActivityViewModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(ActivityStore);

  // inputs
  public activity = input.required<ActivityModel>();

  // methods
  protected timestampView(): string {
    const ts = this.activity().timestamp;
    if (!ts || ts.length !== 14) return ts;
    return convertDateFormatToString(ts, DateFormat.StoreDateTime, DateFormat.ViewDateTime, false);
  }

  public async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}
