import { Component, computed, effect, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { ActivitiesSection, ActivityModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, MoreButton, OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

import { ActivitiesSectionStore } from './activities-section.store';

@Component({
  selector: 'bk-activities-section',
  standalone: true,
  imports: [
    SvgIconPipe,
    OptionalCardHeaderComponent, SpinnerComponent, EmptyListComponent, MoreButton,
    IonCard, IonCardContent, IonItem, IonLabel, IonList, IonIcon,
  ],
  providers: [ActivitiesSectionStore],
  styles: [`
    ion-card { padding: 0; margin: 0; border: 0; box-shadow: none !important; }
    ion-card-content { padding: 0; }
    .scope  { font-size: 0.75rem; color: var(--ion-color-medium); min-width: 70px; }
    .action { font-size: 0.75rem; color: var(--ion-color-medium); min-width: 70px; }
    .author { font-size: 0.85rem; }
    .ts     { font-size: 0.75rem; color: var(--ion-color-medium); }
  `],
  template: `
    @if(store.isLoading()) {
      <bk-spinner />
    } @else {
      <ion-card>
        <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          @if(store.activities().length === 0) {
            <bk-empty-list message="@activity.field.empty" />
          } @else {
            <ion-list lines="inset">
              @for(activity of store.activities(); track activity.bkey) {
                <ion-item (click)="store.view(activity)">
                  <ion-icon slot="start" src="{{ getScopeIcon(activity) | svgIcon }}" />
                  <ion-label class="scope">{{ activity.scope }}</ion-label>
                  <ion-label class="action">{{ activity.action }}</ion-label>
                  <ion-label class="author">{{ activity.author?.name1 }} {{ activity.author?.name2 }}</ion-label>
                  <ion-label class="ts" slot="end">{{ formatTimestamp(activity.timestamp) }}</ion-label>
                </ion-item>
              }
              @if(showMoreButton()) {
                <bk-more-button [url]="moreUrl()" />
              }
            </ion-list>
          }
        </ion-card-content>
      </ion-card>
    }
  `
})
export class ActivitiesSectionComponent {
  protected readonly store = inject(ActivitiesSectionStore);

  public section = input<ActivitiesSection>();
  public editMode = input<boolean>(false);

  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly config = computed(() => this.section()?.properties);
  protected readonly moreUrl = computed(() => this.config()?.moreUrl ?? '');
  protected readonly showMoreButton = computed(() => this.moreUrl().length > 0 && !this.editMode());

  constructor() {
    effect(() => {
      this.store.setConfig(this.config());
    });
  }

  protected formatTimestamp(ts: string): string {
    if (!ts || ts.length !== 14) return ts;
    return convertDateFormatToString(ts, DateFormat.StoreDateTime, DateFormat.ViewDateTime, false);
  }

  protected getScopeIcon(activity: ActivityModel): string {
    const map: Record<string, string> = {
      auth: 'lock-closed', person: 'person', org: 'org', group: 'group',
      membership: 'membership', calevent: 'calendar', task: 'checkbox-circle',
      resource: 'resource', chat: 'chat', rag: 'ai', address: 'location',
      folder: 'folder', calendar: 'calendar', user: 'person',
    };
    return map[activity.scope] ?? 'other';
  }
}
