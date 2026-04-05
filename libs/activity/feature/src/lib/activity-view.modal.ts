import { AsyncPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonIcon, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ActivityModel } from '@bk2/shared-models';
import { HeaderComponent } from '@bk2/shared-ui';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-activity-view-modal',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe,
    HeaderComponent,
    IonContent, IonItem, IonLabel, IonIcon,
  ],
  styles: [`
    .view-label { font-size: 0.9rem; color: var(--ion-color-medium); margin-bottom: 2px; }
    .view-value { font-size: 1rem; margin-bottom: 8px; }
    ion-item { --padding-start: 0; --inner-padding-end: 0; }
  `],
  template: `
    <bk-header title="@activity.view.title" [isModal]="true" />
    <ion-content class="ion-padding">

      <ion-item lines="none">
        <ion-icon slot="start" src="{{'calendar' | svgIcon}}" />
        <ion-label>
          <p class="view-label">{{ '@activity.field.timestamp' | translate | async }}</p>
          <p class="view-value">{{ timestampView() }}</p>
        </ion-label>
      </ion-item>

      <ion-item lines="none">
        <ion-icon slot="start" src="{{'category' | svgIcon}}" />
        <ion-label>
          <p class="view-label">{{ '@activity.field.scope' | translate | async }}</p>
          <p class="view-value">{{ activity().scope }}</p>
        </ion-label>
      </ion-item>

      <ion-item lines="none">
        <ion-icon slot="start" src="{{'edit' | svgIcon}}" />
        <ion-label>
          <p class="view-label">{{ '@activity.field.action' | translate | async }}</p>
          <p class="view-value">{{ activity().action }}</p>
        </ion-label>
      </ion-item>

      @if(activity().author) {
        <ion-item lines="none">
          <ion-icon slot="start" src="{{'person' | svgIcon}}" />
          <ion-label>
            <p class="view-label">{{ '@activity.field.author' | translate | async }}</p>
            <p class="view-value">{{ activity().author?.name1 }} {{ activity().author?.name2 }}</p>
          </ion-label>
        </ion-item>
      }

      @if(activity().payload) {
        <ion-item lines="none">
          <ion-icon slot="start" src="{{'notes' | svgIcon}}" />
          <ion-label class="ion-text-wrap">
            <p class="view-label">{{ '@activity.field.payload' | translate | async }}</p>
            <p class="view-value">{{ activity().payload }}</p>
          </ion-label>
        </ion-item>
      }

    </ion-content>
  `
})
export class ActivityViewModal {
  private readonly modalController = inject(ModalController);

  public activity = input.required<ActivityModel>();

  protected timestampView(): string {
    const ts = this.activity().timestamp;
    if (!ts || ts.length !== 14) return ts;
    return convertDateFormatToString(ts, DateFormat.StoreDateTime, DateFormat.ViewDateTime, false);
  }

  public async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}
