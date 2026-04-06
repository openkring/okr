import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import {
  IonContent, IonHeader, IonToolbar, IonButtons,
  IonTitle, IonMenuButton, IonIcon, IonItem, IonLabel, IonList,
} from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ActivityModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { convertDateFormatToString, DateFormat, hasRole } from '@bk2/shared-util-core';

import { ActivityStore } from './activity.store';

@Component({
  selector: 'bk-activity-list',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe,
    EmptyListComponent, ListFilterComponent, SpinnerComponent,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonItem, IonLabel, IonList,
  ],
  providers: [ActivityStore],
  styles: [`
    ion-label.scope  { font-size: 0.75rem; color: var(--ion-color-medium); min-width: 80px; }
    ion-label.action { font-size: 0.75rem; color: var(--ion-color-medium); min-width: 80px; }
    ion-label.author { font-size: 0.85rem; }
    ion-label.ts     { font-size: 0.75rem; color: var(--ion-color-medium); text-align: right; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ '@activity.list.title' | translate | async }}</ion-title>
      </ion-toolbar>
      <bk-list-filter
        (searchTermChanged)="store.setSearchTerm($event)"
      />
    </ion-header>

    <ion-content>
      @if(store.isLoading()) {
        <bk-spinner />
      } @else if(store.activities().length === 0) {
        <bk-empty-list message="@activity.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(activity of store.activities(); track activity.bkey) {
            <ion-item (click)="showActions(activity)">
              <ion-icon slot="start" src="{{ getScopeIcon(activity) | svgIcon }}" />
              <ion-label class="scope">{{ activity.scope }}</ion-label>
              <ion-label class="action">{{ activity.action }}</ion-label>
              <ion-label class="author">{{ activity.author?.name1 }} {{ activity.author?.name2 }}</ion-label>
              <ion-label class="ts" slot="end">{{ formatTimestamp(activity.timestamp) }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `
})
export class ActivityListComponent {
  protected readonly store = inject(ActivityStore);

  // inputs
  // no contextmenu nor listId needed

  protected readonly currentUser = computed(() => this.store.currentUser());

  protected formatTimestamp(ts: string): string {
    if (!ts || ts.length !== 14) return ts;
    return convertDateFormatToString(ts, DateFormat.StoreDateTime, DateFormat.ViewDateTime, false);
  }

  protected getScopeIcon(activity: ActivityModel): string {
    const map: Record<string, string> = {
      auth: 'lock-closed', person: 'person', org: 'org', group: 'group',
      membership: 'membership', calevent: 'calendar-number', task: 'checkbox-circle',
      resource: 'resource', chat: 'chatbubble', rag: 'chatbox', address: 'address',
      folder: 'folder', calendar: 'calendar', user: 'admin',
    };
    return map[activity.scope] ?? 'other';
  }

  protected async showActions(activity: ActivityModel): Promise<void> {
    await this.store.view(activity);
  }
}
